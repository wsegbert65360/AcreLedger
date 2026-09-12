# Owner recovery CLI

These commands recover AcreLedger after a disaster. They are **owner tools**, not app screens, Vercel routes, or public RPCs.

The Settings backup that farmers download is unchanged. This toolkit reads the encrypted owner archive that contains deleted rows, Auth, Storage, and operational tables.

## Safety rules

1. Never restore one farm straight from a raw full dump into production.
2. Restore the archive into a disposable isolated project first.
3. Every production farm recovery needs a dry run, a fresh pre-recovery backup, an exact `farm_id`, and a typed confirmation.
4. Never paste the age private key, database password, or Google refresh token into chat or source files.

## Commands

```bash
npm test
npx tsx verify-backup.ts --archive path/to/file.tar.zst.age --identity path/to/age-identity --sha256 EXPECTED
npx tsx restore-isolated.ts
npx tsx inventory-tenant.ts
npx tsx extract-tenant.ts
npx tsx apply-tenant-recovery.ts
npx tsx recreate-auth-user.ts
```

See `docs/runbooks/single-farm-recovery.md` and `docs/runbooks/full-project-recovery.md`.
