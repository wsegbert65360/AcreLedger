import { describe, expect, it } from 'vitest';

import { getFarmTrialStatus, getPaymentGraceDays, getTrialBannerThreshold, getTrialDaysLeftOverride } from '@/lib/farmTrial';
import type { FarmSubscription } from '@/types/farm';

const now = Date.parse('2026-10-25T12:00:00Z');
describe('farm trial display math', () => {
  it.each([0, 1, 7, 14, 90])('allows a preview display override of %s days', days => {
    expect(getTrialDaysLeftOverride('preview', `?other=value&trialDaysLeft=${days}`)).toBe(days);
  });
  it.each(['production', 'development', 'test', '', 'Preview', undefined])('ignores overrides in env %s', env => {
    expect(getTrialDaysLeftOverride(env, '?trialDaysLeft=7')).toBeNull();
  });
  it.each(['', '?other=7', '?trialDaysLeft=', '?trialDaysLeft=-1', '?trialDaysLeft=1.5', '?trialDaysLeft=NaN', '?trialDaysLeft=Infinity', '?trialDaysLeft=1e2', '?trialDaysLeft=abc', '?trialDaysLeft=%207', '?trialDaysLeft=%2B7', '?trialDaysLeft=9007199254740992'])('ignores invalid override %s', search => {
    expect(getTrialDaysLeftOverride('preview', search)).toBeNull();
  });
  it('omits grandfathered, missing and invalid dates', () => {
    for (const date of [null, undefined, '', 'invalid']) expect(getFarmTrialStatus(date, now)).toEqual({ phase: 'none', daysLeft: 0 });
  });
  it('ceils partial days and ends at the exact deadline', () => {
    expect(getFarmTrialStatus('2026-10-26T12:00:01Z', now)).toEqual({ phase: 'active', daysLeft: 2 });
    expect(getFarmTrialStatus('2026-10-25T12:00:01Z', now)).toEqual({ phase: 'active', daysLeft: 1 });
    expect(getFarmTrialStatus('2026-10-25T12:00:00Z', now)).toEqual({ phase: 'ended', daysLeft: 0 });
    expect(getFarmTrialStatus('2026-10-24T12:00:00Z', now).phase).toBe('ended');
  });
  it.each([[15, null], [14, 14], [8, 14], [7, 7], [2, 7], [1, 1], [0, null], [-1, null]])('maps %s days to window %s', (days, threshold) => {
    expect(getTrialBannerThreshold(days as number)).toBe(threshold);
  });
  it('adds 14 days to payment period end without changing entitlement rules', () => {
    const subscription = { status: 'past_due', deleted_at: null, current_period_end: '2026-10-25T12:00:00Z' } as FarmSubscription;
    expect(getPaymentGraceDays(subscription, now)).toBe(14);
    expect(getPaymentGraceDays({ ...subscription, status: 'unpaid' }, now)).toBe(14);
    expect(getPaymentGraceDays(subscription, now + 14 * 86400000)).toBe(0);
    expect(getPaymentGraceDays({ ...subscription, status: 'active' }, now)).toBe(0);
    expect(getPaymentGraceDays({ ...subscription, current_period_end: null }, now)).toBe(0);
    expect(getPaymentGraceDays({ ...subscription, deleted_at: 'deleted' }, now)).toBe(0);
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
    const { isFarmComped } = await import('@/lib/farmTrial');
    expect(isFarmComped(comp, Date.parse('2026-11-01T00:00:00Z'))).toBe(expected);
  });
});

it('formats timestamp deadlines using the local calendar date', async () => {
  const { formatFarmTrialDate } = await import('@/lib/farmTrial');
  const instant = '2026-11-01T00:30:00Z';
  expect(formatFarmTrialDate(instant)).toBe(new Date(instant).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
  expect(formatFarmTrialDate('2026-11-01')).toBe('Nov 1, 2026');
  expect(formatFarmTrialDate(null)).toBe('');
});
