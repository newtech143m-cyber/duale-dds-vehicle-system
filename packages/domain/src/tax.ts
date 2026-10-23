import { toCents, sumCents, fromCents, type Cents } from "./money";

export type TaxStatus =
  | "PAID"
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "OVERDUE"
  | "EXEMPT"
  | "UNDER_REVIEW"
  /** No assessment exists for the year — NOT treated as paid. */
  | "NOT_ASSESSED";

export interface AssessmentForStatus {
  amountDue: string;
  /** Date-only due date (UTC midnight). */
  dueDate: Date;
  allowPartial: boolean;
  exemptedAt: Date | null;
  underReview: boolean;
  cancelledAt: Date | null;
}

export interface AllocationForStatus {
  amount: string;
  /** Only POSTED payments count. */
  paymentStatus: "POSTED" | "REVERSED";
}

export interface TaxStatusResult {
  status: TaxStatus;
  amountDue: string;
  amountPaid: string;
  balance: string;
  isOverdue: boolean;
}

/**
 * Derive tax status ONLY from the assessment and its posted payment allocations.
 * A registration record never implies payment.
 *
 * Precedence: NOT_ASSESSED → UNDER_REVIEW → EXEMPT → PAID → OVERDUE → PARTIALLY_PAID → UNPAID
 *  - Overdue = balance > 0 and the end of the due date (office day) has passed.
 *  - Partial payments are only reported as PARTIALLY_PAID when the rule allows them;
 *    otherwise a short payment is still UNPAID (and needs review — see flags).
 */
export function computeTaxStatus(
  assessment: AssessmentForStatus | null | undefined,
  allocations: readonly AllocationForStatus[],
  now: Date,
): TaxStatusResult {
  if (!assessment || assessment.cancelledAt) {
    return { status: "NOT_ASSESSED", amountDue: "0.00", amountPaid: "0.00", balance: "0.00", isOverdue: false };
  }

  const due: Cents = toCents(assessment.amountDue);
  const paid: Cents = sumCents(
    allocations.filter((a) => a.paymentStatus === "POSTED").map((a) => toCents(a.amount)),
  );
  const balanceC: Cents = due - paid > 0n ? due - paid : 0n;
  // Due date is inclusive: overdue from the start of the following UTC day.
  const dueEnd = new Date(Date.UTC(
    assessment.dueDate.getUTCFullYear(),
    assessment.dueDate.getUTCMonth(),
    assessment.dueDate.getUTCDate() + 1,
  ));
  const isOverdue = balanceC > 0n && now >= dueEnd && !assessment.exemptedAt;

  const base = { amountDue: fromCents(due), amountPaid: fromCents(paid), balance: fromCents(balanceC), isOverdue };

  if (assessment.underReview) return { status: "UNDER_REVIEW", ...base };
  if (assessment.exemptedAt) return { status: "EXEMPT", ...base, balance: "0.00", isOverdue: false };
  if (balanceC === 0n) return { status: "PAID", ...base };
  if (isOverdue) return { status: "OVERDUE", ...base };
  if (paid > 0n && assessment.allowPartial) return { status: "PARTIALLY_PAID", ...base };
  return { status: "UNPAID", ...base };
}

// ---------------------------------------------------------------------
// Rule selection
// ---------------------------------------------------------------------

export interface TaxRuleCandidate {
  id: string;
  taxYear: number;
  categoryId: string | null;
  usage: string | null;
  amount: string;
  dueDate: Date;
  allowPartial: boolean;
  isActive: boolean;
  priority: number;
  source: "CONFIGURED" | "VERIFIED_OFFICIAL";
}

export type RuleSelection =
  | { ok: true; rule: TaxRuleCandidate }
  | { ok: false; reason: "NO_RULE" | "AMBIGUOUS"; candidates: TaxRuleCandidate[] };

/**
 * Pick the most specific active rule for a vehicle and year.
 * Specificity: category+usage (3) > category (2) > usage (1) > general (0); then priority.
 * A tie at the top is reported as AMBIGUOUS rather than guessed.
 */
export function selectTaxRule(
  rules: readonly TaxRuleCandidate[],
  vehicle: { categoryId: string; usage: string },
  taxYear: number,
): RuleSelection {
  const matching = rules.filter(
    (r) =>
      r.isActive &&
      r.taxYear === taxYear &&
      (r.categoryId === null || r.categoryId === vehicle.categoryId) &&
      (r.usage === null || r.usage === vehicle.usage),
  );
  if (matching.length === 0) return { ok: false, reason: "NO_RULE", candidates: [] };

  const score = (r: TaxRuleCandidate) => (r.categoryId ? 2 : 0) + (r.usage ? 1 : 0);
  const sorted = [...matching].sort((a, b) => score(b) - score(a) || b.priority - a.priority);
  const [top, second] = sorted;
  if (second && score(top!) === score(second) && top!.priority === second.priority) {
    return { ok: false, reason: "AMBIGUOUS", candidates: sorted.filter((r) => score(r) === score(top!) && r.priority === top!.priority) };
  }
  return { ok: true, rule: top! };
}

/**
 * Validate a new payment against the assessment before recording it.
 */
export function validatePaymentAmount(
  status: TaxStatusResult,
  amount: string,
  allowPartial: boolean,
): { ok: true } | { ok: false; error: "NOT_PAYABLE" | "EXCEEDS_BALANCE" | "PARTIAL_NOT_ALLOWED" | "NON_POSITIVE" } {
  const amt = toCents(amount);
  if (amt <= 0n) return { ok: false, error: "NON_POSITIVE" };
  if (status.status === "EXEMPT" || status.status === "NOT_ASSESSED" || status.status === "PAID") {
    return { ok: false, error: "NOT_PAYABLE" };
  }
  const balance = toCents(status.balance);
  if (amt > balance) return { ok: false, error: "EXCEEDS_BALANCE" };
  if (!allowPartial && amt !== balance) return { ok: false, error: "PARTIAL_NOT_ALLOWED" };
  return { ok: true };
}
