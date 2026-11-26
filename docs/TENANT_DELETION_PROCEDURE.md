# Tenant deletion procedure

The farm-data step of [ACCOUNT_DELETION_RUNBOOK.md](./ACCOUNT_DELETION_RUNBOOK.md). For an owner-authorized operator only. This document grants no service access. Nothing here has been run against production.

`scripts/recovery/tenant-registry.ts` is the authoritative list of farm-owned tables; `scripts/recovery/tenant-registry.migrations.test.ts` fails when a migration adds a `farm_id` table the registry does not classify. Do not work from a copied table list.

## Before

1. Confirm the request, user ID and farm ID as the runbook says. One profile only; otherwise stop.
2. Stripe is cancelled and verified (runbook step 1).
3. Take a fresh owner backup (`infrastructure/owner-backup`) and record its ID. The backup is the only undo.
4. Inventory the farm on an isolated restore of that backup: `scripts/recovery/inventory-tenant.ts` with the farm ID. Keep the counts.

## Delete (one transaction, service role, against the exact project)

1. Storage: remove the farm's attachment objects (the `storage` entries in the registry name the bucket and path prefix). Verify the prefix is empty.
2. Every registry entry with `ownership` `direct`, `indirect` or `derived`, in **descending** `restoreOrder` (children before parents), scoped to the farm (`farmColumn`, or the `via` parent for indirect rows). Hard delete here is deliberate: this is account deletion, not a farm edit, and it is the only place hard deletes are allowed. Include service-only tables the bundle skips: `farm_comps`, `entitlement_shadow_log`, and `rainfall_settings` (its farm FK is RESTRICT).
   - **Billing records are kept 7 years** (Terms §7). Before deleting, export the farm's `farm_subscriptions` and `billing_audit_log` rows to the billing archive with the request ID; Stripe keeps its own invoices. Only then delete them with the farm.
3. Keep `account_deletion_requests`: its `farm_id` becomes null by design (`20261013040147`).
4. Delete the `farms` row last. `ON DELETE CASCADE` foreign keys clean up anything missed; a RESTRICT FK error means a table was skipped. Roll back, add it, and start again.
5. Before commit: re-run the step-4 inventory queries in the same transaction. Every count is 0, and row counts for one other farm are unchanged.

## After

- Record the backup ID, the before/after counts, the operator and the time in the request notes.
- Continue with runbook step 3 (auth user). Backups age out within 90 days, as the privacy policy says.
