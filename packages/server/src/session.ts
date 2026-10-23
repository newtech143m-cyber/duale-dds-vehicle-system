import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { prisma } from "@dds/database";
import { effectivePermissions, ForbiddenError, type PermissionCode } from "@dds/auth";
import { currentPortal } from "./core";

export async function createSupabase() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

export interface Staff {
  id: string;
  authUserId: string;
  email: string;
  fullName: string;
  officeId: string | null;
  officeName: string | null;
  locale: string;
  roles: string[];
  roleNames: string[];
  permissions: Set<string>;
  requiresMfa: boolean;
}

export type AuthState =
  | { status: "anonymous" }
  | { status: "not_staff"; email: string }
  | { status: "suspended" }
  | { status: "no_access" }
  | { status: "mfa_enroll" | "mfa_verify"; staff: Staff }
  | { status: "ok"; staff: Staff };

/**
 * Resolve the signed-in Supabase user to a staff record + permissions for THIS portal.
 * Cached per request.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createSupabase();
  const { data, error } = await supabase.auth.getUser(); // validated with the Auth server
  if (error || !data.user?.email) return { status: "anonymous" };
  const authUser = data.user;
  const email = authUser.email!.toLowerCase();

  let user = await prisma.user.findUnique({ where: { authUserId: authUser.id } });
  if (!user) {
    // First sign-in of a pre-registered staff member: link by email.
    const invited = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, authUserId: null } });
    if (!invited) return { status: "not_staff", email };
    user = await prisma.user.update({ where: { id: invited.id }, data: { authUserId: authUser.id } });
  }
  if (user.status !== "ACTIVE") return { status: "suspended" };

  const assignments = await prisma.userRole.findMany({
    where: { userId: user.id, revokedAt: null },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const granted = assignments.flatMap((a) => a.role.permissions.map((p) => p.permission.code));
  const permissions = effectivePermissions(granted, currentPortal());
  if (permissions.size === 0) return { status: "no_access" };

  const office = user.officeId ? await prisma.registrationOffice.findUnique({ where: { id: user.officeId } }) : null;
  const staff: Staff = {
    id: user.id,
    authUserId: authUser.id,
    email: user.email,
    fullName: user.fullName,
    officeId: user.officeId,
    officeName: office?.name ?? null,
    locale: user.locale,
    roles: assignments.map((a) => a.role.code),
    roleNames: assignments.map((a) => a.role.name),
    permissions,
    requiresMfa: user.mfaRequired || assignments.some((a) => a.role.requiresMfa),
  };

  if (staff.requiresMfa) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).some((f) => f.status === "verified");
      return { status: verified ? "mfa_verify" : "mfa_enroll", staff };
    }
  }
  return { status: "ok", staff };
});

/** For pages: redirect to the right step when not fully signed in. */
export async function requireStaff(permission?: PermissionCode): Promise<Staff> {
  const state = await getAuthState();
  switch (state.status) {
    case "ok":
      if (permission && !state.staff.permissions.has(permission)) redirect("/forbidden");
      return state.staff;
    case "mfa_enroll":
    case "mfa_verify":
      redirect("/mfa");
    case "anonymous":
      redirect("/login");
    default:
      redirect(`/login?error=${state.status}`);
  }
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function assertStaff(permission?: PermissionCode): Promise<Staff> {
  const state = await getAuthState();
  if (state.status !== "ok") throw new ForbiddenError(permission ?? "session");
  if (permission && !state.staff.permissions.has(permission)) throw new ForbiddenError(permission);
  return state.staff;
}

export function can(staff: Staff, permission: PermissionCode): boolean {
  return staff.permissions.has(permission);
}
