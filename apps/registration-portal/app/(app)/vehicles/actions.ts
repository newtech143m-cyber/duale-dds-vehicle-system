"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addDocument, addRegistration, addVehiclePhoto, archiveVehicle, cancelRegistration, createVehicle, formObject,
  removeVehicleFile, runAction, transferOwnership, updateVehicle, type ActionResult,
} from "@dds/server";
import type { DocumentType, PhotoAngle } from "@dds/database";

const ANGLES = ["PRIMARY", "FRONT", "REAR", "LEFT", "RIGHT", "OTHER"] as const;
const DOC_TYPES = ["REGISTRATION_CERTIFICATE", "INSPECTION_CERTIFICATE", "INSURANCE", "OWNERSHIP_TRANSFER", "BUSINESS_LICENSE", "OTHER"] as const;
const id = (d: FormData, k = "vehicleId") => String(d.get(k) ?? "");

export async function createVehicleAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  let newId = "";
  const r = await runAction("vehicle.create", async (staff) => {
    const v = await createVehicle(staff, formObject(data));
    newId = v.id;
  });
  if (r?.ok) redirect(`/vehicles/${newId}?created=1`);
  return r;
}

export async function updateVehicleAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const r = await runAction("vehicle.update", async (staff) => { await updateVehicle(staff, vid, formObject(data)); });
  if (r?.ok) redirect(`/vehicles/${vid}`);
  return r;
}

export async function archiveVehicleAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const r = await runAction("vehicle.archive", async (staff) => { await archiveVehicle(staff, vid, String(data.get("reason") ?? "")); });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function addPhotoAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const angle = String(data.get("angle"));
  const r = await runAction("file.upload", async (staff) => {
    if (!(ANGLES as readonly string[]).includes(angle)) throw new Error("bad angle");
    await addVehiclePhoto(staff, vid, angle as PhotoAngle, data.get("file") as File);
  });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function addDocumentAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const docType = String(data.get("docType"));
  const r = await runAction("file.upload", async (staff) => {
    if (!(DOC_TYPES as readonly string[]).includes(docType)) throw new Error("bad doc type");
    await addDocument(staff, { vehicleId: vid }, docType as DocumentType, data.get("file") as File, String(data.get("docNumber") ?? "") || undefined);
  });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function removeFileAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const kind = data.get("kind") === "document" ? "document" : "photo";
  const r = await runAction("file.remove", async (staff) => { await removeVehicleFile(staff, kind, String(data.get("id"))); });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function addRegistrationAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const r = await runAction("registration.create", async (staff) => { await addRegistration(staff, formObject(data)); });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function cancelRegistrationAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const r = await runAction("registration.cancel", async (staff) => { await cancelRegistration(staff, String(data.get("registrationId")), String(data.get("reason") ?? "")); });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function transferAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = id(data);
  const r = await runAction("ownership.transfer", async (staff) => { await transferOwnership(staff, formObject(data)); });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}
