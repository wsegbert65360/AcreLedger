# PRODUCT.md — AcreLedger

AcreLedger is a record book for an individual farmer or a small operation. It keeps fields, planting, spraying, fertilizing, harvest, hay, grain, weather, rainfall, and the worksheets those records support.

One person, one farm. A second login on the same farm is not built (`docs/plans/2026-11-13-second-farm-member.md`).

## Free and Pro

The paid plan is named **Pro** in the app (`src/copy/entitlements.ts`). Code plans are `free`, `paid`, and `complimentary`. Complimentary is the owner's farm only, not a plan for sale. There is no trial (`20261109210000_remove_trial.sql`). Checkout does not set `trial_end`.

`ENTITLEMENTS_MODE` defaults to `off` (`entitlements_mode()`). While it is off, `assert_field_capacity` and `assert_premium` do not refuse a write. The numbers below are the free-plan limits in code. They become a paywall only if that flag is set to `enforce`. Do not turn the flag on from this file.

| | Free | Pro |
| --- | --- | --- |
| Price | No card. $0 in the app copy. | $299 per farm per year in the US. A$299 per farm per year in Australia. Confirmed in `src/components/settings/BillingManager.tsx`, `src/pages/Landing.tsx`, and `src/pages/Terms.tsx`. |
| Fields | 50 active fields (`FREE_LIMITS.fieldCap` and `entitlement_free_limits()`). | No field cap (`field_cap` is null on a paid plan). |
| Rainfall | Daily totals on the two oldest fields. Those two are locked. Confirmed: `rainfallSlotCap` 2, `freePlanIncluded()`, `20261110170000_rainfall_locked_slots.sql`. | Hourly rainfall on the remaining fields (`paidPlanAdds()`). |
| Records | Planting, spraying, fertilizing, and harvest stay on the free record book. | Grain bins and grain movement, equipment, FSA tract entry, and landlord splits (`assert_premium` features `grain`, `equipment`, `fsa_tract`, `landlord_split`). |
| Reports | Export of what the farm logged stays available. Fall FSA and the hay summary stay free (`isPaidReport`). | Prepared FSA-578, season spray log, fertilizer summary, landlord statement, and farm-owner summary. Save, share, print, and CSV/PDF export call `assert_premium` and fail closed. |
| Backup | A Settings backup download is the farm's own JSON. | Uploading a backup file (`restore_farm_backup`) is Pro. Undoing the latest pre-season reset is free. |
| Photos | No photo capture. `photo_cap` is NULL (`20261110190000_entitlements_hardening.sql`). | No photo capture in this build. |

`FREE_LIMITS` also copies `historySeasons: 2` and `deviceCap: 1` from `entitlement_free_limits()`. Neither is a live limit: the history cap was skipped and the one-device limit was not built (`docs/free-tier-handoff.md`).

Nothing already logged is deleted if a farm does not buy Pro.

## Where someone pays

Stripe checkout and the customer portal are web-only, and hidden unless `VITE_BILLING_UI_ENABLED` is `true`. The iOS app does not sell a subscription or show a price. A website link is shown only for the US App Store storefront, country code `USA`, when `VITE_UPGRADE_URL` is set (`src/lib/storefront.ts`). Every other storefront gets no link. `BILLING_LIVE_CHARGES` stays off and the server accepts only `sk_test_` keys until the owner approves live charges.

## Non-goals at launch

- Multi-user accounts. One account per farm. Do not add a second member unless the owner reverses that.
- AI features for customers. Ask the Book stays in the repo, on only for the owner's farm, and out of marketing. Do not remove it, and do not name that farm.
- Ads. The free-tier decision is no ads (`docs/free-tier-handoff.md`). There is no ad SDK in the app.
