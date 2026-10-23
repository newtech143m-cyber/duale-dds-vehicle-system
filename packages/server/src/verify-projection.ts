/**
 * Field-level filtering for the verification portal. Pure function (no I/O) so it
 * can be unit-tested: anything an officer's permissions do not cover is REMOVED
 * from the payload on the server, never merely hidden in the UI.
 */
import type { VerificationStatus } from "@dds/domain";

export interface VerificationFacts {
  vehicle: {
    plateNumber: string; make: string; model: string; color: string | null; manufactureYear: number | null;
    category: string; vin: string | null; primaryPhotoId: string | null;
  };
  registration: { status: string; certificateNumber: string | null; validUntil: Date | null; officeName: string | null } | null;
  owner: {
    displayName: string; ownerType: "INDIVIDUAL" | "BUSINESS"; photoId: string | null;
    phone: string | null; locality: string | null; nationalIdRef: string | null;
  } | null;
  tax: { year: number; status: string; balance: string; lastPaymentAt: Date | null; lastReceipt: string | null };
}

export interface ProjectedVerification {
  vehicle: VerificationFacts["vehicle"];
  registration: VerificationFacts["registration"];
  owner: VerificationFacts["owner"];
  tax: Omit<VerificationFacts["tax"], "balance" | "lastReceipt"> & { balance: string | null; lastReceipt: string | null };
  restricted: string[];
}

export function projectVerification(facts: VerificationFacts, permissions: ReadonlySet<string>): ProjectedVerification {
  const has = (p: string) => permissions.has(p);
  const restricted: string[] = [];
  const hide = <T>(perm: string, label: string, value: T): T | null => {
    if (has(perm)) return value;
    if (value !== null && value !== undefined) restricted.push(label);
    return null;
  };

  return {
    vehicle: { ...facts.vehicle, vin: hide("verify.view.vin", "vin", facts.vehicle.vin) },
    registration: facts.registration && {
      ...facts.registration,
      certificateNumber: hide("verify.view.certificate", "certificate", facts.registration.certificateNumber),
    },
    owner: facts.owner && {
      displayName: facts.owner.displayName,
      ownerType: facts.owner.ownerType,
      photoId: hide("verify.view.owner_photo", "ownerPhoto", facts.owner.photoId),
      phone: hide("verify.view.owner_contact", "ownerContact", facts.owner.phone),
      locality: hide("verify.view.owner_contact", "ownerContact", facts.owner.locality),
      nationalIdRef: hide("verify.view.owner_id", "ownerId", facts.owner.nationalIdRef),
    },
    tax: {
      year: facts.tax.year,
      status: facts.tax.status,
      lastPaymentAt: facts.tax.lastPaymentAt,
      balance: hide("verify.view.tax_balance", "taxBalance", facts.tax.balance),
      lastReceipt: hide("verify.view.tax_receipt", "taxReceipt", facts.tax.lastReceipt),
    },
    restricted: [...new Set(restricted)],
  };
}

export type VerificationOutcome =
  | { kind: "found"; reference: string; statuses: VerificationStatus[]; data: ProjectedVerification; checkedAt: Date }
  | { kind: "not_found" | "ambiguous"; reference: string; statuses: VerificationStatus[]; plate: string; checkedAt: Date };
