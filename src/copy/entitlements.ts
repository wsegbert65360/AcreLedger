// All free-tier / upgrade wording lives here so it can be reviewed and changed in one place.
// DRAFT: every string below is placeholder copy for William to approve before `enforce` ships.
// iOS note: the native app links to the website only on the US App Store storefront
// (planUpgradeLinkWebsite); everywhere else use `nativeManageOnWeb` and no link. See
// docs/ios-storefront-link.md and confirm the exact wording before an iOS release.

import { FREE_LIMITS, type EntitlementPlan } from '@/lib/entitlements';

export const ENTITLEMENT_COPY = {
  // Reports
  reportLockedToast: 'This report is included with Pro.',
  reportLockedTitle: 'This report is part of Pro.',
  reportLockedBody: 'You can still view your records, print a single record, and export your raw data.',

  // Harvest bin
  binLockedNote: 'Tracking what goes into each bin is part of Pro. You can still log this harvest as Town.',
  binLockedLabel: 'Pro',

  // Rainfall
  rainfallLocked: 'Rainfall history for this field is included with Pro.',

  // Sync queue (change refused for plan reasons, parked on the device)
  syncParkedTitle: 'Saved on this device. Pro needed to sync this change.',
  syncParkedBody: 'Open Settings to export or discard it. Nothing was deleted.',

  // Settings plan card
  planCardTitle: 'Your plan',
  planFreeName: 'Free plan',
  planPaidName: 'Pro',
  planComplimentaryName: 'Complimentary access',
  planFreeSummary: 'Everything you need to keep your records, free. Pro adds reports and extra tools.',
  planUpgradeLink: 'See Pro',
  planUpgradeLinkWebsite: 'See Pro on our website',
  nativeManageOnWeb: 'Plans are managed on the AcreLedger website.',
  planNothingDeleted: 'Nothing you have entered is ever deleted if your plan changes, and you can always export your data.',
} as const;

export function planDisplayName(plan: EntitlementPlan): string {
  switch (plan) {
    case 'paid': return ENTITLEMENT_COPY.planPaidName;
    case 'complimentary': return ENTITLEMENT_COPY.planComplimentaryName;
    default: return ENTITLEMENT_COPY.planFreeName;
  }
}

/** What the free plan includes, built from FREE_LIMITS so the numbers never drift from the server. */
export function freePlanIncluded(): string[] {
  return [
    `Up to ${FREE_LIMITS.fieldCap} fields`,
    `Rainfall history on ${FREE_LIMITS.rainfallSlotCap} fields, daily totals on the rest`,
    'Planting, spraying, fertilizing and harvest records',
    'CSV export of your own data',
  ];
}

/** What Pro adds. */
export function paidPlanAdds(): string[] {
  return [
    'FSA-578, spray log, fertilizer and landlord reports',
    'Grain bins and grain movement',
    'Equipment and maintenance',
    'Landlord splits and FSA tract details',
    'Hourly rainfall history for every field',
    'Backup restore',
  ];
}
