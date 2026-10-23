import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS } from "@dds/auth";
import { projectVerification, type VerificationFacts } from "./verify-projection";

const facts: VerificationFacts = {
  vehicle: { plateNumber: "3-AA 12345", make: "Toyota", model: "Hilux", color: "White", manufactureYear: 2019, category: "Pickup", vin: "JTFDEMOVIN", primaryPhotoId: "f1" },
  registration: { status: "ACTIVE", certificateNumber: "CERT-1", validUntil: new Date("2027-01-01"), officeName: "Jigjiga" },
  owner: { displayName: "Ahmed Ali", ownerType: "INDIVIDUAL", photoId: "f2", phone: "+251900000000", locality: "Jigjiga", nationalIdRef: "FAYDA-1" },
  tax: { year: 2026, status: "PAID", balance: "0.00", lastPaymentAt: new Date("2026-03-01"), lastReceipt: "RCPT-2026-000001" },
};

describe("verification field-level permissions", () => {
  it("default police role sees no VIN, contact, ID, owner photo, balance or receipt", () => {
    const r = projectVerification(facts, new Set(ROLE_PERMISSIONS.VERIFICATION_OFFICER));
    expect(r.vehicle.vin).toBeNull();
    expect(r.owner).toMatchObject({ displayName: "Ahmed Ali", phone: null, locality: null, nationalIdRef: null, photoId: null });
    expect(r.tax.balance).toBeNull();
    expect(r.tax.lastReceipt).toBeNull();
    expect(r.registration?.certificateNumber).toBe("CERT-1"); // granted by default
    expect(r.restricted.sort()).toEqual(["ownerContact", "ownerId", "ownerPhoto", "taxBalance", "taxReceipt", "vin"]);
  });
  it("vehicle photo, owner name and tax status are always included", () => {
    const r = projectVerification(facts, new Set(["verify.search"]));
    expect(r.vehicle.primaryPhotoId).toBe("f1");
    expect(r.tax.status).toBe("PAID");
    expect(r.registration?.certificateNumber).toBeNull();
  });
  it("explicit permissions reveal the extra fields", () => {
    const all = new Set(["verify.search", "verify.view.vin", "verify.view.owner_contact", "verify.view.owner_id", "verify.view.owner_photo", "verify.view.tax_balance", "verify.view.tax_receipt", "verify.view.certificate"]);
    const r = projectVerification(facts, all);
    expect(r.vehicle.vin).toBe("JTFDEMOVIN");
    expect(r.owner?.nationalIdRef).toBe("FAYDA-1");
    expect(r.restricted).toEqual([]);
  });
});
