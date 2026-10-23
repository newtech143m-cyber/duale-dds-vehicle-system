/**
 * Permission catalogue + default role matrix (least privilege).
 * This is the SINGLE source of truth: the seed writes it to the DB, and
 * the server checks permissions loaded from the DB for the signed-in user.
 */

export const PERMISSIONS = {
  // Vehicles & owners
  "vehicle.read": { module: "vehicles", description: "View vehicle records" },
  "vehicle.create": { module: "vehicles", description: "Register new vehicles" },
  "vehicle.update": { module: "vehicles", description: "Edit vehicle records" },
  "vehicle.archive": { module: "vehicles", description: "Archive vehicle records" },
  "owner.read": { module: "owners", description: "View owner records" },
  "owner.create": { module: "owners", description: "Create owners" },
  "owner.update": { module: "owners", description: "Edit owners" },
  "owner.archive": { module: "owners", description: "Archive owners" },
  "owner.view.national_id": { module: "owners", description: "See national ID references" },
  "ownership.transfer": { module: "owners", description: "Record ownership transfers" },
  "registration.read": { module: "registrations", description: "View registrations" },
  "registration.create": { module: "registrations", description: "Create registrations" },
  "registration.update": { module: "registrations", description: "Edit registrations" },
  "registration.cancel": { module: "registrations", description: "Cancel registrations" },
  "file.upload": { module: "files", description: "Upload photos/documents" },
  "file.view": { module: "files", description: "View photos/documents" },
  "file.remove": { module: "files", description: "Remove photos/documents" },
  "inspection.read": { module: "inspections", description: "View inspections" },
  "inspection.write": { module: "inspections", description: "Record inspections" },
  // Tax
  "tax.read": { module: "tax", description: "View assessments & payments" },
  "tax.rule.manage": { module: "tax", description: "Configure tax rules" },
  "tax.rule.verify": { module: "tax", description: "Mark a rule as verified against official regulation" },
  "tax.assess": { module: "tax", description: "Create tax assessments" },
  "tax.payment.record": { module: "tax", description: "Record tax payments & issue receipts" },
  "tax.payment.reverse": { module: "tax", description: "Reverse payments / void receipts" },
  "tax.exempt": { module: "tax", description: "Approve exemptions / waivers" },
  // Review & oversight
  "review.read": { module: "review", description: "View review requests" },
  "review.resolve": { module: "review", description: "Resolve review requests" },
  "audit.read": { module: "audit", description: "View audit logs" },
  "verification.history.read": { module: "audit", description: "View verification search history" },
  // Reports
  "report.view": { module: "reports", description: "View operational reports" },
  "report.financial": { module: "reports", description: "View financial reports" },
  "report.export": { module: "reports", description: "Export CSV/PDF" },
  // Administration
  "admin.users": { module: "admin", description: "Manage staff accounts & roles" },
  "admin.reference": { module: "admin", description: "Manage categories & offices" },
  "admin.settings": { module: "admin", description: "Change system settings" },
  // Verification portal (field-level visibility)
  "verify.search": { module: "verify", description: "Search plates in the verification portal" },
  "verify.view.vin": { module: "verify", description: "See chassis/VIN" },
  "verify.view.certificate": { module: "verify", description: "See registration certificate number" },
  "verify.view.owner_photo": { module: "verify", description: "See owner photograph" },
  "verify.view.owner_contact": { module: "verify", description: "See owner phone/address" },
  "verify.view.owner_id": { module: "verify", description: "See owner national ID reference" },
  "verify.view.tax_receipt": { module: "verify", description: "See tax receipt reference" },
  "verify.view.tax_balance": { module: "verify", description: "See outstanding tax amount" },
  "verify.review.submit": { module: "verify", description: "Submit review requests" },
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const ROLES = {
  SUPER_ADMIN: { name: "Super Admin", requiresMfa: true },
  SUPERVISOR: { name: "Supervisor", requiresMfa: true },
  REGISTRATION_OFFICER: { name: "Registration Officer", requiresMfa: false },
  FINANCE_OFFICER: { name: "Tax / Finance Officer", requiresMfa: true },
  VERIFICATION_OFFICER: { name: "Police / Verification Officer", requiresMfa: false },
  AUDITOR: { name: "Auditor", requiresMfa: true },
} as const;

export type RoleCode = keyof typeof ROLES;

const READ_CORE: PermissionCode[] = [
  "vehicle.read", "owner.read", "registration.read", "file.view", "inspection.read", "tax.read",
];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  // Super admin gets everything EXCEPT field verification (kept for police roles).
  SUPER_ADMIN: ALL_PERMISSIONS.filter((p) => !p.startsWith("verify.")),
  SUPERVISOR: [
    ...READ_CORE,
    "vehicle.update", "vehicle.archive", "owner.update", "owner.archive", "owner.view.national_id",
    "ownership.transfer", "registration.update", "registration.cancel", "file.remove",
    "inspection.write", "tax.exempt", "tax.payment.reverse",
    "review.read", "review.resolve", "audit.read", "verification.history.read",
    "report.view", "report.financial", "report.export",
  ],
  REGISTRATION_OFFICER: [
    ...READ_CORE,
    "vehicle.create", "vehicle.update", "owner.create", "owner.update", "owner.view.national_id",
    "ownership.transfer", "registration.create", "registration.update",
    "file.upload", "inspection.write", "review.read", "report.view",
  ],
  FINANCE_OFFICER: [
    "vehicle.read", "owner.read", "registration.read", "tax.read",
    "tax.assess", "tax.payment.record", "report.view", "report.financial", "report.export",
  ],
  VERIFICATION_OFFICER: [
    "verify.search", "verify.view.certificate", "verify.review.submit",
  ],
  AUDITOR: [
    ...READ_CORE, "audit.read", "verification.history.read", "review.read",
    "report.view", "report.financial",
  ],
};

/** Permissions that may NEVER be used from the verification portal deployment. */
export const VERIFICATION_PORTAL_ALLOWED = new Set<PermissionCode>(
  ALL_PERMISSIONS.filter((p) => p.startsWith("verify.")),
);

export function hasPermission(granted: ReadonlySet<string>, perm: PermissionCode): boolean {
  return granted.has(perm);
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(public readonly permission: string) {
    super(`Forbidden: missing permission ${permission}`);
  }
}

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthenticated");
  }
}

export function assertPermission(granted: ReadonlySet<string>, perm: PermissionCode): void {
  if (!granted.has(perm)) throw new ForbiddenError(perm);
}

/**
 * Effective permissions for a portal. A verification deployment silently drops
 * every non-verify permission, so even a super admin signed into the
 * verification portal cannot reach registration data through it.
 */
export function effectivePermissions(
  granted: Iterable<string>,
  portal: "registration" | "verification",
): Set<string> {
  const set = new Set<string>();
  for (const p of granted) {
    const isVerify = VERIFICATION_PORTAL_ALLOWED.has(p as PermissionCode);
    if (portal === "verification" ? isVerify : !isVerify) set.add(p);
  }
  return set;
}
