import "server-only";
import { prisma } from "@dds/database";
import { computeVerificationStatuses, effectiveRegistrationStatus, missingEssentials } from "@dds/domain";
import { checkPlate, reviewRequestSchema, verifySearchSchema } from "@dds/validation";
import { audit, getSetting, nextSequence, rateLimit, requestIpHash, UserError } from "./core";
import { ownerDisplayName } from "./registry";
import { activeTaxYear, statusOf } from "./tax";
import { projectVerification, type VerificationOutcome } from "./verify-projection";
import type { Staff } from "./session";

/**
 * Exact, normalized plate lookup. Returns only what the officer's role may see,
 * logs a verification event, and never creates or alters vehicle records.
 */
export async function verifyPlate(staff: Staff, raw: unknown): Promise<VerificationOutcome> {
  if (!staff.permissions.has("verify.search")) throw new UserError("common.forbidden");
  const input = verifySearchSchema.parse(raw);
  const plate = checkPlate(input.plate);
  if (!plate.ok) throw new UserError(`validation.plate.${plate.error}`, "plate");

  const requireReason = await getSetting<boolean>("verify.requireReason", false);
  if (requireReason && !input.reason) throw new UserError("validation.reasonRequired", "reason");
  const limit = await getSetting<number>("verify.rateLimitPerMinute", Number(process.env.VERIFY_RATE_LIMIT_PER_MINUTE ?? 30));
  if (!(await rateLimit(`verify:${staff.id}`, limit))) throw new UserError("auth.rateLimited");

  const matches = await prisma.vehicle.findMany({
    where: { plateNormalized: plate.normalized, archivedAt: null },
    include: {
      category: true,
      currentOwner: true,
      photos: { where: { angle: "PRIMARY", removedAt: null }, take: 1 },
      registrations: { where: { status: { not: "CANCELLED" } }, orderBy: { registeredAt: "desc" }, take: 1, include: { office: true } },
      reviews: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } },
    },
    take: 2,
  });

  const now = new Date();
  const year = await activeTaxYear(now);
  const ipHash = await requestIpHash();

  const record = (vehicleId: string | null, statuses: string[]) =>
    prisma.$transaction(async (tx) => {
      const reference = await nextSequence(tx, "verification");
      await tx.verificationEvent.createMany({
        data: {
          reference, officerId: staff.id, plateQuery: input.plate.slice(0, 40), plateNormalized: plate.normalized,
          vehicleId, statuses, reason: input.reason ?? null, location: input.location ?? null, ipHash,
        },
      });
      await audit({ actorId: staff.id, action: "verify.search", entityType: "vehicle", entityId: vehicleId, metadata: { reference, statuses } }, tx);
      return reference;
    });

  if (matches.length !== 1) {
    const statuses = computeVerificationStatuses({
      matchCount: matches.length, registration: "NONE", taxStatus: null, missing: [], recordUnderReview: false, openReviewRequests: 0,
    });
    if (matches.length > 1) {
      // Duplicate active plates: flag automatically, show no record.
      await prisma.reviewRequest.createMany({
        data: { source: "SYSTEM", plateQuery: plate.normalized, submittedById: staff.id, description: `Duplicate active records for plate ${plate.normalized} detected during verification.` },
      });
    }
    const reference = await record(null, statuses);
    return { kind: matches.length === 0 ? "not_found" : "ambiguous", reference, statuses, plate: plate.normalized, checkedAt: now };
  }

  const v = matches[0]!;
  const reg = v.registrations[0] ?? null;
  const regStatus = effectiveRegistrationStatus(reg ? { status: reg.status, validUntil: reg.validUntil } : null, now);
  const assessment = await prisma.taxAssessment.findFirst({
    where: { vehicleId: v.id, taxYear: year, cancelledAt: null },
    include: { allocations: { include: { payment: { include: { receipt: true } } } } },
  });
  const tax = statusOf(assessment, now);
  const lastPayment = (assessment?.allocations ?? [])
    .map((a) => a.payment).filter((p) => p.status === "POSTED")
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0];

  const ownerName = ownerDisplayName(v.currentOwner);
  const missing = missingEssentials({
    plateNumber: v.plateNumber, make: v.make, model: v.model, categoryId: v.categoryId, vin: v.vin, color: v.color,
    hasPrimaryPhoto: v.photos.length > 0, owner: { displayName: ownerName === "—" ? null : ownerName, phone: v.currentOwner.phone },
    hasActiveOrExpiredRegistration: regStatus === "ACTIVE" || regStatus === "EXPIRED",
  });
  const statuses = computeVerificationStatuses({
    matchCount: 1, registration: regStatus, taxStatus: tax.status, missing,
    recordUnderReview: v.recordStatus === "UNDER_REVIEW", openReviewRequests: v.reviews.length,
  });

  const data = projectVerification(
    {
      vehicle: {
        plateNumber: v.plateNumber, make: v.make, model: v.model, color: v.color, manufactureYear: v.manufactureYear,
        category: v.category.name, vin: v.vin, primaryPhotoId: v.photos[0]?.fileId ?? null,
      },
      registration: reg ? { status: regStatus, certificateNumber: reg.certificateNumber, validUntil: reg.validUntil, officeName: reg.office.name } : null,
      owner: {
        displayName: ownerName, ownerType: v.currentOwner.ownerType, photoId: v.currentOwner.photoFileId,
        phone: v.currentOwner.phone, locality: v.currentOwner.locality, nationalIdRef: v.currentOwner.nationalIdRef,
      },
      tax: { year, status: tax.status, balance: tax.balance, lastPaymentAt: lastPayment?.paidAt ?? null, lastReceipt: lastPayment?.receipt?.receiptNumber ?? null },
    },
    staff.permissions,
  );

  const reference = await record(v.id, statuses);
  return { kind: "found", reference, statuses, data, checkedAt: now };
}

export async function submitReviewRequest(staff: Staff, raw: unknown) {
  if (!staff.permissions.has("verify.review.submit") && !staff.permissions.has("review.read")) throw new UserError("common.forbidden");
  const input = reviewRequestSchema.parse(raw);
  const event = input.verificationRef
    ? await prisma.verificationEvent.findUnique({ where: { reference: input.verificationRef } })
    : null;
  if (event && event.officerId !== staff.id) throw new UserError("common.forbidden");
  const r = await prisma.reviewRequest.create({
    data: {
      source: staff.permissions.has("verify.search") ? "VERIFICATION_PORTAL" : "REGISTRATION_PORTAL",
      plateQuery: input.plateQuery ?? event?.plateNormalized ?? null, vehicleId: event?.vehicleId ?? null,
      verificationRef: input.verificationRef ?? null, submittedById: staff.id, description: input.description,
    },
  });
  await audit({ actorId: staff.id, action: "review.submit", entityType: "review_request", entityId: r.id });
  return r;
}
