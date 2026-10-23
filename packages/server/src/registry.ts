import "server-only";
import { prisma, Prisma } from "@dds/database";
import {
  normalizeIdentifier, normalizeName, normalizePlate,
  ownerInputSchema, ownershipTransferSchema, registrationInputSchema, vehicleInputSchema,
  type OwnerInput, type RegistrationInput, type VehicleInput,
} from "@dds/validation";
import { audit, mapUniqueViolation, UserError } from "./core";
import type { Staff } from "./session";

function rethrow(e: unknown): never {
  throw mapUniqueViolation(e) ?? e;
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

function ownerData(input: OwnerInput) {
  if (input.ownerType === "INDIVIDUAL") {
    return {
      ownerType: input.ownerType, fullLegalName: input.fullLegalName, nationalIdRef: input.nationalIdRef ?? null,
      businessName: null, businessRegNumber: null, authorizedRepName: null, authorizedRepPhone: null,
      searchName: normalizeName(input.fullLegalName),
      phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null, locality: input.locality ?? null, notes: input.notes ?? null,
    };
  }
  return {
    ownerType: input.ownerType, fullLegalName: null, nationalIdRef: null,
    businessName: input.businessName, businessRegNumber: normalizeIdentifier(input.businessRegNumber),
    authorizedRepName: input.authorizedRepName, authorizedRepPhone: input.authorizedRepPhone ?? null,
    searchName: normalizeName(`${input.businessName} ${input.authorizedRepName}`),
    phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null, locality: input.locality ?? null, notes: input.notes ?? null,
  };
}

export async function createOwner(staff: Staff, raw: unknown) {
  const input = ownerInputSchema.parse(raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const owner = await tx.owner.create({ data: { ...ownerData(input), createdById: staff.id, updatedById: staff.id } });
      await audit({ actorId: staff.id, action: "owner.create", entityType: "owner", entityId: owner.id, metadata: { ownerType: owner.ownerType } }, tx);
      return owner;
    });
  } catch (e) { rethrow(e); }
}

export async function updateOwner(staff: Staff, id: string, raw: unknown) {
  const input = ownerInputSchema.parse(raw);
  const before = await prisma.owner.findUniqueOrThrow({ where: { id } });
  const data = ownerData(input);
  const changed = Object.keys(data).filter((k) => (before as Record<string, unknown>)[k] !== (data as Record<string, unknown>)[k]);
  try {
    return await prisma.$transaction(async (tx) => {
      const owner = await tx.owner.update({ where: { id }, data: { ...data, updatedById: staff.id } });
      await audit({ actorId: staff.id, action: "owner.update", entityType: "owner", entityId: id, metadata: { changed } }, tx);
      return owner;
    });
  } catch (e) { rethrow(e); }
}

export async function archiveOwner(staff: Staff, id: string) {
  const active = await prisma.vehicle.count({ where: { currentOwnerId: id, archivedAt: null } });
  if (active > 0) throw new UserError("validation.ownerHasVehicles");
  await prisma.$transaction(async (tx) => {
    await tx.owner.update({ where: { id }, data: { archivedAt: new Date(), updatedById: staff.id } });
    await audit({ actorId: staff.id, action: "owner.archive", entityType: "owner", entityId: id }, tx);
  });
}

export function ownerDisplayName(o: { ownerType: string; fullLegalName: string | null; businessName: string | null }) {
  return (o.ownerType === "BUSINESS" ? o.businessName : o.fullLegalName) ?? "—";
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

function vehicleData(input: VehicleInput) {
  return {
    plateNumber: input.plateNumber.trim().replace(/\s+/g, " ").toUpperCase(),
    plateNormalized: normalizePlate(input.plateNumber),
    previousPlate: input.previousPlate ?? null,
    vin: input.vin ? normalizeIdentifier(input.vin) : null,
    engineNumber: input.engineNumber ? normalizeIdentifier(input.engineNumber) : null,
    categoryId: input.categoryId,
    make: input.make,
    model: input.model,
    manufactureYear: input.manufactureYear ?? null,
    color: input.color ?? null,
    fuelType: input.fuelType ?? null,
    transmission: input.transmission ?? null,
    usage: input.usage,
    passengerCapacity: input.passengerCapacity ?? null,
    loadCapacityKg: input.loadCapacityKg ? new Prisma.Decimal(input.loadCapacityKg) : null,
    officeId: input.officeId,
  };
}

async function assertIdentifiersFree(data: { plateNormalized: string; vin: string | null }, exceptId?: string) {
  const plate = await prisma.vehicle.findFirst({ where: { plateNormalized: data.plateNormalized, archivedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  if (plate) throw new UserError("vehicle.duplicatePlate", "plateNumber");
  if (data.vin) {
    const vin = await prisma.vehicle.findFirst({ where: { vin: data.vin, archivedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
    if (vin) throw new UserError("vehicle.duplicateVin", "vin");
  }
}

export async function createVehicle(staff: Staff, raw: unknown) {
  const input = vehicleInputSchema.parse(raw);
  const data = vehicleData(input);
  await assertIdentifiersFree(data);
  try {
    return await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: { ...data, currentOwnerId: input.currentOwnerId, createdById: staff.id, updatedById: staff.id },
      });
      await tx.ownershipRecord.create({
        data: { vehicleId: vehicle.id, ownerId: input.currentOwnerId, startDate: new Date(), transferReason: "Initial registration", recordedById: staff.id },
      });
      await audit({ actorId: staff.id, action: "vehicle.create", entityType: "vehicle", entityId: vehicle.id, metadata: { plate: vehicle.plateNormalized } }, tx);
      return vehicle;
    });
  } catch (e) { rethrow(e); }
}

export async function updateVehicle(staff: Staff, id: string, raw: unknown) {
  const input = vehicleInputSchema.parse(raw);
  const before = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
  if (before.archivedAt) throw new UserError("validation.archived");
  if (input.currentOwnerId !== before.currentOwnerId) throw new UserError("validation.useTransfer", "currentOwnerId");
  const data = vehicleData(input);
  await assertIdentifiersFree(data, id);
  const changed = Object.keys(data).filter((k) => String((before as Record<string, unknown>)[k] ?? "") !== String((data as Record<string, unknown>)[k] ?? ""));
  try {
    return await prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.update({
        where: { id },
        data: { ...data, previousPlate: data.plateNormalized !== before.plateNormalized ? before.plateNumber : data.previousPlate, updatedById: staff.id },
      });
      await audit({ actorId: staff.id, action: "vehicle.update", entityType: "vehicle", entityId: id, metadata: { changed } }, tx);
      return v;
    });
  } catch (e) { rethrow(e); }
}

export async function archiveVehicle(staff: Staff, id: string, reason: string) {
  if (!reason || reason.trim().length < 10) throw new UserError("validation.reasonTooShort", "reason");
  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id }, data: { archivedAt: new Date(), archivedReason: reason.trim(), recordStatus: "ARCHIVED", updatedById: staff.id } });
    await audit({ actorId: staff.id, action: "vehicle.archive", entityType: "vehicle", entityId: id, metadata: { reason: reason.trim() } }, tx);
  });
}

export async function transferOwnership(staff: Staff, raw: unknown) {
  const input = ownershipTransferSchema.parse(raw);
  await prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
    if (v.archivedAt) throw new UserError("validation.archived");
    if (v.currentOwnerId === input.newOwnerId) throw new UserError("validation.sameOwner", "newOwnerId");
    const owner = await tx.owner.findUniqueOrThrow({ where: { id: input.newOwnerId } });
    if (owner.archivedAt) throw new UserError("validation.archived", "newOwnerId");
    // Close the current record, never overwrite it.
    await tx.ownershipRecord.updateMany({ where: { vehicleId: v.id, endDate: null }, data: { endDate: input.transferDate } });
    await tx.ownershipRecord.create({
      data: { vehicleId: v.id, ownerId: input.newOwnerId, startDate: input.transferDate, transferReason: input.transferReason, transferRef: input.transferRef, recordedById: staff.id },
    });
    await tx.vehicle.update({ where: { id: v.id }, data: { currentOwnerId: input.newOwnerId, updatedById: staff.id } });
    await audit({ actorId: staff.id, action: "ownership.transfer", entityType: "vehicle", entityId: v.id, metadata: { from: v.currentOwnerId, to: input.newOwnerId, ref: input.transferRef ?? null } }, tx);
  });
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export async function addRegistration(staff: Staff, raw: unknown) {
  const input: RegistrationInput = registrationInputSchema.parse(raw);
  try {
    return await prisma.$transaction(async (tx) => {
      // A new ACTIVE registration supersedes any previous active one.
      await tx.registration.updateMany({ where: { vehicleId: input.vehicleId, status: "ACTIVE" }, data: { status: "EXPIRED", updatedById: staff.id } });
      const r = await tx.registration.create({
        data: {
          vehicleId: input.vehicleId, certificateNumber: input.certificateNumber.trim().toUpperCase(), officeId: input.officeId,
          registeringOfficerId: staff.id, registeredAt: input.registeredAt, validFrom: input.validFrom, validUntil: input.validUntil ?? null,
          status: "ACTIVE", notes: input.notes, createdById: staff.id, updatedById: staff.id,
        },
      });
      await audit({ actorId: staff.id, action: "registration.create", entityType: "registration", entityId: r.id, metadata: { vehicleId: input.vehicleId, certificate: r.certificateNumber } }, tx);
      return r;
    });
  } catch (e) { rethrow(e); }
}

export async function cancelRegistration(staff: Staff, id: string, reason: string) {
  if (!reason || reason.trim().length < 10) throw new UserError("validation.reasonTooShort", "reason");
  await prisma.$transaction(async (tx) => {
    await tx.registration.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledReason: reason.trim(), updatedById: staff.id } });
    await audit({ actorId: staff.id, action: "registration.cancel", entityType: "registration", entityId: id, metadata: { reason: reason.trim() } }, tx);
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface VehicleSearch {
  q?: string;
  categoryId?: string;
  status?: "ACTIVE" | "ARCHIVED" | "UNDER_REVIEW";
  page: number;
  pageSize: number;
  sort?: string;
  dir: "asc" | "desc";
}

export async function searchVehicles(s: VehicleSearch) {
  const q = s.q?.trim();
  const where: Prisma.VehicleWhereInput = {
    ...(s.status === "ARCHIVED" ? { archivedAt: { not: null } } : s.status ? { recordStatus: s.status, archivedAt: null } : { archivedAt: null }),
    ...(s.categoryId ? { categoryId: s.categoryId } : {}),
    ...(q
      ? {
          OR: [
            { plateNormalized: { contains: normalizePlate(q) } },
            { vin: { contains: normalizeIdentifier(q) } },
            { engineNumber: { contains: normalizeIdentifier(q) } },
            { registrations: { some: { certificateNumber: { contains: q.toUpperCase() } } } },
            { currentOwner: { searchName: { contains: normalizeName(q) } } },
            { payments: { some: { OR: [{ paymentReference: { contains: q } }, { receipt: { receiptNumber: { contains: q.toUpperCase() } } }] } } },
          ],
        }
      : {}),
  };
  const sortable = new Set(["plateNumber", "make", "createdAt", "manufactureYear"]);
  const orderBy = { [sortable.has(s.sort ?? "") ? s.sort! : "createdAt"]: s.dir } as Prisma.VehicleOrderByWithRelationInput;
  const [total, rows] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where, orderBy, skip: (s.page - 1) * s.pageSize, take: s.pageSize,
      include: {
        category: true, currentOwner: true,
        registrations: { orderBy: { registeredAt: "desc" }, take: 1 },
        photos: { where: { angle: "PRIMARY", removedAt: null }, take: 1 },
      },
    }),
  ]);
  return { total, rows };
}
