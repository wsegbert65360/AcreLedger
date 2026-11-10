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
  reportLockedBody: 'You can still see your records, print a single record, and export what you logged.',

  // Harvest bin
  binLockedNote: 'Tracking what goes into each bin is part of Pro. You can still log this harvest as Town.',
  binLockedLabel: 'Pro',

  // Rainfall
  rainfallLocked: 'Automatic rainfall for this field is part of Pro.',

  // Sync queue (change refused for plan reasons, parked on the device)
  syncParkedTitle: 'Saved on this device. You need Pro to sync this change.',
  syncParkedBody: 'Open Settings to export or discard it. Nothing was deleted.',

  // Settings plan card
  planCardTitle: 'Your plan',
  planFreeName: 'Free plan',
  planPaidName: 'Pro',
  planComplimentaryName: 'Complimentary access',
  planFreeSummary: 'The free record book keeps your field records. Pro adds rainfall on all remaining fields, prepared reports, and the business tools.',
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

/** What the free plan includes. The field cap comes from FREE_LIMITS. "Two" matches rainfallSlotCap (locked at 2). */
export function freePlanIncluded(): string[] {
  return [
    `Up to ${FREE_LIMITS.fieldCap} active fields`,
    'Daily rainfall on your two oldest fields in the contiguous US. Those two are locked, and you can\u2019t change them.',
    'Planting, spraying, fertilizing and harvest records',
    'Export what you logged',
  ];
}

/** What Pro adds. */
export function paidPlanAdds(): string[] {
  return [
    'Prepared FSA-578, spray log, fertilizer, and landlord reports',
    'Grain bins and grain movement',
    'Equipment and maintenance',
    'Landlord splits and FSA tract details',
    'Rainfall on all remaining fields, hourly',
    'Backup restore',
  ];
}
