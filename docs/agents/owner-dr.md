# Owner disaster recovery

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-16. Files opened: infrastructure/owner-backup/src/databaseExport.ts, infrastructure/owner-backup/src/privileges.ts, scripts/recovery/restore-isolated.ts, docs/runbooks/full-project-recovery.md. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [Owner Disaster Recovery (Implemented Tooling; Deployment/Drills Pending)](#owner-disaster-recovery-implemented-tooling-deploymentdrills-pending)
<!-- contents:end -->

## Owner Disaster Recovery (Implemented Tooling; Deployment/Drills Pending)

> **Status: not yet deployed.** Scheduling, Drive uploads, and both recovery drills are unproven. Do not describe this as operational.

Canonical detail: [BLUEPRINT → Owner Whole-Project Disaster Recovery](../../BLUEPRINT.md#owner-whole-project-disaster-recovery-implemented-tooling-deploymentdrills-pending) and the plan in `docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md`.

- Owner-only, whole-project infrastructure: not a per-farm Drive connection and not a replacement for Settings → Backup Data. Never run dumps in the browser, the Capacitor app, a public Vercel endpoint, or a customer-accessible RPC.
- Archives keep everything, including soft-deleted rows, Auth, Storage bytes, and base64 spray images (the AI image-stripping boundary does not apply). Encrypt with the public key before upload; runtime secrets stay in Google Secret Manager.
- Database dumps must keep object privileges (`privileges.sql`: GRANT/REVOKE and ALTER DEFAULT PRIVILEGES). Capture them with `pg_dump --schema-only --no-owner`; do not use `--no-privileges`/`-x` as a privilege-suppression flag. Keep `--no-owner`. `supabase db dump` (CLI 2.107.0) still omits GRANTs, so the in-repo worker dumps privileges separately. Restore applies `privileges.sql` after schema files and before data. A dump taken without privileges can leave SECURITY DEFINER functions executable by `anon`/`authenticated` after restore.
- The owner's live PC nightly dump already includes privileges (Ops removed `--no-privileges` on 2026-11-10 and kept `--no-owner`). That PC script is not in this repository and is not changed here. This in-repo owner-DR dump/restore path is the remaining fix.
- Never restore a whole archive into live production to recover one customer. Restore into an isolated project with `npm run restore-isolated --prefix scripts/recovery -- --plaintext-dir <verified-decrypted-directory> --confirm-isolated-ref <isolated-project-ref>`; do not substitute a hand-written `psql` order. After a human test restore, compare function EXECUTE grants for `anon`/`authenticated` with the source (see `docs/runbooks/full-project-recovery.md`).
- Single-farm recovery and Auth-user recreation must dry-run first, create a verified pre-recovery backup, stay scoped to one farm, and never hard-delete farm records.
- Every new or renamed farm-owned table updates `scripts/recovery/tenant-registry.ts` and its `information_schema` coverage test in the same change. Bump the manifest version when archive layout or recovery semantics change.
