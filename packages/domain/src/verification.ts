import type { TaxStatus } from "./tax";

/**
 * Factual status labels only. None of these imply theft or wrongdoing.
 */
export type VerificationStatus =
  | "VERIFIED"
  | "TAX_PAID"
  | "TAX_UNPAID"
  | "REGISTRATION_EXPIRED"
  | "INCOMPLETE_RECORD"
  | "RECORD_NOT_FOUND"
  | "REVIEW_REQUIRED";

export interface RegistrationForStatus {
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";
  validUntil: Date | null;
}

/** Effective registration state at `now` (a stored ACTIVE status past valid_until is expired). */
export function effectiveRegistrationStatus(
  reg: RegistrationForStatus | null | undefined,
  now: Date,
): "NONE" | RegistrationForStatus["status"] {
  if (!reg) return "NONE";
  if (reg.status === "ACTIVE" && reg.validUntil && reg.validUntil <= now) return "EXPIRED";
  return reg.status;
}

export interface VehicleForCompleteness {
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  categoryId: string | null;
  vin: string | null;
  color: string | null;
  hasPrimaryPhoto: boolean;
  owner: { displayName: string | null; phone: string | null } | null;
  hasActiveOrExpiredRegistration: boolean;
}

/** Essential fields — configurable list could be moved to system_settings later. */
export function missingEssentials(v: VehicleForCompleteness): string[] {
  const missing: string[] = [];
  if (!v.plateNumber) missing.push("plateNumber");
  if (!v.make) missing.push("make");
  if (!v.model) missing.push("model");
  if (!v.categoryId) missing.push("category");
  if (!v.vin) missing.push("vin");
  if (!v.color) missing.push("color");
  if (!v.hasPrimaryPhoto) missing.push("primaryPhoto");
  if (!v.owner?.displayName) missing.push("ownerName");
  if (!v.hasActiveOrExpiredRegistration) missing.push("registration");
  return missing;
}

export interface VerificationInput {
  /** Number of NON-archived vehicles whose normalized plate matched exactly. */
  matchCount: number;
  registration: "NONE" | RegistrationForStatus["status"];
  taxStatus: TaxStatus | null;
  missing: string[];
  recordUnderReview: boolean;
  openReviewRequests: number;
}

/**
 * Combine facts into the list of statuses shown to the officer.
 * Multiple statuses can apply simultaneously.
 */
export function computeVerificationStatuses(input: VerificationInput): VerificationStatus[] {
  if (input.matchCount === 0) return ["RECORD_NOT_FOUND"];
  // Duplicate active plates must never show one arbitrary record.
  if (input.matchCount > 1) return ["REVIEW_REQUIRED"];

  const s = new Set<VerificationStatus>();

  if (input.registration === "ACTIVE") s.add("VERIFIED");
  if (input.registration === "EXPIRED") s.add("REGISTRATION_EXPIRED");
  if (["NONE", "PENDING", "SUSPENDED", "CANCELLED"].includes(input.registration)) s.add("REVIEW_REQUIRED");

  switch (input.taxStatus) {
    case "PAID":
    case "EXEMPT":
      s.add("TAX_PAID");
      break;
    case "UNPAID":
    case "OVERDUE":
    case "PARTIALLY_PAID":
      s.add("TAX_UNPAID");
      break;
    case "UNDER_REVIEW":
    case "NOT_ASSESSED":
    case null:
      s.add("REVIEW_REQUIRED");
      break;
  }

  if (input.missing.length > 0) {
    s.add("INCOMPLETE_RECORD");
    s.delete("VERIFIED");
  }
  if (input.recordUnderReview || input.openReviewRequests > 0) s.add("REVIEW_REQUIRED");

  const order: VerificationStatus[] = [
    "VERIFIED", "REGISTRATION_EXPIRED", "TAX_PAID", "TAX_UNPAID", "INCOMPLETE_RECORD", "REVIEW_REQUIRED",
  ];
  return order.filter((x) => s.has(x));
}

/** Tax year in force at `now`. Configurable start month (1 = January). */
export function currentTaxYear(now: Date, startMonth = 1): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= startMonth ? y : y - 1;
}

/** Format a sequence number, e.g. ("RCPT-2026-", 42n, 6) → "RCPT-2026-000042". */
export function formatSequence(prefix: string, value: bigint, padding: number): string {
  return `${prefix}${value.toString().padStart(padding, "0")}`;
}
