/**
 * B1 — Cancellation & refund policy engine (pure, unit-testable).
 *
 * One policy per hotel (RONDMAP B1): a free-cancellation window, a single
 * partial-refund tier (keep %), a no-refund cutoff, a deposit %, and a
 * no-show rule. The hotel stores the current policy; every booking snapshots
 * the policy text + version it accepted, so later edits never affect bookings.
 *
 * ASSUMPTION: "days before check-in" is measured in whole calendar days
 * (date-only). Boundary rule: cancelling exactly N days before check-in
 * falls in the MORE generous tier.
 */

export type CancellationPolicyInput = {
  free_cancellation_days: number;
  partial_keep_percent: number;
  partial_cutoff_days: number;
  deposit_percent: number;
  no_show_keep_percent: number;
  policy_text_th: string;
  policy_text_en: string;
  version: number;
};

export type AcceptedPolicySnapshot = {
  version: number;
  policy_text_th: string;
  policy_text_en: string;
  free_cancellation_days: number;
  partial_keep_percent: number;
  partial_cutoff_days: number;
  deposit_percent: number;
  no_show_keep_percent: number;
};

export type RefundDecision =
  | { kind: 'full'; refund_percent: 100; keep_percent: 0 }
  | { kind: 'partial'; refund_percent: number; keep_percent: number }
  | { kind: 'none'; refund_percent: 0; keep_percent: 100 };

export function getPolicyValidationError(policy: CancellationPolicyInput): string | null {
  if (!Number.isInteger(policy.free_cancellation_days) || policy.free_cancellation_days < 0 || policy.free_cancellation_days > 365) {
    return 'free_cancellation_days must be a whole number of days (0-365).';
  }
  if (!Number.isInteger(policy.partial_cutoff_days) || policy.partial_cutoff_days < 0 || policy.partial_cutoff_days > 365) {
    return 'partial_cutoff_days must be a whole number of days (0-365).';
  }
  if (policy.partial_cutoff_days > policy.free_cancellation_days) {
    return 'partial_cutoff_days cannot be later than free_cancellation_days.';
  }
  const percents: Array<[string, number]> = [
    ['partial_keep_percent', policy.partial_keep_percent],
    ['deposit_percent', policy.deposit_percent],
    ['no_show_keep_percent', policy.no_show_keep_percent],
  ];
  for (const [field, value] of percents) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return `${field} must be a percent between 0 and 100.`;
    }
  }
  if (!policy.policy_text_th.trim() || !policy.policy_text_en.trim()) {
    return 'Policy text is required in both Thai and English.';
  }
  if (!Number.isInteger(policy.version) || policy.version < 1) {
    return 'Policy version must be a positive integer.';
  }
  return null;
}

export function defaultCancellationPolicy(): CancellationPolicyInput {
  return {
    free_cancellation_days: 7,
    partial_keep_percent: 50,
    partial_cutoff_days: 3,
    deposit_percent: 30,
    no_show_keep_percent: 100,
    policy_text_th: 'free-7 partial-3-6 keep-50 no-refund-under-3 no-show-full',
    policy_text_en: 'Free 7+ days; 50% kept 3-6 days; no refund under 3 days; no-show full forfeit',
    version: 1,
  };
}


/** Whole calendar days between cancel date and check-in (cancel day exclusive). */
export function daysBeforeCheckIn(cancelledAtIso: string, checkInDate: string): number {
  const cancelDay = new Date(`${cancelledAtIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  const checkInDay = new Date(`${checkInDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(cancelDay) || !Number.isFinite(checkInDay)) return Number.NEGATIVE_INFINITY;
  return Math.round((checkInDay - cancelDay) / 86400000);
}

export function evaluateCancellationRefund(
  snapshot: Pick<AcceptedPolicySnapshot, 'free_cancellation_days' | 'partial_keep_percent' | 'partial_cutoff_days'>,
  cancelledAtIso: string,
  checkInDate: string,
): RefundDecision {
  const days = daysBeforeCheckIn(cancelledAtIso, checkInDate);
  if (days >= snapshot.free_cancellation_days) {
    return { kind: 'full', refund_percent: 100, keep_percent: 0 };
  }
  if (days >= snapshot.partial_cutoff_days) {
    const keep = snapshot.partial_keep_percent;
    return { kind: 'partial', refund_percent: 100 - keep, keep_percent: keep };
  }
  return { kind: 'none', refund_percent: 0, keep_percent: 100 };
}

export function evaluateNoShowRefund(
  snapshot: Pick<AcceptedPolicySnapshot, 'no_show_keep_percent'>,
): RefundDecision {
  const keep = snapshot.no_show_keep_percent;
  if (keep <= 0) return { kind: 'full', refund_percent: 100, keep_percent: 0 };
  if (keep >= 100) return { kind: 'none', refund_percent: 0, keep_percent: 100 };
  return { kind: 'partial', refund_percent: 100 - keep, keep_percent: keep };
}

export function calculateDepositAmount(totalPrice: number, snapshot: Pick<AcceptedPolicySnapshot, 'deposit_percent'>): number {
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) return 0;
  return Math.round((totalPrice * snapshot.deposit_percent) / 100);
}

export function calculateRefundAmount(paidAmount: number, decision: RefundDecision): number {
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) return 0;
  return Math.round((paidAmount * decision.refund_percent) / 100);
}

export function snapshotPolicy(policy: CancellationPolicyInput): AcceptedPolicySnapshot {
  return {
    version: policy.version,
    policy_text_th: policy.policy_text_th,
    policy_text_en: policy.policy_text_en,
    free_cancellation_days: policy.free_cancellation_days,
    partial_keep_percent: policy.partial_keep_percent,
    partial_cutoff_days: policy.partial_cutoff_days,
    deposit_percent: policy.deposit_percent,
    no_show_keep_percent: policy.no_show_keep_percent,
  };
}

