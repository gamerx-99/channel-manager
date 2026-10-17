import { describe, expect, it } from 'vitest';
import {
  calculateDepositAmount,
  calculateRefundAmount,
  daysBeforeCheckIn,
  defaultCancellationPolicy,
  evaluateCancellationRefund,
  evaluateNoShowRefund,
  getPolicyValidationError,
  snapshotPolicy,
} from './cancellationPolicy';

const POLICY = {
  free_cancellation_days: 7,
  partial_keep_percent: 50,
  partial_cutoff_days: 3,
};

describe('cancellationPolicy', () => {
  it('refunds in full inside the free window (boundary inclusive)', () => {
    expect(evaluateCancellationRefund(POLICY, '2026-11-01T10:00:00Z', '2026-11-08')).toEqual({
      kind: 'full', refund_percent: 100, keep_percent: 0,
    });
    expect(evaluateCancellationRefund(POLICY, '2026-10-20T10:00:00Z', '2026-11-08')).toEqual({
      kind: 'full', refund_percent: 100, keep_percent: 0,
    });
  });

  it('keeps the partial percent inside the partial tier (boundary inclusive)', () => {
    expect(evaluateCancellationRefund(POLICY, '2026-11-05T10:00:00Z', '2026-11-08')).toEqual({
      kind: 'partial', refund_percent: 50, keep_percent: 50,
    });
    expect(evaluateCancellationRefund(POLICY, '2026-11-02T10:00:00Z', '2026-11-08')).toEqual({
      kind: 'partial', refund_percent: 50, keep_percent: 50,
    });
  });

  it('refunds nothing past the cutoff', () => {
    expect(evaluateCancellationRefund(POLICY, '2026-11-07T10:00:00Z', '2026-11-08')).toEqual({
      kind: 'none', refund_percent: 0, keep_percent: 100,
    });
    expect(evaluateCancellationRefund(POLICY, '2026-11-08T10:00:00Z', '2026-11-08')).toEqual({
      kind: 'none', refund_percent: 0, keep_percent: 100,
    });
  });

  it('forfeits the deposit on no-show', () => {
    expect(evaluateNoShowRefund({ no_show_keep_percent: 100 })).toEqual({
      kind: 'none', refund_percent: 0, keep_percent: 100,
    });
    expect(evaluateNoShowRefund({ no_show_keep_percent: 0 })).toEqual({
      kind: 'full', refund_percent: 100, keep_percent: 0,
    });
  });

  it('computes deposit and refund amounts in THB', () => {
    expect(calculateDepositAmount(3000, { deposit_percent: 30 })).toBe(900);
    expect(calculateRefundAmount(900, { kind: 'partial', refund_percent: 50, keep_percent: 50 })).toBe(450);
    expect(calculateRefundAmount(900, { kind: 'none', refund_percent: 0, keep_percent: 100 })).toBe(0);
  });

  it('measures whole days from cancel date to check-in', () => {
    expect(daysBeforeCheckIn('2026-11-01T23:59:59Z', '2026-11-08')).toBe(7);
    expect(daysBeforeCheckIn('2026-11-08T00:00:01Z', '2026-11-08')).toBe(0);
  });

  it('rejects invalid policies', () => {
    const base = defaultCancellationPolicy();
    expect(getPolicyValidationError(base)).toBeNull();
    expect(getPolicyValidationError({ ...base, partial_cutoff_days: 9 })).toContain('partial_cutoff_days');
    expect(getPolicyValidationError({ ...base, deposit_percent: 150 })).toContain('deposit_percent');
    expect(getPolicyValidationError({ ...base, policy_text_th: '  ' })).toContain('Thai and English');
  });

  it('snapshots the accepted policy version', () => {
    const snap = snapshotPolicy(defaultCancellationPolicy());
    expect(snap.version).toBe(1);
    expect(snap.free_cancellation_days).toBe(7);
  });
});
