"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addOwnerPhoto, archiveOwner, createOwner, formObject, runAction, updateOwner, type ActionResult } from "@dds/server";

export async function createOwnerAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  let newId = "";
  const next = String(data.get("next") ?? "");
  const r = await runAction("owner.create", async (staff) => { newId = (await createOwner(staff, formObject(data)))!.id; });
  if (r?.ok) redirect(next === "vehicle" ? `/vehicles/new?owner=${newId}` : `/owners/${newId}`);
  return r;
}

export async function updateOwnerAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const id = String(data.get("ownerId"));
  const r = await runAction("owner.update", async (staff) => { await updateOwner(staff, id, formObject(data)); });
  if (r?.ok) redirect(`/owners/${id}`);
  return r;
}

export async function ownerPhotoAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const id = String(data.get("ownerId"));
  const r = await runAction("file.upload", async (staff) => { await addOwnerPhoto(staff, id, data.get("file") as File); });
  revalidatePath(`/owners/${id}`);
  return r;
}

export async function archiveOwnerAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const id = String(data.get("ownerId"));
  const r = await runAction("owner.archive", async (staff) => { await archiveOwner(staff, id); });
  revalidatePath(`/owners/${id}`);
  return r;
}
