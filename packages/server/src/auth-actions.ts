"use server";

import { redirect } from "next/navigation";
import { prisma } from "@dds/database";
import { audit, rateLimit, requestIpHash } from "./core";
import { getI18n } from "./i18n";
import { createSupabase, getAuthState } from "./session";
import type { ActionResult } from "./action";

export async function signInAction(_prev: ActionResult, data: FormData): Promise<ActionResult> {
  const { t } = await getI18n();
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  if (!email || !password) return { ok: false, message: t("auth.invalid") };

  const ip = (await requestIpHash()) ?? "noip";
  const allowed = (await rateLimit(`login:${email}`, 8)) && (await rateLimit(`login-ip:${ip}`, 30));
  if (!allowed) return { ok: false, message: t("auth.rateLimited") };

  const supabase = await createSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await audit({ actorId: null, action: "auth.login.failed", entityType: "auth", metadata: { reason: "credentials" } }).catch(() => {});
    return { ok: false, message: t("auth.invalid") };
  }

  const state = await getAuthState();
  if (state.status === "not_staff" || state.status === "suspended" || state.status === "no_access") {
    await supabase.auth.signOut();
    return { ok: false, message: t(state.status === "suspended" ? "auth.suspended" : "auth.notStaff") };
  }
  if (state.status === "ok" || state.status === "mfa_enroll" || state.status === "mfa_verify") {
    await prisma.user.update({ where: { id: state.staff.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    await audit({ actorId: state.staff.id, action: "auth.login", entityType: "user", entityId: state.staff.id });
  }
  redirect(state.status === "ok" ? "/" : "/mfa");
}

/**
 * Start TOTP enrollment (removes abandoned unverified factors first).
 * Called ONCE from the client when the enrollment screen mounts — never during
 * server rendering, otherwise every re-render would replace the QR the user
 * already scanned.
 */
export async function startMfaEnrollment() {
  const state = await getAuthState();
  if (state.status !== "mfa_enroll") throw new Error("Enrollment not required");
  const supabase = await createSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `DDS ${Date.now()}` });
  if (error || !data) throw new Error(error?.message ?? "MFA enrollment failed");
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfaAction(_prev: ActionResult, data: FormData): Promise<ActionResult> {
  const { t } = await getI18n();
  const code = String(data.get("code") ?? "").replace(/\s/g, "");
  let factorId = String(data.get("factorId") ?? "");
  const supabase = await createSupabase();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login");
  if (!(await rateLimit(`mfa:${user.user.id}`, 6))) return { ok: false, message: t("auth.rateLimited") };

  if (!factorId) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    factorId = factors?.totp.find((f) => f.status === "verified")?.id ?? "";
  }
  if (!/^\d{6}$/.test(code) || !factorId) return { ok: false, message: t("auth.mfaInvalid") };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, message: t("auth.mfaInvalid") };

  const staff = await prisma.user.findUnique({ where: { authUserId: user.user.id } });
  await audit({ actorId: staff?.id ?? null, action: "auth.mfa.verified", entityType: "user", entityId: staff?.id ?? null });
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createSupabase();
  const state = await getAuthState();
  if (state.status === "ok") await audit({ actorId: state.staff.id, action: "auth.logout", entityType: "user", entityId: state.staff.id }).catch(() => {});
  await supabase.auth.signOut();
  redirect("/login");
}
