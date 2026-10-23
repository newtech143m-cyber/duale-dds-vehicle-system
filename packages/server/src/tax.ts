import "server-only";
import { prisma, Prisma } from "@dds/database";
import {
  computeTaxStatus, currentTaxYear, selectTaxRule, toCents, fromCents, validatePaymentAmount,
  type TaxStatusResult,
} from "@dds/domain";
import { exemptionInputSchema, reversalInputSchema, taxPaymentInputSchema, taxRuleInputSchema } from "@dds/validation";
import { audit, getSetting, mapUniqueViolation, nextSequence, UserError } from "./core";
import type { Staff } from "./session";

export async function activeTaxYear(now = new Date()): Promise<number> {
  return currentTaxYear(now, await getSetting<number>("tax.yearStartMonth", 1));
}

// ---------------------------------------------------------------------------
// Rules (all configurable — no rates in code)
// ---------------------------------------------------------------------------

export async function createTaxRule(staff: Staff, raw: unknown) {
  const input = taxRuleInputSchema.parse(raw);
  if (input.source === "VERIFIED_OFFICIAL" && !staff.permissions.has("tax.rule.verify")) throw new UserError("common.forbidden");
  return prisma.$transaction(async (tx) => {
    const rule = await tx.taxRule.create({
      data: {
        name: input.name, taxYear: input.taxYear, categoryId: input.categoryId ?? null, usage: input.usage ?? null,
        amount: new Prisma.Decimal(input.amount), dueDate: input.dueDate, allowPartial: input.allowPartial,
        source: input.source, legalReference: input.legalReference ?? null, penaltyNote: input.penaltyNote ?? null,
        priority: input.priority,
        approvedById: input.source === "VERIFIED_OFFICIAL" ? staff.id : null,
        approvedAt: input.source === "VERIFIED_OFFICIAL" ? new Date() : null,
        createdById: staff.id, updatedById: staff.id,
      },
    });
    await audit({ actorId: staff.id, action: "tax.rule.create", entityType: "tax_rule", entityId: rule.id, metadata: { year: rule.taxYear, amount: rule.amount.toString(), source: rule.source } }, tx);
    return rule;
  });
}

export async function setTaxRuleActive(staff: Staff, id: string, isActive: boolean) {
  await prisma.$transaction(async (tx) => {
    await tx.taxRule.update({ where: { id }, data: { isActive, updatedById: staff.id } });
    await audit({ actorId: staff.id, action: isActive ? "tax.rule.activate" : "tax.rule.deactivate", entityType: "tax_rule", entityId: id }, tx);
  });
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

async function ruleFor(vehicle: { categoryId: string; usage: string }, year: number) {
  const rules = await prisma.taxRule.findMany({ where: { taxYear: year, isActive: true } });
  return selectTaxRule(
    rules.map((r) => ({ ...r, amount: r.amount.toString() })),
    vehicle, year,
  );
}

export async function assessVehicle(staff: Staff, vehicleId: string, year: number) {
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  if (vehicle.archivedAt) throw new UserError("validation.archived");
  const sel = await ruleFor(vehicle, year);
  if (!sel.ok) throw new UserError(sel.reason === "NO_RULE" ? "tax.noRule" : "tax.ambiguousRule");
  try {
    return await prisma.$transaction(async (tx) => {
      const a = await tx.taxAssessment.create({
        data: {
          vehicleId, taxYear: year, taxRuleId: sel.rule.id, amountDue: new Prisma.Decimal(sel.rule.amount),
          dueDate: sel.rule.dueDate, allowPartial: sel.rule.allowPartial, createdById: staff.id, updatedById: staff.id,
        },
      });
      await audit({ actorId: staff.id, action: "tax.assess", entityType: "tax_assessment", entityId: a.id, metadata: { vehicleId, year, amount: sel.rule.amount } }, tx);
      return a;
    });
  } catch (e) {
    throw mapUniqueViolation(e) ?? e;
  }
}

/** Assess every active vehicle that has no assessment for the year. Returns counts. */
export async function bulkAssess(staff: Staff, year: number) {
  const vehicles = await prisma.vehicle.findMany({
    where: { archivedAt: null, assessments: { none: { taxYear: year, cancelledAt: null } } },
    select: { id: true },
  });
  let created = 0, skipped = 0;
  for (const v of vehicles) {
    try { await assessVehicle(staff, v.id, year); created++; } catch { skipped++; }
  }
  await audit({ actorId: staff.id, action: "tax.assess.bulk", entityType: "tax_assessment", metadata: { year, created, skipped } });
  return { created, skipped };
}

export async function exemptAssessment(staff: Staff, raw: unknown) {
  const input = exemptionInputSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    await tx.taxAssessment.update({
      where: { id: input.assessmentId },
      data: { exemptedAt: new Date(), exemptedById: staff.id, exemptionReason: input.reason, exemptionRef: input.exemptionRef, updatedById: staff.id },
    });
    await audit({ actorId: staff.id, action: "tax.exempt", entityType: "tax_assessment", entityId: input.assessmentId, metadata: { ref: input.exemptionRef ?? null } }, tx);
  });
}

type AssessmentWithAlloc = Prisma.TaxAssessmentGetPayload<{ include: { allocations: { include: { payment: true } } } }>;

export function statusOf(a: AssessmentWithAlloc | null | undefined, now = new Date()): TaxStatusResult {
  return computeTaxStatus(
    a ? { amountDue: a.amountDue.toString(), dueDate: a.dueDate, allowPartial: a.allowPartial, exemptedAt: a.exemptedAt, underReview: a.underReview, cancelledAt: a.cancelledAt } : null,
    (a?.allocations ?? []).map((x) => ({ amount: x.amount.toString(), paymentStatus: x.payment.status })),
    now,
  );
}

export async function vehicleTaxStatus(vehicleId: string, year: number) {
  const a = await prisma.taxAssessment.findFirst({
    where: { vehicleId, taxYear: year, cancelledAt: null },
    include: { allocations: { include: { payment: true } } },
  });
  return { assessment: a, status: statusOf(a) };
}

// ---------------------------------------------------------------------------
// Payments (transactional, append-only)
// ---------------------------------------------------------------------------

export async function recordPayment(staff: Staff, raw: unknown) {
  const input = taxPaymentInputSchema.parse(raw);
  if (!staff.officeId) throw new UserError("validation.noOffice");
  try {
    return await prisma.$transaction(async (tx) => {
      // Lock the assessment row so two cashiers cannot over-collect concurrently.
      await tx.$queryRaw`SELECT id FROM tax_assessments WHERE id = ${input.assessmentId}::uuid FOR UPDATE`;
      const a = await tx.taxAssessment.findUniqueOrThrow({
        where: { id: input.assessmentId },
        include: { allocations: { include: { payment: true } } },
      });
      if (a.vehicleId !== input.vehicleId || a.cancelledAt) throw new UserError("validation.invalidAssessment");
      const check = validatePaymentAmount(statusOf(a), input.amount, a.allowPartial);
      if (!check.ok) throw new UserError(`validation.payment.${check.error}`, "amount");

      const payment = await tx.taxPayment.create({
        data: {
          paymentReference: input.paymentReference.trim(), vehicleId: input.vehicleId, officeId: staff.officeId!,
          amount: new Prisma.Decimal(input.amount), method: input.method, externalRef: input.externalRef ?? null,
          paidAt: input.paidAt, collectedById: staff.id,
        },
      });
      await tx.paymentAllocation.create({ data: { paymentId: payment.id, assessmentId: a.id, amount: payment.amount } });
      const receiptNumber = await nextSequence(tx, "receipt");
      const receipt = await tx.taxReceipt.create({ data: { receiptNumber, paymentId: payment.id, issuedById: staff.id } });
      await audit({
        actorId: staff.id, action: "tax.payment.record", entityType: "tax_payment", entityId: payment.id,
        metadata: { vehicleId: input.vehicleId, assessmentId: a.id, amount: fromCents(toCents(input.amount)), receipt: receiptNumber },
      }, tx);
      return { payment, receipt };
    });
  } catch (e) {
    throw mapUniqueViolation(e) ?? e;
  }
}

export async function reversePayment(staff: Staff, raw: unknown) {
  const input = reversalInputSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    const p = await tx.taxPayment.findUniqueOrThrow({ where: { id: input.paymentId }, include: { receipt: true } });
    if (p.status === "REVERSED") throw new UserError("validation.alreadyReversed");
    await tx.taxPayment.update({
      where: { id: p.id },
      data: { status: "REVERSED", reversedAt: new Date(), reversedById: staff.id, reversalReason: input.reason },
    });
    if (p.receipt && !p.receipt.voidedAt) {
      await tx.taxReceipt.update({ where: { id: p.receipt.id }, data: { voidedAt: new Date(), voidedById: staff.id, voidReason: input.reason } });
    }
    await audit({ actorId: staff.id, action: "tax.payment.reverse", entityType: "tax_payment", entityId: p.id, metadata: { receipt: p.receipt?.receiptNumber ?? null } }, tx);
  });
}
