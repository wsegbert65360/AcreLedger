# Owner disaster-recovery backup worker

This package is **owner-only operational infrastructure**. It is not a customer Google Drive integration and must never be wired into the AcreLedger app, Vercel functions, or farm settings.

Each successful run writes one encrypted archive to the owner's personal Drive folder `AcreLedger Database Backups`.

## What a run includes

- Database roles, public/application schema, and COPY-formatted data
- Auth users and identities (password hashes included for full-project recovery)
- Storage metadata plus actual Storage object bytes
- Private operational schemas (`ai_assistant_private`, `weather_proxy_private`)
- Soft-deleted rows
- SHA-256 checksums and a non-PII manifest

The farmer-facing Settings backup is unchanged. This archive is broader and must not be downloadable by ordinary app users.

## Local commands

```bash
npm install
npm test
npm run typecheck
```

Do not put database passwords, OAuth tokens, or the age private key in this repository. Runtime secrets belong in Google Secret Manager.

## Stop conditions

A live dump into a disposable Supabase project, Cloud Run, and Cloud Scheduler are **not** enabled by this change. Those need owner approval and credentials that must never be pasted into chat.
