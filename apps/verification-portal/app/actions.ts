"use server";

import { ZodError } from "zod";
import { ForbiddenError } from "@dds/auth";
import { assertStaff, getI18n, submitReviewRequest, UserError, verifyPlate, type ActionResult, type VerificationOutcome } from "@dds/server";

export type VerifyState =
  | { ok: false; message: string }
  | { ok: true; outcome: VerificationOutcome; officer: { name: string; id: string } }
  | null;

export async function verifyAction(_prev: VerifyState, data: FormData): Promise<VerifyState> {
  const { t } = await getI18n();
  try {
    const staff = await assertStaff("verify.search");
    const outcome = await verifyPlate(staff, {
      plate: String(data.get("plate") ?? ""),
      reason: String(data.get("reason") ?? "") || undefined,
      location: String(data.get("location") ?? "") || undefined,
    });
    return { ok: true, outcome, officer: { name: staff.fullName, id: staff.id.slice(0, 8).toUpperCase() } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, message: t("common.forbidden") };
    if (e instanceof UserError) return { ok: false, message: t(e.key) === e.key ? t("common.error") : t(e.key) };
    if (e instanceof ZodError) return { ok: false, message: t(e.issues[0]?.message ?? "common.error") };
    console.error("[verify]", e);
    return { ok: false, message: t("common.error") };
  }
}

export async function reviewAction(_prev: ActionResult, data: FormData): Promise<ActionResult> {
  const { t } = await getI18n();
  try {
    const staff = await assertStaff("verify.review.submit");
    await submitReviewRequest(staff, {
      verificationRef: String(data.get("verificationRef") ?? "") || undefined,
      plateQuery: String(data.get("plateQuery") ?? "") || undefined,
      description: String(data.get("description") ?? ""),
    });
    return { ok: true, message: t("verify.reviewSent") };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, message: t("validation.reasonTooShort") === "validation.reasonTooShort" ? "Please describe the issue (at least 10 characters)." : t("validation.reasonTooShort") };
    if (e instanceof ForbiddenError || (e instanceof UserError && e.key === "common.forbidden")) return { ok: false, message: t("common.forbidden") };
    console.error("[review]", e);
    return { ok: false, message: t("common.error") };
  }
}
