import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS, PERMISSIONS, effectivePermissions, assertPermission, ForbiddenError } from "./permissions";

describe("RBAC matrix", () => {
  it("every role permission exists in the catalogue", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) expect(PERMISSIONS).toHaveProperty(p);
    }
  });
  it("verification officers cannot edit records or record payments", () => {
    const v = new Set<string>(ROLE_PERMISSIONS.VERIFICATION_OFFICER);
    expect(v.has("vehicle.update")).toBe(false);
    expect(v.has("tax.payment.record")).toBe(false);
    expect(() => assertPermission(v, "vehicle.update")).toThrow(ForbiddenError);
  });
  it("verification officers see no contact/ID/VIN by default (least privilege)", () => {
    const v = new Set<string>(ROLE_PERMISSIONS.VERIFICATION_OFFICER);
    for (const p of ["verify.view.owner_contact", "verify.view.owner_id", "verify.view.vin", "verify.view.tax_balance"]) {
      expect(v.has(p)).toBe(false);
    }
  });
  it("auditor is read-only", () => {
    const writes = ROLE_PERMISSIONS.AUDITOR.filter((p) =>
      /\.(create|update|archive|cancel|record|reverse|exempt|assess|manage|transfer|upload|remove|write|resolve)$/.test(p) || p.startsWith("admin."),
    );
    expect(writes).toEqual([]);
  });
  it("verification portal drops all registration permissions — even for super admin", () => {
    const eff = effectivePermissions(ROLE_PERMISSIONS.SUPER_ADMIN, "verification");
    expect(eff.size).toBe(0);
    const reg = effectivePermissions(["verify.search", "vehicle.read"], "registration");
    expect([...reg]).toEqual(["vehicle.read"]);
  });
});
