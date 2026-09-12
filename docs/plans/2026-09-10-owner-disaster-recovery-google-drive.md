# AcreLedger Owner Disaster Recovery to Google Drive — Implementation Plan

**Status:** Implementation in repository; live dump, disposable restore, and nightly scheduler still blocked on owner setup

**Owner decisions:** Personal Google Drive; include the complete database, Supabase Auth, and Supabase Storage; run nightly; retain 30 daily backups and 12 monthly backups.

## Objective

Build an owner-only disaster-recovery system for the entire AcreLedger Supabase project. Each successful run must create an encrypted, independently verifiable backup in the project owner's personal Google Drive. Recovery must support both:

1. Restoring the complete AcreLedger backend after a project-level disaster.
2. Recovering one farm/customer account from a backup without changing any other production farm.

This is operational infrastructure, not a customer-facing Drive integration. Do not add a Google Drive connection to each farm or expose backup credentials in the AcreLedger client.

## Existing behavior to preserve

- `src/components/settings/BackupManager.tsx` creates a user-initiated, active-record JSON backup for the signed-in farm.
- `src/lib/backupSchema.ts` validates that portable farm backup.
- `src/store/useSeasonManagement.ts` restores a farm backup through `restore_farm_backup` and then reloads state from Supabase.
- The manual backup and season-rollover workflow must continue to work unchanged.
- The owner disaster-recovery archive is broader than the manual farm backup. It includes deleted rows, Auth, operational tables, and Storage, and therefore must never be downloadable by ordinary app users.

## Recovery guarantees and terminology

- **Full recovery:** Restore all included schemas, Auth data, and Storage objects into a new Supabase project.
- **Tenant recovery:** Recover one `farm_id`, every profile/user associated with it, all direct and indirect farm-owned rows, and attributable Storage objects.
- **Recovery point objective (RPO):** At most 24 hours of synchronized cloud data under normal operation.
- **Recovery time objective (initial target):** Document and rehearse recovery; do not promise a fixed production RTO until the first timed drill.
- **Backup success:** Dump, encryption, Drive upload, checksum verification, and manifest upload all complete. A partial upload is a failed run.
- **Authoritative tenant key:** `public.farms.id`, referenced as `farm_id`. `public.profiles` maps Auth user IDs to farms.

## Architecture

```text
Google Cloud Scheduler (02:00 America/Chicago)
                    |
                    v
Google Cloud Run Job: acreledger-owner-backup
  1. Acquire single-run lock
  2. Export roles/schema/data/Auth/Storage metadata
  3. Export every Supabase Storage object
  4. Build manifest, counts, and SHA-256 checksums
  5. Compress package
  6. Encrypt with offline-owned age public key
  7. Upload through owner OAuth to personal Google Drive
  8. Verify upload and apply retention
  9. Emit structured success/failure logs
                    |
                    v
Personal Google Drive / AcreLedger Database Backups
```

Use a containerized Cloud Run Job rather than a Vercel Function. Full dumps and Storage copies can outgrow ordinary request duration and memory limits. The job must use ephemeral disk only and delete temporary plaintext even after a failed run.

## Security invariants

1. Never put database passwords, Google OAuth credentials, refresh tokens, Supabase access tokens, S3 credentials, or encryption private keys in the repository.
2. Never use a `VITE_*` variable for owner backup infrastructure.
3. Store runtime credentials in Google Secret Manager and grant access only to the Cloud Run job service account.
4. The backup worker receives only the **age public recipient key**. Keep the age private identity offline in two owner-controlled locations, such as a password manager and encrypted removable media.
5. Encrypt before uploading to Drive. Never upload plaintext SQL, Auth rows, manifests containing PII, or Storage files.
6. Use TLS-verified connections to Supabase and Google APIs.
7. Do not log connection strings, access/refresh tokens, row contents, email addresses, or decrypted filenames from tenant exports.
8. Use a dedicated database credential for backups where Supabase permissions allow it. If the project owner/database credential is required to include managed schemas, isolate it in Secret Manager and rotate it after suspected exposure.
9. The tenant recovery tool is an owner CLI, not a public RPC, Vercel route, Edge Function, or app screen.
10. Every production tenant recovery requires a dry run, an immediate pre-recovery backup, an explicit `farm_id`, and a typed confirmation value.
11. Never hard-delete farm records during selective recovery. Snapshot replacement may update recovered IDs and soft-delete target-farm rows absent from the selected snapshot when the table supports `deleted_at`.
12. No selective recovery operation may issue an unscoped write. Every statement must constrain the target farm or an exact approved set of target user IDs.

## Required repository deliverables

Create these paths during implementation, adjusting filenames only when repository conventions require it:

```text
infrastructure/owner-backup/
  Dockerfile
  package.json or pinned runtime dependency manifest
  src/
    backup.ts
    config.ts
    databaseExport.ts
    storageExport.ts
    drive.ts
    encryption.ts
    manifest.ts
    retention.ts
    logging.ts
  test/
  deploy/
    cloud-run-job.example.yaml
    cloud-scheduler.example.md

scripts/recovery/
  README.md
  verify-backup.*
  restore-isolated.*
  inventory-tenant.*
  extract-tenant.*
  apply-tenant-recovery.*
  tenant-registry.*

docs/runbooks/
  owner-backup-operations.md
  full-project-recovery.md
  single-farm-recovery.md
  backup-key-recovery.md
```

Add build/test commands for the backup worker without disrupting the existing Vite application scripts.

## Phase 0 — Inventory and prove the backup method

Before building automation:

1. Read current Supabase backup, CLI, Auth migration, Storage download, and restore-to-new-project documentation. Supabase changes frequently; do not rely on remembered flags.
2. Run `supabase db dump --help` using the repository-pinned CLI and record its version in the backup manifest.
3. Inventory all non-system schemas and tables from the live project. At minimum review:
   - `public`
   - `auth`
   - `storage`
   - `ai_assistant_private`
   - `weather_proxy_private`
   - `supabase_migrations`
   - extension-owned schemas that must be recreated rather than dumped
4. Inventory enabled extensions, publications, Cron jobs, database webhooks, Auth configuration, Storage bucket configuration, and Edge Functions.
5. Confirm whether the CLI's main data dump includes `auth` and `storage` data for the pinned CLI version. Do not infer this. If excluded, create explicit supported exports and prove them with row counts.
6. Confirm the connection route that works from Cloud Run. Prefer a direct database connection when available; otherwise use the Supabase session pooler, not transaction pooling, for dump/restore tooling.
7. Produce one manual backup and restore it into a disposable project before automating anything.
8. Compare source and restored counts for `auth.users`, `public.farms`, `public.profiles`, every farm-owned table, private operational tables, `storage.buckets`, and `storage.objects`.

Stop this phase if a complete Auth restore cannot be demonstrated. Do not ship an archive labeled “complete” when Auth or Storage is missing.

## Phase 1 — Personal Google Drive authorization

1. Create a dedicated Google Cloud project for AcreLedger owner backups.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen for production, with only the owner Google account authorized as appropriate.
4. Request the narrow `https://www.googleapis.com/auth/drive.file` scope and offline access.
5. Implement a one-time local bootstrap command that:
   - Opens the Google consent screen.
   - Uses a loopback callback or another currently supported installed-app flow.
   - Creates `AcreLedger Database Backups` in My Drive using the same OAuth application.
   - Captures the refresh token without printing it.
   - Writes the refresh token directly to Google Secret Manager.
   - Records the folder ID in Secret Manager or non-secret job configuration.
6. Move the OAuth app out of Testing status before relying on it. Testing-mode Drive refresh tokens can expire after seven days.
7. Add a documented token-revocation and reconnection procedure.

The backup application must only list, upload, verify, and delete files it created inside the configured folder. Never request broad read/write access to the owner's entire Drive.

## Phase 2 — Backup package construction

Use the currently documented Supabase logical-backup procedure as the baseline. The package should contain separate restore-oriented artifacts rather than a single undocumented query export.

Expected logical contents:

```text
backup-root/
  manifest.json
  checksums.sha256
  database/
    roles.sql
    schema.sql
    data.sql
    auth-data.sql                 # when not already present in data.sql
    storage-metadata.sql          # when not already present in data.sql
    configuration.json
    inventory.json
  storage/
    objects/...                   # exact bucket/key layout
    objects-manifest.json
```

Implementation requirements:

1. Pin the PostgreSQL client/Supabase CLI versions in the worker image. Record versions in `manifest.json`.
2. Export roles, schema, and data using the flags verified in Phase 0. Use COPY-formatted data where supported.
3. Include all application-managed schemas and data, including private schemas and soft-deleted rows.
4. Include Auth users and identities. For full-project recovery, preserve the data required to retain password hashes and login identities.
5. Do not assume a database dump contains actual Storage object bytes. Enumerate and download them through Supabase's supported S3-compatible endpoint or supported Storage tooling.
6. Preserve exact bucket names and object keys. Include object size, ETag when available, content type, last-modified time, and SHA-256 checksum.
7. Current AcreLedger image attachments are embedded in database rows, so they are covered by the data dump. Do not strip base64 attachment payloads from this owner backup.
8. Export non-secret configuration needed to rebuild Auth, Realtime, Storage, extensions, Cron, and functions. Refer to secret names, not secret values.
9. Produce deterministic table row counts. Record failed/unreadable tables explicitly; never silently omit them.
10. Generate SHA-256 checksums for every artifact and for the final encrypted archive.
11. Compress the complete plaintext directory before encryption.
12. Encrypt with `age` or an equivalently reviewed public-key scheme. Do not invent custom cryptography.
13. Securely erase or remove ephemeral plaintext in a `finally`/trap path. Cloud Run instance termination remains a secondary cleanup control, not the primary one.

Suggested encrypted filename:

```text
acreledger-full-2026-09-10T07-00-00Z-<short-manifest-id>.tar.zst.age
```

The manifest ID must be random or content-derived and unique. Do not rely only on a date for idempotency.

## Phase 3 — Drive upload and retention

1. Use a resumable Drive upload so large archives tolerate transient failures.
2. Store non-sensitive Drive `appProperties` on each archive:
   - `application=acreledger-owner-backup`
   - `manifest_id`
   - `backup_time_utc`
   - `retention_tier=daily|monthly`
   - encrypted archive SHA-256
3. Upload a small, non-PII status manifest only after the encrypted archive succeeds.
4. Re-read Drive metadata after upload and verify the expected byte length. When feasible, download a bounded sample or the whole archive during scheduled verification to confirm the locally recorded checksum.
5. Mark the first successful backup in each calendar month as `monthly`; all others are `daily`.
6. Retain the newest 30 successful daily archives and newest 12 successful monthly archives.
7. Apply retention only after the current run is fully verified.
8. Delete only files that match the configured parent folder, OAuth application ownership, and AcreLedger `appProperties`. Never delete by filename alone.
9. Never delete the last known-good backup, even if retention metadata is malformed.
10. Treat retention deletion failures as warnings requiring follow-up, but do not mark an otherwise verified backup as absent.

## Phase 4 — Scheduling, locking, and monitoring

1. Deploy a private Cloud Run Job in the same or nearest practical region to the Supabase database.
2. Create a dedicated Google service account that may:
   - Run the job.
   - Read only the required Secret Manager versions.
   - Write structured logs and metrics.
   - It does not authenticate to personal Drive; Drive access comes from the owner's encrypted OAuth refresh token.
3. Schedule the job for 02:00 in the `America/Chicago` timezone every day.
4. Prevent overlap. Use a durable job/run ID and reject a second invocation for the same scheduled date. A database advisory lock alone is insufficient if the connection drops; combine a run ledger with idempotent Drive `manifest_id` lookup.
5. Use bounded retries with exponential backoff for transient Supabase, Storage, and Drive failures.
6. Emit one structured final event containing status, manifest ID, duration, encrypted bytes, table count, Storage object count, and sanitized error code.
7. Create an owner email alert for:
   - Any failed nightly run.
   - No verified backup within 30 hours.
   - Google authorization revoked.
   - Retention failure lasting more than one run.
   - Restore verification failure.
8. Never report success merely because the scheduler invoked the job.

Do not store the backup run ledger only inside the Supabase database being protected. Use Cloud Logging/Monitoring and optionally a small owner-controlled status object in Drive so backup evidence survives loss of the source project.

## Phase 5 — Single-farm recovery tooling

### 5.1 Tenant ownership registry

Create a checked-in registry that describes how every recoverable table belongs to a tenant. Categories:

- Direct ownership: table contains `farm_id`.
- Root: `public.farms.id` equals the selected `farm_id`.
- User ownership: row belongs through a target `user_id` from `public.profiles`.
- Indirect ownership: row belongs through a field, movement, request, or another farm-owned foreign key.
- Global infrastructure: never included in a single-farm bundle.
- Derived/rebuildable: may be restored or recomputed according to an explicit table rule.

The initial registry must cover all current tables, including core farm records, rainfall tables, FSA/CLU data, work requests, subscriptions, account-deletion requests, AI assistant private records, and weather-proxy private records. Classify global rows such as webhook idempotency ledgers explicitly rather than guessing.

Add a test that queries `information_schema` in a disposable restored database and fails when:

- A new table contains `farm_id` but is missing from the registry.
- A new foreign key reaches `farms` or `profiles` but is unclassified.
- A registered table or ownership column no longer exists.

### 5.2 Restore the archive into isolation

The recovery tool must never query rows directly out of a production dump and immediately write them to production.

1. Download the selected encrypted archive.
2. Verify the encrypted checksum before decryption.
3. Decrypt with the offline age private key.
4. Verify every internal checksum.
5. Create a disposable Supabase recovery project, preferably in the same region.
6. Prevent side effects before restoring application data:
   - Do not connect the recovery project to production domains or clients.
   - After schema restoration, use the checked-in restore command to unschedule recreated Cron jobs, disable outbound database webhook triggers, remove application tables from the Realtime publication, and fail if its verification probe finds any still active.
   - Keep billing webhooks, outbound email, external consumers, and `pg_net` credentials unconfigured.
   - Do not load production third-party secrets into the recovery project.
7. Restore roles/schema/data/Auth/Storage metadata using the documented order.
8. Restore Storage objects only when needed for verification or the selected tenant; avoid unnecessary exposure.
9. Compare restored counts with `manifest.json`. Stop on any mismatch.

### 5.3 Inventory and extract one farm

The owner selects a farm by exact `farm_id`. Email and farm name may be used to locate candidates, but the recovery command must display the resolved ID and require confirmation.

The extraction command must:

1. Read the farm row and all associated profiles.
2. Resolve associated `auth.users` and `auth.identities` for reporting.
3. Walk the tenant registry and export only matching rows.
4. Preserve primary keys, timestamps, versions, `farm_id`, and `deleted_at` values.
5. Include attributable Storage objects. The current fail-closed implementation attributes none automatically and lists every restored-project Storage key—including other farms' keys—for manual review.
6. Produce a tenant recovery bundle, internal checksums, per-table counts, source backup ID, and source recovery timestamp.
7. Validate all foreign keys within the bundle or document approved references to global data.
8. Generate a human-readable dry-run report without exposing record contents unnecessarily.

### 5.4 Apply one farm to production

Support two explicit modes:

#### Merge missing data

- Default and safest mode.
- Insert rows whose IDs are absent.
- Restore soft-deleted matching rows only when explicitly requested.
- Report differing existing rows as conflicts; do not overwrite them automatically.
- Preserve the current Auth account and current profile membership.

#### Restore target farm to snapshot

- Requires a second explicit confirmation and maintenance window for that farm.
- Create and verify a fresh pre-recovery backup first.
- Acquire a farm-scoped advisory lock and block normal writes for that farm during the transaction.
- Upsert snapshot rows for the exact target `farm_id` in foreign-key-safe order.
- Soft-delete target-farm rows absent from the snapshot when supported.
- Do not hard-delete farm records.
- Preserve newer conflicting data in an owner recovery audit package before replacement.
- Do not update, delete, lock, or scan-modify other farms.

Production apply requirements:

1. Use a single transaction where feasible; otherwise use resumable phases with a durable recovery ledger and compensating rollback package.
2. Stage rows in temporary/private tables first and validate counts, IDs, farm scope, and foreign keys before merging.
3. Reject any bundle containing a second `farm_id`.
4. Reject row IDs that currently belong to another farm.
5. Respect grain movement versioning and harvest/grain linkage.
6. Preserve FSA tract and CLU conflict-key behavior.
7. Preserve profile farm membership as a security boundary.
8. Do not expose the owner recovery functions to `PUBLIC`, `anon`, or `authenticated`. Prefer direct owner CLI database access over a callable public function.
9. Run post-restore RLS isolation tests using both the recovered user and a different farm user.

### 5.5 Auth handling during selective recovery

- If the Auth user still exists, do not modify `auth.users`; restore only the farm/application data.
- If the application account was removed but the email is available, invite the user through the Supabase Auth Admin API, then atomically attach the generated profile or remount a surviving old profile onto the authoritative new user ID. If attach fails, delete the newly invited Auth user and unusable output bundle.
- Do not directly insert selected Auth rows into live production as the normal single-farm procedure.
- Expect a recreated user to set a new password and establish fresh sessions.
- If the entire Supabase project is lost, use the full-project recovery path so the Auth schema and password hashes are restored together.
- Never restore old refresh tokens or sessions during selective recovery.

## Phase 6 — Full-project recovery runbook

Document and test this order:

1. Declare an incident and prevent writes to the damaged project.
2. Select the newest verified backup before the loss event.
3. Verify and decrypt the archive.
4. Create a replacement Supabase project with compatible Postgres version, region, compute, and required extensions.
5. Restore roles, schema, data, Auth, and Storage metadata in the proven order.
6. Restore actual Storage objects.
7. Recreate configuration that is not stored in the database: Auth URLs/providers, API keys, Edge Functions, Realtime settings, webhooks, Cron, custom domains, and secrets.
8. Rotate project API keys and third-party credentials rather than blindly restoring secret values.
9. Run row-count, checksum, schema, RLS, Auth login, Storage download, and core application smoke tests.
10. Point a preview deployment at the replacement project and complete acceptance testing.
11. Switch production only after owner approval.
12. Preserve the damaged project and incident artifacts until the recovery is accepted.

## Manifest requirements

`manifest.json` must be versioned and contain at least:

```json
{
  "manifestVersion": 1,
  "manifestId": "unique-id",
  "projectRefHash": "non-reversible-project-identifier",
  "startedAt": "ISO-8601",
  "completedAt": "ISO-8601",
  "postgresVersion": "version",
  "supabaseCliVersion": "version",
  "backupWorkerVersion": "git-sha",
  "schemas": [],
  "tableCounts": {},
  "storage": {
    "bucketCount": 0,
    "objectCount": 0,
    "totalBytes": 0
  },
  "artifacts": [],
  "retentionTier": "daily",
  "encryption": {
    "scheme": "age",
    "recipientFingerprint": "fingerprint"
  }
}
```

Do not include database credentials, refresh tokens, emails, access tokens, raw record samples, or encryption private material.

## Automated test matrix

### Backup worker

- Refuses to start with missing secrets or a non-TLS database URL.
- Prevents overlapping runs and duplicate Drive archives.
- Detects a failed table export.
- Includes soft-deleted records.
- Includes Auth data and Storage metadata.
- Downloads all Storage objects, including empty and nested keys.
- Handles an empty Storage project successfully.
- Handles database payloads and Drive files larger than 5 MB.
- Encrypts before Drive upload.
- Removes plaintext after success and simulated failure.
- Rejects corrupted artifacts and checksum mismatches.
- Retains exactly 30 daily and 12 monthly successful archives.
- Deletes fully identified same-folder encrypted archives left unverified by an interrupted worker after the next successful run.
- Never deletes unrelated Drive files or the last known-good archive.
- Handles expired access tokens by refreshing them.
- Produces a reconnect-required failure when the refresh token is revoked.

### Tenant extraction

- Finds all rows for one farm across every registered table.
- Includes multiple profiles/users attached to the farm.
- Excludes every row from a second farm.
- Detects new unregistered farm-owned tables.
- Preserves tombstones, IDs, timestamps, and grain versions.
- Detects cross-farm ID collisions.
- Rejects ambiguous Storage ownership.

### Tenant apply

- Dry run performs zero writes.
- Merge mode inserts missing rows without overwriting conflicts.
- Snapshot mode changes only the target farm.
- Failure rolls back the target transaction.
- No hard deletes occur.
- Existing Auth users remain unchanged.
- Recreated users receive a new secure authentication flow.
- RLS prevents recovered users from seeing other farms and other users from seeing the recovered farm.

### Restore drill

- Fresh project accepts the complete logical restore.
- Source/restored schema inventories match.
- Source/restored table counts match.
- Auth login succeeds after configuration is applied.
- Storage object checksums match.
- AcreLedger builds and completes core read/write smoke tests against the recovered project.

## Verification gates before production scheduling

1. Backup worker unit and integration tests pass.
2. Existing `npm run lint`, `npm run typecheck`, `npm run typecheck:api`, `npm test`, and `npm run build` remain green if application/shared code changes.
3. Supabase database advisors show no new security or performance findings if migrations are added.
4. One complete manual backup is uploaded to Drive and verified.
5. That archive is restored into a disposable Supabase project.
6. Full source/restored inventories and counts match.
7. One test farm is extracted and applied to a separate test project.
8. A second farm in that test project is proven unchanged.
9. Owner confirms possession of two working copies of the age private key.
10. Failure alerts are deliberately triggered and received.
11. Only then enable the nightly Cloud Scheduler job.

## Ongoing operations

- Review backup status weekly.
- Run an automated isolated restore verification at least weekly if cost permits; otherwise monthly.
- Perform a timed single-farm recovery drill quarterly.
- Perform a full-project recovery drill at least twice per year.
- Rotate Google OAuth credentials and database backup credentials according to the security policy and immediately after suspected exposure.
- Update the tenant registry in the same change as every new or renamed farm-owned table.
- Update the backup manifest version when package layout or recovery semantics change.
- Keep recovery tools compatible with at least the oldest retained monthly backup or provide a tested migration adapter.

## Owner setup checklist

The implementing AI must stop and request these from the owner at the appropriate deployment step; never ask the owner to paste secret values into source files or chat:

- Google Cloud project and billing account selection.
- Personal Google account that will own the Drive folder.
- Supabase project reference, plan, region, database connection method, and database password rotation approval.
- Google Secret Manager access for storing the Supabase connection, Storage S3 credentials, Google OAuth refresh token/client secret, and alert configuration.
- Destination email for failure alerts.
- Two approved offline locations for the age private key.
- Approval before creating billable Cloud Run, Cloud Scheduler, disposable Supabase recovery projects, or PITR resources.

## Explicit non-goals

- Do not replace the existing customer manual JSON backup.
- Do not add per-farm Google Drive OAuth.
- Do not let customers browse owner archives.
- Do not use the AI assistant read catalog as a backup source.
- Do not treat Supabase database metadata as a backup of Storage object bytes.
- Do not restore one farm directly from a raw full dump into production.
- Do not automate destructive production recovery without an owner-reviewed dry run.
- Do not claim recovery capability until both full-project and isolated single-farm restore drills pass.

## Primary references to re-check at implementation time

- Supabase database backups: https://supabase.com/docs/guides/platform/backups
- Supabase CLI backup/restore: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Supabase restore to a new project: https://supabase.com/docs/guides/platform/clone-project
- Supabase Auth user migration: https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
- Supabase Storage downloads: https://supabase.com/docs/guides/storage/management/download-objects
- Google OAuth offline access: https://developers.google.com/identity/protocols/oauth2/web-server
- Google Drive scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Drive resumable uploads: https://developers.google.com/workspace/drive/api/guides/manage-uploads
