# Full-project recovery

Use this when the whole AcreLedger backend is gone or unusable. This restores every farm, Auth, and Storage into a **new** Supabase project.

Do not point production at the new project until the owner accepts the drill.

## Proven dump facts (CLI 2.107.0, checked 2026-09-10)

- `supabase db dump` schema dump **excludes** `auth` and `storage`.
- `supabase db dump --data-only --use-copy` **includes** Auth and Storage table data unless `--schema` is narrowed.
- This worker writes separate `auth-data.sql` and `storage-metadata.sql` so restore is explicit.
- Storage **files** are not in the SQL dump. They live under safely hashed paths in `storage/objects/`; `storage/objects-manifest.json` maps every archive path back to its exact bucket and object key.
- Prefer a direct `db.<ref>.supabase.co:5432` connection. Otherwise use the session pooler on port 5432. Never use transaction pooling (port 6543).

## Order

1. Declare the incident. Stop writes to the damaged project if it is still reachable.
2. Choose the newest **verified** backup from before the loss.
3. Verify the encrypted checksum, then decrypt with the offline age key.
4. Verify every internal checksum.
5. Create a replacement Supabase project with Postgres 17, the same region if possible, and required extensions (`pg_cron`, `pg_net`, and the others listed in `database/configuration.json`).
6. Do not connect production domains, billing webhooks, or app clients yet.
7. Set `RECOVERY_DATABASE_URL` to the replacement project's TLS database URL, then run the checked-in restore command from the repository root:

   ```bash
   npm run restore-isolated --prefix scripts/recovery -- --plaintext-dir <verified-decrypted-directory>
   ```

   `scripts/recovery/restore-isolated.ts` is the authority for the complete file order. It includes `auth-schema.sql`, `storage-schema.sql`, and migration schema/data files when present; fails if a required artifact is missing; runs `RECOVERY_SIDE_EFFECT_DISABLE_SQL` after schema loading; and only then enables replica mode and loads data. Do not replace it with a hand-written `psql` sequence.
8. Restore Storage objects into the exact bucket names and keys recorded beside each `archivePath` in `storage/objects-manifest.json`; verify each listed SHA-256 while streaming it.
9. Recreate configuration that is not in the database: Auth URLs, API keys, Edge Functions (`mrms-hourly`, `mrms-backfill`), Realtime publication on `profiles`, Cron jobs, custom domains.
10. Recreate Vault secrets **by name** (`mrms_automation_api_key`, `mrms_project_url`). Do not copy old API keys blindly — rotate them.
11. Compare counts with `manifest.json` for `auth.users`, `public.farms`, `public.profiles`, every farm-owned table, private operational tables, `storage.buckets`, and `storage.objects`.
12. Point a preview deployment at the new project and run core smoke tests.
13. Switch production only after owner approval.
14. Keep the damaged project and incident files until recovery is accepted.

## Auth note

Full-project recovery restores password hashes. Users should still expect to sign in again unless the JWT secret is deliberately copied. Prefer rotating keys.

## Do not claim this works until a drill passes

A disposable project restore must match source counts, Auth login must work after configuration, and Storage checksums must match before this runbook is treated as proven.
