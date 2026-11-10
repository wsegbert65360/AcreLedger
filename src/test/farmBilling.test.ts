import { describe, expect, it } from 'vitest';

import { getPaymentGraceDays } from '@/lib/farmBilling';
import type { FarmSubscription } from '@/types/farm';

const now = Date.parse('2026-10-25T12:00:00Z');
describe('payment grace display math', () => {
  it('counts 14 days from past_due_since and ignores an advanced period end', () => {
    const subscription = {
      status: 'past_due',
      deleted_at: null,
      past_due_since: '2026-10-22T12:00:00Z',
      current_period_end: '2027-10-25T12:00:00Z',
    } as FarmSubscription;
    expect(getPaymentGraceDays(subscription, now)).toBe(11);
    expect(getPaymentGraceDays({ ...subscription, status: 'unpaid' }, now)).toBe(11);
    expect(getPaymentGraceDays({ ...subscription, status: 'canceled' }, now)).toBe(11);
    expect(getPaymentGraceDays({ ...subscription, past_due_since: '2026-10-25T12:00:00Z' }, now)).toBe(14);
    expect(getPaymentGraceDays({ ...subscription, past_due_since: '2026-10-12T12:00:00Z' }, now)).toBe(1);
    expect(getPaymentGraceDays(subscription, Date.parse('2026-11-05T12:00:00Z'))).toBe(0);
    expect(getPaymentGraceDays({ ...subscription, status: 'active' }, now)).toBe(0);
    expect(getPaymentGraceDays({ ...subscription, past_due_since: null }, now)).toBe(0);
    expect(getPaymentGraceDays({ ...subscription, past_due_since: null, current_period_end: null }, now)).toBe(0);
    expect(getPaymentGraceDays({ ...subscription, deleted_at: 'deleted' }, now)).toBe(0);
    expect(getPaymentGraceDays(null, now)).toBe(0);
  });
});

describe('comp display expiry', () => {
  it.each([
    [null, false],
    [{ is_comped: false, expires_at: null }, false],
    [{ is_comped: true, expires_at: null }, true],
    [{ is_comped: true, expires_at: '2099-01-01T00:00:00Z' }, true],
    [{ is_comped: true, expires_at: '2000-01-01T00:00:00Z' }, false],
    [{ is_comped: true, expires_at: '2026-11-01T00:00:00Z' }, false],
    [{ is_comped: true, expires_at: 'invalid' }, false],
  ])('validates %j', async (comp, expected) => {
    const { isFarmComped } = await import('@/lib/farmBilling');
    expect(isFarmComped(comp, Date.parse('2026-11-01T00:00:00Z'))).toBe(expected);
  });
});

it('formats timestamp dates using the local calendar date', async () => {
  const { formatBillingDate } = await import('@/lib/farmBilling');
  const instant = '2026-11-01T00:30:00Z';
  expect(formatBillingDate(instant)).toBe(new Date(instant).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
  expect(formatBillingDate('2026-11-01')).toBe('Nov 1, 2026');
  expect(formatBillingDate(null)).toBe('');
});
