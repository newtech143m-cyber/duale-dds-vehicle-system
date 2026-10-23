/**
 * Development seed — NON-SENSITIVE demo data only.
 *  - Roles & permissions from @dds/auth (the single source of truth).
 *  - Offices, categories, settings, number sequences.
 *  - A clearly-labelled DEMO tax rule (source = CONFIGURED). It is NOT an
 *    official Ethiopian / Somali Regional State rate.
 *  - Fictional owners and vehicles (only when SEED_DEMO_DATA=true).
 *
 * Staff accounts: create the person in Supabase Auth first, then run with
 *   SEED_ADMIN_AUTH_ID=<supabase user uuid> SEED_ADMIN_EMAIL=<email>
 * to link them as SUPER_ADMIN.
 *
 * Safe to re-run (upserts).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS, type RoleCode } from "@dds/auth";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Set DIRECT_DATABASE_URL (or DATABASE_URL) before seeding.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function seedAccessControl() {
  for (const [code, p] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: p.description, module: p.module },
      create: { code, description: p.description, module: p.module },
    });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.code, p.id]));

  for (const [code, r] of Object.entries(ROLES) as [RoleCode, (typeof ROLES)[RoleCode]][]) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: r.name, requiresMfa: r.requiresMfa, isSystem: true },
      create: { code, name: r.name, requiresMfa: r.requiresMfa, isSystem: true },
    });
    // Reset system-role grants to the matrix.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[code].map((p) => ({ roleId: role.id, permissionId: permId.get(p)! })),
    });
  }
  console.log(`✔ ${perms.length} permissions, ${Object.keys(ROLES).length} roles`);
}

async function seedReference() {
  const offices = [
    { code: "JJG-HQ", name: "Jigjiga Head Office (demo)", region: "Somali", zone: "Fafan" },
    { code: "DGH-01", name: "Degehabur Branch (demo)", region: "Somali", zone: "Jarar" },
    { code: "GDE-01", name: "Gode Branch (demo)", region: "Somali", zone: "Shabelle" },
  ];
  for (const o of offices) {
    await prisma.registrationOffice.upsert({ where: { code: o.code }, update: o, create: o });
  }
  const categories = [
    ["CAR", "Automobile"], ["PICKUP", "Pickup"], ["MINIBUS", "Minibus"], ["BUS", "Bus"],
    ["TRUCK", "Truck"], ["MOTORCYCLE", "Motorcycle"], ["BAJAJ", "Three-wheeler (Bajaj)"], ["TRAILER", "Trailer"],
  ] as const;
  for (const [code, name] of categories) {
    await prisma.vehicleCategory.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  const settings: [string, unknown, string][] = [
    ["office.timezone", "Africa/Addis_Ababa", "Display timezone for dates"],
    ["tax.yearStartMonth", 1, "First month of the tax year (1-12). CONFIRM against official regulation."],
    ["verify.requireReason", false, "Require officers to enter a reason for each plate search"],
    ["verify.rateLimitPerMinute", 30, "Max plate searches per officer per minute"],
    ["files.signedUrlTtlSeconds", 300, "Lifetime of signed photo/document URLs"],
    ["files.retentionDays", 3650, "Days before removed files are purged from storage"],
    ["i18n.defaultLocale", "so", "Default UI language (en, so, am)"],
  ];
  for (const [key, value, description] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { description },
      create: { key, value: value as never, description },
    });
  }

  const year = new Date().getUTCFullYear();
  for (const s of [
    { name: `receipt-${year}`, prefix: `RCPT-${year}-`, padding: 6 },
    { name: `verification-${year}`, prefix: `VER-${year}-`, padding: 6 },
  ]) {
    await prisma.numberSequence.upsert({ where: { name: s.name }, update: {}, create: s });
  }
  console.log("✔ offices, categories, settings, sequences");
}

async function seedAdmin() {
  const authUserId = process.env.SEED_ADMIN_AUTH_ID;
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!authUserId || !email) {
    console.log("• Skipping admin link (set SEED_ADMIN_AUTH_ID and SEED_ADMIN_EMAIL)");
    return null;
  }
  const hq = await prisma.registrationOffice.findUniqueOrThrow({ where: { code: "JJG-HQ" } });
  const user = await prisma.user.upsert({
    where: { authUserId },
    update: {},
    create: { authUserId, email, fullName: process.env.SEED_ADMIN_NAME ?? "System Administrator", officeId: hq.id, mfaRequired: true },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  const existing = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id, revokedAt: null } });
  if (!existing) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  console.log(`✔ linked ${email} as SUPER_ADMIN`);
  return user;
}

async function seedDemoData(actorId: string | null) {
  if (process.env.SEED_DEMO_DATA !== "true") {
    console.log("• Skipping demo vehicles (set SEED_DEMO_DATA=true)");
    return;
  }
  const year = new Date().getUTCFullYear();
  const hq = await prisma.registrationOffice.findUniqueOrThrow({ where: { code: "JJG-HQ" } });
  const car = await prisma.vehicleCategory.findUniqueOrThrow({ where: { code: "CAR" } });
  const pickup = await prisma.vehicleCategory.findUniqueOrThrow({ where: { code: "PICKUP" } });

  // DEMO rule — CONFIGURED, explicitly not official.
  const ruleName = `DEMO ${year} — not an official rate`;
  const rule =
    (await prisma.taxRule.findFirst({ where: { name: ruleName } })) ??
    (await prisma.taxRule.create({
      data: {
        name: ruleName, taxYear: year, amount: "1000.00", dueDate: new Date(Date.UTC(year, 5, 30)),
        allowPartial: false, source: "CONFIGURED",
        penaltyNote: "Demo only. Replace with the officially approved schedule before production.",
      },
    }));

  const demo = [
    { plate: "DEMO-01", name: "Demo Owner One", cat: car.id, make: "Toyota", model: "Corolla", color: "White", paid: true, validYears: 1 },
    { plate: "DEMO-02", name: "Demo Owner Two", cat: pickup.id, make: "Toyota", model: "Hilux", color: "Silver", paid: false, validYears: 1 },
    { plate: "DEMO-03", name: "Demo Owner Three", cat: car.id, make: "Suzuki", model: "Dzire", color: "Blue", paid: false, validYears: -1 },
  ];

  for (const [i, d] of demo.entries()) {
    const exists = await prisma.vehicle.findFirst({ where: { plateNormalized: d.plate, archivedAt: null } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const owner = await tx.owner.create({
        data: { ownerType: "INDIVIDUAL", fullLegalName: d.name, searchName: d.name.toLowerCase(), locality: "Jigjiga", createdById: actorId },
      });
      const vehicle = await tx.vehicle.create({
        data: {
          plateNumber: d.plate, plateNormalized: d.plate, categoryId: d.cat, make: d.make, model: d.model,
          color: d.color, usage: "PRIVATE", fuelType: "PETROL", manufactureYear: 2018 + i,
          vin: `DEMOVIN000000000${i + 1}`, currentOwnerId: owner.id, officeId: hq.id, createdById: actorId,
        },
      });
      await tx.ownershipRecord.create({ data: { vehicleId: vehicle.id, ownerId: owner.id, startDate: new Date(), recordedById: actorId } });
      const from = new Date();
      await tx.registration.create({
        data: {
          vehicleId: vehicle.id, certificateNumber: `DEMO-CERT-${i + 1}`, officeId: hq.id, registeringOfficerId: actorId,
          registeredAt: from, validFrom: new Date(Date.UTC(from.getUTCFullYear() - 1, 0, 1)),
          validUntil: new Date(Date.UTC(from.getUTCFullYear() + d.validYears, 0, 1)), status: "ACTIVE", createdById: actorId,
        },
      });
      const assessment = await tx.taxAssessment.create({
        data: { vehicleId: vehicle.id, taxYear: year, taxRuleId: rule.id, amountDue: rule.amount, dueDate: rule.dueDate, allowPartial: rule.allowPartial, createdById: actorId },
      });
      if (d.paid && actorId) {
        const payment = await tx.taxPayment.create({
          data: { paymentReference: `DEMO-PAY-${i + 1}`, vehicleId: vehicle.id, officeId: hq.id, amount: rule.amount, method: "CASH", paidAt: new Date(), collectedById: actorId },
        });
        await tx.paymentAllocation.create({ data: { paymentId: payment.id, assessmentId: assessment.id, amount: rule.amount } });
      }
    });
  }
  console.log(`✔ ${demo.length} demo vehicles (payments only recorded when an admin is linked)`);
}

async function main() {
  await seedAccessControl();
  await seedReference();
  const admin = await seedAdmin();
  await seedDemoData(admin?.id ?? null);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
