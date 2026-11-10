# Free tier release checklist

For Will. Run every step yourself, staging first, then production. Nothing in this file runs on its own. Do not paste secrets, database URLs, or keys into chat or into git. Env vars are named only.

Branch: `feat/free-tier`. The paid plan is called Pro. Leave `ENTITLEMENTS_MODE` at `off` until section 8. Do not set it to `enforce` until section 1 has a live complimentary row for the owner farm.

Production project ref (already recorded in `docs/runbooks/full-project-recovery.md`): `rtzqswpmhlbrbxjwyywl`. Read the linked project before any `supabase` command.

## 1. Before anything

1. [ ] Take a fresh backup of production and confirm the file is on disk before any SQL change. The owner Cloud Run job `acreledger-owner-backup` is not a proven nightly backup yet (`docs/runbooks/owner-backup-operations.md`). A Settings backup from the app is one farm's JSON. This step is a whole-project copy. If you ever have to restore, use `docs/runbooks/full-project-recovery.md` and restore into an isolated project.

2. [ ] Confirm the owner farm, then the complimentary row, **before** `ENTITLEMENTS_MODE` is ever set to `enforce`. The farm id in this repo is `28e107ba-3384-4b6e-9917-8a694803cb82` (`src/lib/askBookAccess.ts`, the only Ask the Book farm). In the Supabase SQL editor (postgres; the app role `authenticated` cannot read or write `public.farm_comps`):

```sql
SELECT id, name
FROM public.farms
WHERE id = '28e107ba-3384-4b6e-9917-8a694803cb82';
```

Stop if that row is missing or the name is not Egbert Farm.

3. [ ] Read the live comp. Columns are `id`, `farm_id`, `reason`, `granted_by`, `created_at`, `expires_at`, `deleted_at` (`supabase/migrations/20261101120000_farm_comps.sql`). A row counts only when `deleted_at` is null and `expires_at` is null or still in the future.

```sql
SELECT id, farm_id, reason, granted_by, created_at, expires_at, deleted_at
FROM public.farm_comps
WHERE farm_id = '28e107ba-3384-4b6e-9917-8a694803cb82'
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now());
```

4. [ ] If that SELECT returns a row, do nothing. If it returns no row, insert one. `expires_at` null means no expiry. A soft-deleted row does not count; leave it, and insert a new row. Do not `DELETE`. The audit trigger will add one `billing_audit_log` row (`action` `insert`, `table_name` `farm_comps`). That is expected.

```sql
INSERT INTO public.farm_comps (farm_id, reason, expires_at)
VALUES (
  '28e107ba-3384-4b6e-9917-8a694803cb82',
  'Egbert Farm owner complimentary',
  NULL
);
```

`granted_by` is optional. Complimentary wins over a Stripe subscription in `_farm_entitlement`.

## 2. Migration version mismatch

Prod already applied the same three changes under different version numbers. The repo files are:

- `20261101000000_db_hardening_maintain_search_path.sql`
- `20261101120000_farm_comps.sql`
- `20261101130000_billing_audit_log.sql`

`supabase_migrations.schema_migrations` on prod records them as `20261102*` versions. Two of those versions are known: `20261102014611` and `20261102020303`. The third is not known in this repo. Do not invent it.

`supabase db push` compares filenames to that table. It would try to run the three repo files again (their versions are absent on prod) and it would report drift for the prod versions (those versions are absent from the repo). The hardening file revokes `MAINTAIN` across public relations. Do not push until the versions match. This section does not change prod by itself.

5. [ ] On prod, read-only, run `supabase migration list`. If the remote rows do not show which file is which, run this read-only query (if `name` is not a column, use the Dashboard history for that version and stop rather than guessing):

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '20261101' AND version < '20261107'
ORDER BY version;
```

Match each prod version to a file by `name`. Write the three pairs down. Repeat the same read on staging and on any local database you push to.

6. [ ] Preferred option, (a). After the names match, rename the three repo files so the 14-digit prefix is the prod version, in a **separate commit**. Keep each file's suffix (`_db_hardening_maintain_search_path.sql`, `_farm_comps.sql`, `_billing_audit_log.sql`).

   Order check against the files that exist today: the previous file is `20261022210000_profiles_id_fkey_cascade.sql`. The next file is `20261107000000_entitlements_core.sql`. There is no `20261102*` file in the repo. `20261102014611` and `20261102020303` both sort after `20261022210000` and before `20261107000000`. The unknown third version must sort in that same gap, and the three new names must stay in the order prod applied them. Then run `npm run verify:migrations` (filename shape, unique timestamps, full replay on a disposable database). It does not touch prod.

   A database that already recorded `20261101000000`, `20261101120000`, and `20261101130000` will show the opposite mismatch after the rename. Settle that in the same plan before you push.

7. [ ] Option (b), only if you reject the rename, and only after you have reviewed the pairs. This **writes** prod's migration history. It does not undo SQL. For each pair, with the real versions filled in:

```text
supabase migration repair --status applied <repo version>
supabase migration repair --status reverted <prod version>
```

Repo versions are `20261101000000`, `20261101120000`, and `20261101130000`. A wrong pair marks a file applied that prod never ran (a later push skips it) or drops a version prod did run (a later push can apply it again).

Recommend (a). The rename leaves prod's history table alone, so the next push sees those three as already applied. Repair rewrites the live table, and a bad pair is hard to see afterward.

## 3. Apply migrations

Do this only after section 2 is settled for the database you are pushing. Staging first, then prod. These files create `rainfall_collectable_fields`, `farm_rainfall_slots`, `mrms_daily_runs`, and `past_due_since`. The Edge Functions in section 4 call them. Deploy the functions only after this push succeeds.

There are no `20261103*` through `20261106*` files. Do not re-apply the three section 2 files.

8. [ ] `supabase db push` on staging, then the same on prod, in this order:

   1. `20261107000000_entitlements_core.sql`
   2. `20261107010000_new_farms_start_free.sql`
   3. `20261107020000_field_cap_guard.sql`
   4. `20261107030000_photo_cap_guard.sql` (the app no longer takes photos; apply it so history matches the repo)
   5. `20261107040000_rainfall_tiering.sql`
   6. `20261107050000_paid_feature_guards.sql`
   7. `20261107060000_rainfall_hourly_field_allowed.sql` (`mrms-backfill` calls `rainfall_field_hourly_allowed`)
   8. `20261109210000_remove_trial.sql`
   9. `20261110160000_billing_past_due_since.sql`
   10. `20261110170000_rainfall_locked_slots.sql` (`farm_rainfall_slots`; replaces `rainfall_collectable_fields`)

9. [ ] Read `public.entitlement_config`. Expect one row, `mode` `off`, `device_limit_enabled` false. Do not update it here.

```sql
SELECT singleton, mode, device_limit_enabled, updated_at
FROM public.entitlement_config;
```

## 4. Edge Functions and the daily job

Follow `docs/free-tier-rainfall.md`. Functions: `supabase/functions/mrms-daily`, `mrms-hourly`, `mrms-backfill`. Auth on each is `secret:automations` (vault secret name `mrms_automation_api_key`, project URL name `mrms_project_url`).

10. [ ] Deploy `mrms-daily`, `mrms-hourly`, and `mrms-backfill` to staging, then prod. Leave the existing cron jobs `mrms-hourly-ingestion` (`20 * * * *`) and `mrms-morning-backfill` (`5 7 * * *`) in place.

11. [ ] Seed daily history once, service role, on each environment. This uses `daily_any`, so it can run while mode is still `off`:

```sql
SELECT public.seed_field_rainfall_daily_from_hourly();
```

12. [ ] Schedule the daily job by copying the `mrms-hourly-ingestion` job from `supabase/migrations/20260719022649_harden_mrms_scheduler_auth.sql`. Same vault secrets and headers. Job name `mrms-daily-ingestion`. URL suffix `/functions/v1/mrms-daily`. Schedule `30 16,22 * * *` (UTC): 16:30 and 22:30 UTC, which is 10:30 AM and 4:30 PM Central standard time (11:30 AM and 5:30 PM Central daylight time). The function handles one rain date per run. The 16:30 run takes the newest day. The 22:30 run retries the oldest of the last 3 days that is missing or only Pass 1. A day is done only with Pass 2 (`source` `MRMS 24H`).

```sql
SELECT cron.schedule(
  'mrms-daily-ingestion',
  '30 16,22 * * *',
  $job$
    SELECT net.http_post(
      url := rtrim((
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'mrms_project_url'
      ), '/') || '/functions/v1/mrms-daily',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'mrms_automation_api_key'
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

13. [ ] Confirm the job, then the ledger. While mode is `off`, `rainfall_collectable_fields('daily')` returns no fields, so a `success` row with `field_count` 0 means the job ran. Hourly collection still includes free farms until mode is `enforce`.

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'mrms-daily-ingestion';

SELECT rain_date, status, source, field_count, record_count, error_message, updated_at
FROM public.mrms_daily_runs
ORDER BY rain_date DESC
LIMIT 10;
```

## 5. Stripe

Handler: `api/stripe-webhook.ts` (Vercel path `/api/stripe-webhook`). The event list is `HANDLED_WEBHOOK_EVENT_TYPES` in `server/billing.ts`. The code has no wildcard. Other event types are acknowledged and ignored.

14. [ ] On the Stripe webhook endpoint, send exactly these events:

    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.paid`
    - `invoice.payment_succeeded`
    - `invoice.payment_failed`

15. [ ] Confirm the Vercel function has these env vars set. Do not copy the values out: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `BILLING_LIVE_CHARGES`. The handler still accepts only a test-mode secret, and only when `BILLING_LIVE_CHARGES` is absent or `false` (`assertTestModeBilling` in `server/billing.ts`). Live card charges stay behind that gate. The entitlement flag does not open it. Live charges need a code change you approve separately.

16. [ ] Know what a subscription status does after `20261110160000_billing_past_due_since.sql` is applied. `PAST_DUE_GRACE_DAYS` in `server/billing.ts` is 14. The column `farm_subscriptions.past_due_since` is the first failed payment. Pro then lasts 14 days from that timestamp. A later failure does not move it. A successful payment, or status `active`, clears it. A normal cancel leaves `past_due_since` null and keeps Pro until `current_period_end`. Status `trialing` is the free record book (same as `incomplete`, a failure with no anchor, or a missing row). A complimentary `farm_comps` row still wins.

## 6. App release

17. [ ] Ship the build that sends `field_id` on Rain API requests (`src/services/RainService.ts`). Marketing version in `package.json` is `3.6.1`. CodeMagic reads that version for the store builds. Ship it to the web app and to the iOS and Android stores.

18. [ ] Wait until the farms you care about are on `3.6.1` before section 7 goes to `enforce`. Older builds can call the Rain API without `field_id`.

19. [ ] iOS website link is still a device check (`docs/ios-storefront-link.md`): `VITE_UPGRADE_URL`, a non-US account, and a TestFlight build. App Review may still ask for in-app purchase.

## 7. Rain API

Separate repo: `wsegbert65360/RainAPI`, branch `feat/rain-api-auth-enforce`. This AcreLedger repo only sends the token and `field_id`.

20. [ ] Deploy that branch with `RAIN_API_AUTH=off` (allowed values `off`, `log`, `enforce`; default `off`).

21. [ ] Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on that project. `log` and `enforce` need the service role key. `off` does not check the farm.

22. [ ] Set `RAIN_API_AUTH=log`. Watch the logs for requests missing `field_id` and for checks that fail. Leave it on `log` until those are gone.

23. [ ] After `3.6.1` is out **and** you approve it, set `RAIN_API_AUTH=enforce`. In `enforce`, a free farm gets no Rain API data (the app uses daily totals from Supabase). A field with only a boundary and no stored `lat` / `lng` is refused. While `ENTITLEMENTS_MODE` is still `off` or `shadow`, this app still calls the Rain API. A free farm then gets `premium_required:rainfall` and the field screen shows the Pro rainfall lock. If you want those locks to wait for section 8, stay on `log` until you flip the flag.

## 8. ENTITLEMENTS_MODE

Do this only after sections 1 through 7. Staging first if you have a copy of the data. Prod stays `off` until you have watched the log.

`public.entitlement_config` columns: `singleton`, `mode`, `device_limit_enabled`, `updated_at`. Change `mode` only. Leave `device_limit_enabled` false. The file `src/copy/entitlements.ts` is still marked DRAFT. Approve or edit it before `enforce` (`docs/free-tier-handoff.md`).

24. [ ] Read the row:

```sql
SELECT singleton, mode, device_limit_enabled, updated_at
FROM public.entitlement_config;
```

25. [ ] Set shadow:

```sql
UPDATE public.entitlement_config
SET mode = 'shadow', updated_at = now()
WHERE singleton IS TRUE;
```

26. [ ] Watch `public.entitlement_shadow_log` for a few days. Query in `docs/free-tier-metrics.md` (section "After turning on `shadow`"). The table in `docs/free-tier-shadow-report.md` is an offline simulation. Prod is this log. In shadow every write still succeeds. A row means that write would be refused in `enforce`. Egbert Farm should stay out of the log once the section 1 comp row is live. The three old test farms stay on the free plan, so their grain, equipment, FSA, landlord, and backup writes will show up. A row for Egbert Farm means the comp row is missing or expired. Stop. Fix section 1 before `enforce`.

27. [ ] Set enforce only after that watch, and only after section 10 is decided:

```sql
UPDATE public.entitlement_config
SET mode = 'enforce', updated_at = now()
WHERE singleton IS TRUE;
```

28. [ ] Re-check `mrms_daily_runs`. With mode `shadow` or `enforce`, free slot fields can collect. `field_count` 0 on the next run, after free farms exist, needs a look before you call rainfall done.

## 9. Rollback

Each step undoes that section only. Do not drop tables or delete farm rows.

29. [ ] Section 1. Keep the backup. To undo a comp you inserted, set `deleted_at = now()` on that `farm_comps` row. Do not `DELETE` it. The audit trigger records `soft_delete`.

30. [ ] Section 2. If you only renamed files and have not pushed, revert that commit. If you ran option (b), write down the exact repair commands you used before you repair them back. Do not guess the reverse pair.

31. [ ] Section 3. If a migration errors, stop. Fix forward. Do not delete rows to force the next file through, and do not drop the new tables. User data stays.

32. [ ] Section 4. Redeploy the previous function build if you still have it. Remove only the new cron job:

```sql
SELECT cron.unschedule('mrms-daily-ingestion');
```

Do not unschedule `mrms-hourly-ingestion` or `mrms-morning-backfill` as part of this.

33. [ ] Section 5. In the Stripe Dashboard, stop sending the new events if you added them and the handler is misbehaving. Leave `past_due_since` on `farm_subscriptions`. Do not drop the column. Do not rotate a key into this doc.

34. [ ] Section 6. Halt the store rollout, or ship the previous binary. On the web, redeploy the previous Vercel deployment.

35. [ ] Section 7. Set `RAIN_API_AUTH` back to `log` or `off`.

36. [ ] Section 8. Put the flag back. `off` is the full previous behavior. `shadow` keeps logging and still allows the write. Enforce refuses new paid writes; turning the flag back does not delete anything those writes already saved.

```sql
UPDATE public.entitlement_config
SET mode = 'off', updated_at = now()
WHERE singleton IS TRUE;
```

```sql
UPDATE public.entitlement_config
SET mode = 'shadow', updated_at = now()
WHERE singleton IS TRUE;
```

## 10. Open question

Do not pick this here. Pick it before step 27.

37. [ ] Terms (`src/pages/Terms.tsx`, section 5, 10 November 2026) say fields above the 50-field free limit stay visible and exportable, and that the farmer cannot add or change those extra fields unless they subscribe again or bring the farm back under the limit. The code does not do that. `assert_field_capacity` in `20261107020000_field_cap_guard.sql` refuses only a **new** active field, or a soft-deleted field being reactivated, once a free farm already has 50 active fields (`entitlement_free_limits`). Fields that already exist stay editable. Nothing is deleted or hidden. Choose one behavior, and make the Terms and the code match, before `enforce`.
