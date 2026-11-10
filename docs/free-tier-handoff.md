# Free tier: hand-off (branch `feat/free-tier`)

Status: built and tested, **nothing deployed to production**, flag `ENTITLEMENTS_MODE` is `off`. You decide when to
move it to `shadow`, then `enforce`. Design: Project doc `claude/free-tier-implementation-plan.md`.

## What exists
| Area | Where |
|---|---|
| One server flag (`off` / `shadow` / `enforce`), plan function, `assert_premium`, shadow log | `supabase/migrations/20261107000000_entitlements_core.sql` |
| New farms start free (only when flag is not `off`) | `20261107010000_new_farms_start_free.sql` |
| Field cap 50 (existing data grandfathered). A photo-cap guard exists but is unused: photos were removed from the app | `20261107020000_field_cap_guard.sql`, `...030000_photo_cap_guard.sql` |
| Rainfall: free farms get daily totals on their 2 oldest fields | `20261107040000_rainfall_tiering.sql`, `supabase/functions/mrms-daily`, `docs/free-tier-rainfall.md` |
| Paid-only writes: grain, equipment, FSA/CLU, landlord splits, backup restore | `20261107050000_paid_feature_guards.sql` |
| App: plan hook, report gate, harvest bin lock, sync "premium needed" outcome, Settings plan card | `src/lib/entitlements.ts`, `src/hooks/useEntitlement.ts`, `src/components/settings/PlanCard.tsx` |
| All user-facing wording (DRAFT) | `src/copy/entitlements.ts` |
| iOS US-storefront website link | `docs/ios-storefront-link.md` |
| Shadow simulation (runs in `test:db-integrity`) | `scripts/shadow-report.mjs`, result in `docs/free-tier-shadow-report.md` |
| Cost queries | `docs/free-tier-metrics.md` |

With the flag `off` the app behaves exactly as before (full test suite green). Nothing is ever deleted on downgrade;
CSV export of a farm's own data is never blocked.

## Shadow result
Offline simulation (disposable Postgres, real migrations): Egbert Farm, three legacy trial farms and a paid farm are
never blocked; a new free farm is blocked only on grain, equipment, FSA tract/CLU, landlord split and backup restore.
Full table: `docs/free-tier-shadow-report.md`. **Not yet done:** a shadow run on a staging Supabase branch with copies of
the real farms. That needs a branch (costs money and touches your Supabase project), so I did not create one.

## Before you turn on `enforce`
1. Insert one `farm_comps` row in prod for the owner farm (Egbert Farm), no expiry. The 3 old trial farms are owner test accounts and now resolve to the free plan, which is what you want for testing the free tier.
2. Run `shadow` on staging first and check `entitlement_shadow_log` (query in `docs/free-tier-metrics.md`).
3. Approve or edit every string in `src/copy/entitlements.ts` (all marked DRAFT).
4. Edit the public pages (not touched by me), they will be wrong once new farms start free:
   - `src/pages/Landing.tsx` lines 147, 246, 372, 382, 392, 409, 458: "3-month free trial, no card needed."
   - `src/pages/Terms.tsx` lines 12-13 ("3. Free trial", "3 months free"), `src/pages/Refund.tsx` line 9.
   - Already done in the app: `BillingManager` wording, trial banners removed (see "Trial removal" below).
   - The Project description still says "122-day free trial": there is no trial now.
5. iOS: Xcode part is done (commit bebc1dd). Still to do: set `VITE_UPGRADE_URL`, look at the link on the real Settings
   screen, test a non-US account and a TestFlight build (`docs/ios-storefront-link.md`).
   App Review may still ask for in-app purchase; fallback is in that doc.

## Decisions made
Field cap 50. No photos (removed from the app). Rainfall on 2 fields (the oldest two, fixed). Complimentary is the owner farm only. The paid plan is named Pro.
New farms start free. Existing data grandfathered. History limit skipped. One-device limit deferred (see below). No ads.

## Deferred or not done
- **One-device limit:** not built (largest and most disruptive piece). Notes in `docs/free-tier-discovery.md` section 5.
- **History limit (current + last season):** skipped by decision.
- **Photos:** removed from the app on 2026-11-09 (no photo button, no photo cap). Pro-only photos are a later feature. Legacy attachments in old notes are preserved on re-save.
- **Not gated because the feature doesn't exist or isn't a paid feature:** input costs/cost per acre, CSV import from other
  apps, `todos`, client-computed REI/PHI and rain-alert reminders.

## Known risks and loose ends
- **Reports are built on the device**, so the report gate is display-only, not real enforcement. Moving report generation
  to the server is a separate piece of work.
- **Undoing a pre-season reset goes through `restore_farm_backup`**, so free farms would be blocked once enforced.
- **Review items:** (4) FIXED: Weather page and widget reload once when the plan resolves as free after a live Rain API load.
  (6) FIXED: `rainfall_field_hourly_allowed` (migration 20261107060000) gates the explicit-field branch of `mrms-backfill`
  (409 for free farms in enforce). (5) LEFT ON PURPOSE: per-field `_farm_entitlement` calls in enforce mode only matter at
  thousands of farms; if that happens, add a cached plan column rather than optimizing now.
- The open Rain API (Vercel Hobby, IEM-based) cannot be server-gated. Check Vercel Hobby's commercial-use terms.
- `farm_rainfall_daily` rollup stops updating for free farms.
- Prod `fields.created_at` nulls were not checked (the field cap picks editable fields by `created_at`, then `id`).
- Apple's commission on website links is 0% only while the Epic case is unresolved.

## Rough remaining effort
Xcode steps and device test: about an hour. Staging shadow run: half a day. Copy and public-page edits: your call on
wording, then about an hour. Flip `shadow`, watch the log for a few days, then `enforce`.
## Trial removal (2026-11-09)

There is no trial and no customer is on one. Done on `feat/free-tier`:
- Migration `20261109210000_remove_trial.sql`: `ensure_user_farm()` never sets trial dates or a trial claim, and `_farm_entitlement` no longer has a `legacy_trial` plan. Trial columns and `trial_claims` stay (nothing deleted).
- Stripe checkout never starts a trial (`api/create-checkout-session.ts`; `getCheckoutTrialEnd` removed).
- The trial banners are gone. `BillingNotices` keeps only the failed-payment notice. The billing screen shows "Free record book. No card needed. Pro is $299 per farm per year."
- Manual production step (not done): clear `trial_ends_at` on the owner and test farms that still carry one. They already resolve to the free plan, so this is cleanup only.
- Still to edit after attorney review: Landing.tsx, Terms.tsx, Refund.tsx trial wording, and the "122-day" text in the Project description.
