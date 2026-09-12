# Owner backup operations

This is the nightly disaster-recovery copy of the whole AcreLedger book. It is not the Settings backup that a farmer downloads.

**Recovery point:** at most 24 hours of cloud data under normal operation.  
**Recovery time:** do not promise a clock time until the first timed drill.

## What success means

A run counts as successful only when all of these finish:

1. Database dump
2. Storage object copy
3. Encryption
4. Drive upload
5. Byte-length / checksum verification
6. Status manifest upload

A scheduler tick is not a successful backup. A partial upload is a failed run.

## Nightly schedule

- 02:00 America/Chicago
- Cloud Run Job `acreledger-owner-backup`
- Keep the newest 30 daily copies and 12 monthly copies
- Never delete the last known-good copy
- After a successful run, remove fully identified encrypted uploads left unverified by an interrupted prior run; leave unrelated or malformed Drive files untouched

Do not enable Cloud Scheduler until the verification gates below pass.

## Weekly review

1. Open the Drive folder `AcreLedger Database Backups`.
2. Confirm last night's encrypted file is present and the small status file says `success`.
3. Confirm failure alerts still reach the owner email.

## Alerts that must email the owner

- Any failed nightly run
- No verified backup within 30 hours
- Google authorization revoked
- Retention cleanup failed two nights in a row
- Restore verification failure

## Token reconnect

Testing-mode Google OAuth refresh tokens can die after seven days. Move the OAuth app to production before relying on it.

If backups fail with `AUTH_REVOKED`:

1. Revoke the old app access at Google Account → Security → Third-party access.
2. Run the local bootstrap command from `infrastructure/owner-backup` (`npm run bootstrap-drive`).
3. It writes a new refresh token straight into Secret Manager. Do not paste the token into chat or a source file.
4. Re-run one backup job and confirm success.

## Verification gates before production scheduling

1. `npm test --prefix infrastructure/owner-backup` and `npm test --prefix scripts/recovery` pass.
2. Existing app checks stay green if application code changed: `npm run lint`, `npm run typecheck`, `npm run typecheck:api`, `npm test`, `npm run build`.
3. One complete backup is uploaded to Drive and verified.
4. That archive is restored into a disposable Supabase project.
5. Source and restored counts match, including Auth users and Storage objects.
6. One test farm is extracted and applied to a separate test project; a second farm there stays unchanged.
7. Owner confirms two working copies of the age private key.
8. Failure alerts are deliberately triggered and received.
9. Only then enable the nightly scheduler.

## Owner setup still required

Stop here until the owner chooses these. Do not put the values in git or chat:

- Google Cloud project and billing account
- Personal Google account that will own the Drive folder
- Supabase project ref, region, connection method, and password-rotation approval
- Secret Manager access
- Destination email for failure alerts
- Two offline locations for the age private key
- Approval before creating billable Cloud Run, Cloud Scheduler, or disposable recovery projects
