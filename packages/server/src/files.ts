import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { get, put } from "@vercel/blob";
import { prisma, type PhotoAngle, type DocumentType } from "@dds/database";
import { UPLOAD_LIMITS } from "@dds/validation";
import { audit, UserError } from "./core";
import type { Staff } from "./session";

/** Detect the real file type from magic bytes (never trust the browser's MIME type). */
export function sniffType(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  return null;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

async function storeFile(file: File, kind: "photo" | "document", folder: string, staff: Staff) {
  const limits = UPLOAD_LIMITS[kind];
  if (!file || file.size === 0) throw new UserError("validation.fileRequired");
  if (file.size > limits.maxBytes) throw new UserError("validation.fileTooLarge");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !(limits.types as readonly string[]).includes(type)) throw new UserError("validation.fileType");

  const pathname = `${folder}/${randomUUID()}.${EXT[type]}`;
  await put(pathname, Buffer.from(bytes), { access: "private", contentType: type, addRandomSuffix: false });
  return prisma.storedFile.create({
    data: {
      pathname,
      contentType: type,
      sizeBytes: file.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      originalName: file.name.slice(0, 255),
      uploadedById: staff.id,
    },
  });
}

export async function addVehiclePhoto(staff: Staff, vehicleId: string, angle: PhotoAngle, file: File) {
  const stored = await storeFile(file, "photo", `vehicles/${vehicleId}`, staff);
  await prisma.$transaction(async (tx) => {
    if (angle === "PRIMARY") {
      // Replacing the primary photo keeps the old one in history (removed_at), never deleted.
      await tx.vehiclePhoto.updateMany({ where: { vehicleId, angle: "PRIMARY", removedAt: null }, data: { removedAt: new Date() } });
    }
    await tx.vehiclePhoto.create({ data: { vehicleId, fileId: stored.id, angle, createdById: staff.id } });
    await audit({ actorId: staff.id, action: "vehicle.photo.add", entityType: "vehicle", entityId: vehicleId, metadata: { angle, fileId: stored.id } }, tx);
  });
}

export async function addOwnerPhoto(staff: Staff, ownerId: string, file: File) {
  const stored = await storeFile(file, "photo", `owners/${ownerId}`, staff);
  await prisma.$transaction(async (tx) => {
    await tx.owner.update({ where: { id: ownerId }, data: { photoFileId: stored.id, updatedById: staff.id } });
    await audit({ actorId: staff.id, action: "owner.photo.set", entityType: "owner", entityId: ownerId, metadata: { fileId: stored.id } }, tx);
  });
}

export async function addDocument(staff: Staff, target: { vehicleId?: string; ownerId?: string }, docType: DocumentType, file: File, docNumber?: string) {
  const folder = target.vehicleId ? `vehicles/${target.vehicleId}/docs` : `owners/${target.ownerId}/docs`;
  const stored = await storeFile(file, "document", folder, staff);
  await prisma.$transaction(async (tx) => {
    await tx.supportingDocument.create({
      data: { vehicleId: target.vehicleId, ownerId: target.ownerId, fileId: stored.id, docType, docNumber, createdById: staff.id },
    });
    await audit({ actorId: staff.id, action: "document.add", entityType: target.vehicleId ? "vehicle" : "owner", entityId: target.vehicleId ?? target.ownerId, metadata: { docType, fileId: stored.id } }, tx);
  });
}

export async function removeVehicleFile(staff: Staff, kind: "photo" | "document", id: string) {
  await prisma.$transaction(async (tx) => {
    const row = kind === "photo"
      ? await tx.vehiclePhoto.update({ where: { id }, data: { removedAt: new Date() } })
      : await tx.supportingDocument.update({ where: { id }, data: { removedAt: new Date() } });
    await tx.storedFile.update({ where: { id: row.fileId }, data: { removedAt: new Date(), removedById: staff.id } });
    await audit({ actorId: staff.id, action: `${kind}.remove`, entityType: kind, entityId: id }, tx);
  });
}

/**
 * Authorize + stream a private file. Blob URLs are never sent to the browser;
 * every view goes through this check and is short-cached privately.
 */
export async function streamFile(staff: Staff, fileId: string): Promise<Response> {
  const file = await prisma.storedFile.findUnique({
    where: { id: fileId },
    include: { vehiclePhoto: true, ownerPhoto: true, document: true },
  });
  if (!file || file.removedAt) return new Response("Not found", { status: 404 });

  const p = staff.permissions;
  const allowed =
    p.has("file.view") ||
    // Verification officers: vehicle photos always; owner photo only with explicit permission; no documents.
    (p.has("verify.search") && !!file.vehiclePhoto) ||
    (p.has("verify.view.owner_photo") && !!file.ownerPhoto);
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const blob = await get(file.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(blob.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": file.contentType === "application/pdf" ? "inline" : "inline",
    },
  });
}
