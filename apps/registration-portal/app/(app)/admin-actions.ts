"use server";

import { revalidatePath } from "next/cache";
import { inviteStaff, resolveReview, runAction, setStaffRoles, setStaffStatus, type ActionResult } from "@dds/server";

export async function resolveReviewAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const outcome = data.get("outcome") === "REJECTED" ? "REJECTED" : "RESOLVED";
  const r = await runAction("review.resolve", async (staff) => { await resolveReview(staff, String(data.get("id")), outcome, String(data.get("resolution") ?? "")); });
  revalidatePath("/reviews");
  return r;
}

export async function inviteStaffAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const r = await runAction("admin.users", async (staff) => {
    await inviteStaff(staff, { email: data.get("email"), fullName: data.get("fullName"), officeId: data.get("officeId") || undefined, roleCodes: data.getAll("roles").map(String) });
  });
  revalidatePath("/staff");
  return r;
}

export async function setRolesAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const r = await runAction("admin.users", async (staff) => { await setStaffRoles(staff, String(data.get("userId")), data.getAll("roles").map(String)); });
  revalidatePath("/staff");
  return r;
}

export async function setStatusAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const r = await runAction("admin.users", async (staff) => { await setStaffStatus(staff, String(data.get("userId")), data.get("suspend") === "true", String(data.get("reason") ?? "") || undefined); });
  revalidatePath("/staff");
  return r;
}
