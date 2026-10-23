import { describe, it, expect } from "vitest";
import { toCents, fromCents } from "./money";
import { computeTaxStatus, selectTaxRule, validatePaymentAmount, type AssessmentForStatus, type TaxRuleCandidate } from "./tax";
import { computeVerificationStatuses, effectiveRegistrationStatus, missingEssentials, formatSequence } from "./verification";

const assessment = (o: Partial<AssessmentForStatus> = {}): AssessmentForStatus => ({
  amountDue: "1500.00",
  dueDate: new Date("2026-06-30T00:00:00Z"),
  allowPartial: false,
  exemptedAt: null,
  underReview: false,
  cancelledAt: null,
  ...o,
});
const before = new Date("2026-03-01T10:00:00Z");
const after = new Date("2026-07-01T00:00:00Z");

describe("money", () => {
  it("is exact (no float drift)", () => {
    expect(fromCents(toCents("0.10") + toCents("0.20"))).toBe("0.30");
    expect(fromCents(toCents("1500") - toCents("1499.99"))).toBe("0.01");
  });
});

describe("computeTaxStatus — derived only from payments", () => {
  it("no assessment is NOT_ASSESSED, never PAID", () => {
    expect(computeTaxStatus(null, [], before).status).toBe("NOT_ASSESSED");
  });
  it("UNPAID with no payments before due date", () => {
    const r = computeTaxStatus(assessment(), [], before);
    expect(r).toMatchObject({ status: "UNPAID", balance: "1500.00", isOverdue: false });
  });
  it("PAID when posted allocations cover the amount", () => {
    const r = computeTaxStatus(assessment(), [{ amount: "1500.00", paymentStatus: "POSTED" }], after);
    expect(r).toMatchObject({ status: "PAID", balance: "0.00" });
  });
  it("reversed payments do not count", () => {
    const r = computeTaxStatus(assessment(), [{ amount: "1500.00", paymentStatus: "REVERSED" }], before);
    expect(r.status).toBe("UNPAID");
  });
  it("OVERDUE the day after the due date (due date is inclusive)", () => {
    expect(computeTaxStatus(assessment(), [], new Date("2026-06-30T23:59:59Z")).status).toBe("UNPAID");
    expect(computeTaxStatus(assessment(), [], after).status).toBe("OVERDUE");
  });
  it("PARTIALLY_PAID only when partial payments are allowed", () => {
    const alloc = [{ amount: "500.00", paymentStatus: "POSTED" as const }];
    expect(computeTaxStatus(assessment({ allowPartial: true }), alloc, before).status).toBe("PARTIALLY_PAID");
    expect(computeTaxStatus(assessment({ allowPartial: false }), alloc, before).status).toBe("UNPAID");
  });
  it("EXEMPT and UNDER_REVIEW take precedence", () => {
    expect(computeTaxStatus(assessment({ exemptedAt: before }), [], after)).toMatchObject({ status: "EXEMPT", isOverdue: false });
    expect(computeTaxStatus(assessment({ underReview: true }), [], after).status).toBe("UNDER_REVIEW");
  });
});

describe("selectTaxRule", () => {
  const rule = (o: Partial<TaxRuleCandidate>): TaxRuleCandidate => ({
    id: "r", taxYear: 2026, categoryId: null, usage: null, amount: "100.00",
    dueDate: new Date("2026-06-30"), allowPartial: false, isActive: true, priority: 0, source: "CONFIGURED", ...o,
  });
  const v = { categoryId: "cat-car", usage: "PRIVATE" };
  it("prefers the most specific rule", () => {
    const rules = [rule({ id: "general" }), rule({ id: "cat", categoryId: "cat-car" }), rule({ id: "both", categoryId: "cat-car", usage: "PRIVATE" })];
    expect(selectTaxRule(rules, v, 2026)).toMatchObject({ ok: true, rule: { id: "both" } });
  });
  it("reports NO_RULE instead of inventing a rate", () => {
    expect(selectTaxRule([rule({ taxYear: 2025 })], v, 2026)).toMatchObject({ ok: false, reason: "NO_RULE" });
  });
  it("reports AMBIGUOUS ties", () => {
    const rules = [rule({ id: "a", categoryId: "cat-car" }), rule({ id: "b", categoryId: "cat-car" })];
    expect(selectTaxRule(rules, v, 2026)).toMatchObject({ ok: false, reason: "AMBIGUOUS" });
  });
});

describe("validatePaymentAmount", () => {
  const unpaid = computeTaxStatus(assessment(), [], before);
  it("full payment ok, partial blocked when not allowed, overpay blocked", () => {
    expect(validatePaymentAmount(unpaid, "1500.00", false)).toEqual({ ok: true });
    expect(validatePaymentAmount(unpaid, "500.00", false)).toEqual({ ok: false, error: "PARTIAL_NOT_ALLOWED" });
    expect(validatePaymentAmount(unpaid, "500.00", true)).toEqual({ ok: true });
    expect(validatePaymentAmount(unpaid, "1500.01", true)).toEqual({ ok: false, error: "EXCEEDS_BALANCE" });
  });
});

describe("verification statuses", () => {
  const complete = {
    plateNumber: "3-AA12345", make: "Toyota", model: "Hilux", categoryId: "c", vin: "V", color: "White",
    hasPrimaryPhoto: true, owner: { displayName: "Ahmed", phone: null }, hasActiveOrExpiredRegistration: true,
  };
  it("expired registration is detected from valid_until", () => {
    expect(effectiveRegistrationStatus({ status: "ACTIVE", validUntil: new Date("2026-01-01") }, before)).toBe("EXPIRED");
  });
  it("not found → RECORD_NOT_FOUND only", () => {
    expect(computeVerificationStatuses({ matchCount: 0, registration: "NONE", taxStatus: null, missing: [], recordUnderReview: false, openReviewRequests: 0 }))
      .toEqual(["RECORD_NOT_FOUND"]);
  });
  it("duplicate plates → REVIEW_REQUIRED, no record shown", () => {
    expect(computeVerificationStatuses({ matchCount: 2, registration: "ACTIVE", taxStatus: "PAID", missing: [], recordUnderReview: false, openReviewRequests: 0 }))
      .toEqual(["REVIEW_REQUIRED"]);
  });
  it("multiple statuses can apply at once", () => {
    expect(computeVerificationStatuses({ matchCount: 1, registration: "EXPIRED", taxStatus: "OVERDUE", missing: [], recordUnderReview: false, openReviewRequests: 0 }))
      .toEqual(["REGISTRATION_EXPIRED", "TAX_UNPAID"]);
  });
  it("incomplete record removes VERIFIED", () => {
    const missing = missingEssentials({ ...complete, hasPrimaryPhoto: false });
    expect(missing).toEqual(["primaryPhoto"]);
    expect(computeVerificationStatuses({ matchCount: 1, registration: "ACTIVE", taxStatus: "PAID", missing, recordUnderReview: false, openReviewRequests: 0 }))
      .toEqual(["TAX_PAID", "INCOMPLETE_RECORD"]);
  });
  it("fully verified, tax paid", () => {
    expect(computeVerificationStatuses({ matchCount: 1, registration: "ACTIVE", taxStatus: "PAID", missing: missingEssentials(complete), recordUnderReview: false, openReviewRequests: 0 }))
      .toEqual(["VERIFIED", "TAX_PAID"]);
  });
  it("formats receipt numbers", () => {
    expect(formatSequence("RCPT-2026-", 42n, 6)).toBe("RCPT-2026-000042");
  });
});
