import { describe, expect, it } from 'vitest';

import { ENTITLEMENT_COPY, freePlanIncluded, paidPlanAdds } from '@/copy/entitlements';
import { FREE_LIMITS } from '@/lib/entitlements';

const FREE_RAINFALL =
  'Daily rainfall on your two oldest fields in the contiguous US. Those two are locked, and you can\u2019t change them.';

describe('entitlement plan copy', () => {
  it('hardcodes "two" only while the free rainfall cap is 2', () => {
    expect(FREE_LIMITS.rainfallSlotCap).toBe(2);
  });

  it('describes the free record book', () => {
    expect(ENTITLEMENT_COPY.planFreeSummary).toBe(
      'The free record book keeps your field records. Pro adds rainfall on all remaining fields, prepared reports, and the business tools.',
    );
    expect(freePlanIncluded()).toEqual([
      `Up to ${FREE_LIMITS.fieldCap} active fields`,
      FREE_RAINFALL,
      'Planting, spraying, fertilizing and harvest records',
      'Export what you logged',
    ]);
    expect(freePlanIncluded().some((line) => /photo/i.test(line))).toBe(false);
  });

  it('lists prepared reports and rainfall on the remaining fields as Pro', () => {
    expect(ENTITLEMENT_COPY.planPaidName).toBe('Pro');
    expect(paidPlanAdds()).toEqual([
      'Prepared FSA-578, spray log, fertilizer, and landlord reports',
      'Grain bins and grain movement',
      'Equipment and maintenance',
      'Landlord splits and FSA tract details',
      'Rainfall on all remaining fields, hourly',
      'Backup restore',
    ]);
    expect(paidPlanAdds().some((line) => /photo/i.test(line))).toBe(false);
  });

  it('keeps locked reports, parked sync, and per-field rainfall in plain sentences', () => {
    expect(ENTITLEMENT_COPY.reportLockedBody).toBe(
      'You can still see your records, print a single record, and export what you logged.',
    );
    expect(ENTITLEMENT_COPY.reportCheckFailedToast).toBe(
      'Couldn\'t check your plan. Connect to the internet and try again.',
    );
    expect(ENTITLEMENT_COPY.reportPreviewLabel).toBe('Preview');
    expect(ENTITLEMENT_COPY.reportPlanLoading).toBe('Checking your plan…');
    expect(ENTITLEMENT_COPY.syncParkedTitle).toBe(
      'Saved on this device. You need Pro to sync this change.',
    );
    expect(ENTITLEMENT_COPY.rainfallLocked).toBe(
      'Automatic rainfall for this field is part of Pro.',
    );
  });
});
