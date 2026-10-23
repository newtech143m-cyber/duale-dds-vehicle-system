import "server-only";
import { z } from "zod";
import { prisma } from "@dds/database";
import { audit, mapUniqueViolation, UserError } from "./core";
import type { Staff } from "./session";

const staffInput = z.object({
  email: z.email({ error: "validation.email" }).transform((e) => e.toLowerCase().trim()),
  fullName: z.string().trim().min(2, { error: "validation.required" }).max(200),
  officeId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  roleCodes: z.array(z.string()).min(1, { error: "validation.roleRequired" }),
});

/**
 * Pre-register a staff member. The person signs in with the Supabase account created
 * for the same email; the records are linked on first sign-in.
 */
export async function inviteStaff(actor: Staff, raw: unknown) {
  const input = staffInput.parse(raw);
  const roles = await prisma.role.findMany({ where: { code: { in: input.roleCodes } } });
  if (roles.length !== input.roleCodes.length) throw new UserError("validation.roleRequired");
  // Only a super admin may grant super admin.
  if (roles.some((r) => r.code === "SUPER_ADMIN") && !actor.roles.includes("SUPER_ADMIN")) throw new UserError("common.forbidden");
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email, fullName: input.fullName, officeId: input.officeId ?? null,
          mfaRequired: roles.some((r) => r.requiresMfa), createdById: actor.id, updatedById: actor.id,
        },
      });
      for (const r of roles) await tx.userRole.create({ data: { userId: user.id, roleId: r.id, grantedById: actor.id } });
      await audit({ actorId: actor.id, action: "staff.invite", entityType: "user", entityId: user.id, metadata: { roles: input.roleCodes } }, tx);
      return user;
    });
  } catch (e) {
    throw mapUniqueViolation(e) ?? e;
  }
}

export async function setStaffRoles(actor: Staff, userId: string, roleCodes: string[]) {
  if (userId === actor.id) throw new UserError("validation.cannotEditSelf");
  const roles = await prisma.role.findMany({ where: { code: { in: roleCodes } } });
  if (roles.some((r) => r.code === "SUPER_ADMIN") && !actor.roles.includes("SUPER_ADMIN")) throw new UserError("common.forbidden");
  await prisma.$transaction(async (tx) => {
    const current = await tx.userRole.findMany({ where: { userId, revokedAt: null }, include: { role: true } });
    const keep = new Set(roles.map((r) => r.id));
    for (const c of current) if (!keep.has(c.roleId)) await tx.userRole.update({ where: { id: c.id }, data: { revokedAt: new Date() } });
    const have = new Set(current.map((c) => c.roleId));
    for (const r of roles) if (!have.has(r.id)) await tx.userRole.create({ data: { userId, roleId: r.id, grantedById: actor.id } });
    await tx.user.update({ where: { id: userId }, data: { mfaRequired: roles.some((r) => r.requiresMfa), updatedById: actor.id } });
    await audit({ actorId: actor.id, action: "staff.roles.set", entityType: "user", entityId: userId, metadata: { roles: roleCodes } }, tx);
  });
}

export async function setStaffStatus(actor: Staff, userId: string, suspend: boolean, reason?: string) {
  if (userId === actor.id) throw new UserError("validation.cannotEditSelf");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: suspend
        ? { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: reason ?? null, updatedById: actor.id }
        : { status: "ACTIVE", suspendedAt: null, suspendedReason: null, updatedById: actor.id },
    });
    await audit({ actorId: actor.id, action: suspend ? "staff.suspend" : "staff.reactivate", entityType: "user", entityId: userId }, tx);
  });
}

export async function resolveReview(actor: Staff, id: string, outcome: "RESOLVED" | "REJECTED", resolution: string) {
  if (!resolution || resolution.trim().length < 5) throw new UserError("validation.reasonTooShort", "resolution");
  await prisma.$transaction(async (tx) => {
    await tx.reviewRequest.update({ where: { id }, data: { status: outcome, resolution: resolution.trim(), resolvedById: actor.id, resolvedAt: new Date() } });
    await audit({ actorId: actor.id, action: `review.${outcome.toLowerCase()}`, entityType: "review_request", entityId: id }, tx);
  });
}
