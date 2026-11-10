import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  FREE_LIMITS,
  freeEntitlement,
  isEntitlementStale,
  isFreeTierLocked,
  isPremiumPlan,
  isPremiumRequiredError,
  parseCachedEntitlement,
  parseEntitlementRow,
  premiumRequiredFeature,
} from '@/lib/entitlements';

const sql = readFileSync('supabase/migrations/20261107000000_entitlements_core.sql', 'utf8');

describe('entitlement constants', () => {
  it('match entitlement_free_limits() in the migration', () => {
    const m = /SELECT (\d+) AS field_cap, (\d+) AS rainfall_slot_cap, (\d+) AS photo_cap, (\d+) AS history_seasons, (\d+) AS device_cap/.exec(sql);
    expect(m).not.toBeNull();
    const [fieldCap, rainfallSlotCap, photoCap, historySeasons, deviceCap] = m!.slice(1).map(Number);
    expect(FREE_LIMITS).toEqual({ fieldCap, rainfallSlotCap, photoCap, historySeasons, deviceCap });
  });
});

describe('entitlement helpers', () => {
  it('parses server rows and rejects unknown plans', () => {
    expect(parseEntitlementRow({ plan: 'paid', premium_until: '2027-01-01T00:00:00Z', field_cap: null })).toMatchObject({
      plan: 'paid', premiumUntil: '2027-01-01T00:00:00Z', fieldCap: null,
    });
    expect(parseEntitlementRow({ plan: 'platinum' })).toBeNull();
    expect(parseEntitlementRow(null)).toBeNull();
  });

  it('round-trips the cached shape and drops malformed cache', () => {
    const free = freeEntitlement();
    expect(parseCachedEntitlement(JSON.parse(JSON.stringify(free)))).toEqual(free);
    expect(parseCachedEntitlement({ plan: 'nope' })).toBeNull();
  });

  it('treats every non-free plan as premium', () => {
    expect(['free', 'paid', 'complimentary'].map(p => isPremiumPlan(p as never))).toEqual([false, true, true]);
  });

  it('expires a cached premium plan once premiumUntil passes (offline safety)', () => {
    const paid = { ...freeEntitlement(), plan: 'paid' as const, premiumUntil: '2026-11-01T00:00:00Z' };
    expect(isEntitlementStale(paid, Date.parse('2026-10-31T00:00:00Z'))).toBe(false);
    expect(isEntitlementStale(paid, Date.parse('2026-11-02T00:00:00Z'))).toBe(true);
    expect(isEntitlementStale({ ...paid, premiumUntil: null })).toBe(false);
    expect(isEntitlementStale(freeEntitlement())).toBe(false);
  });

  it('recognizes the stable premium_required error', () => {
    expect(isPremiumRequiredError({ code: 'P0402' })).toBe(true);
    expect(isPremiumRequiredError({ code: '23505', message: 'premium_required:grain' })).toBe(true);
    expect(isPremiumRequiredError({ code: '23505', message: 'dup' })).toBe(false);
    expect(premiumRequiredFeature({ message: 'premium_required:landlord_splits' })).toBe('landlord_splits');
  });

  it('locks only free farms while the server enforces (mode off/shadow never locks)', () => {
    expect(isFreeTierLocked(freeEntitlement(false))).toBe(false); // off/shadow
    expect(isFreeTierLocked(freeEntitlement(true))).toBe(true);
    expect(isFreeTierLocked({ ...freeEntitlement(true), plan: 'paid' })).toBe(false);
    expect(isFreeTierLocked({ ...freeEntitlement(true), plan: 'complimentary' })).toBe(false);
    expect(isFreeTierLocked(null)).toBe(false);
    // Missing/odd `enforced` from the server means not enforced.
    expect(parseEntitlementRow({ plan: 'free' })?.enforced).toBe(false);
    expect(parseEntitlementRow({ plan: 'free', enforced: true })?.enforced).toBe(true);
    expect(parseCachedEntitlement(JSON.parse(JSON.stringify(freeEntitlement(true))))?.enforced).toBe(true);
  });
});
