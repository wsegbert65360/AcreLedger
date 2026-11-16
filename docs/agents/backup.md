# Backup and restore

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/lib/backupSchema.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [Backup and Restore](#backup-and-restore-1)
<!-- contents:end -->

## Backup and Restore

Canonical detail: [BLUEPRINT → Backup / Restore Farm Ownership](../../BLUEPRINT.md#backup--restore-farm-ownership).

This file is the in-app farm JSON backup (Settings → Backup Data). Object GRANT/privilege capture for the owner SQL disaster-recovery dump is in [owner-dr.md](./owner-dr.md); do not mix the two.

- The currently selected `farm_id` is authoritative: merge `{ ...record, farm_id }` (or `{ ...record, farmId: farm_id }` for FSA tract/CLU app types) before every mapper call.
- Backups include `backupVersion`, `fsaTracts`, and `cluAssignments`. Unversioned backups pass through `normalizeBackupForRestore` before strict validation. Settings and pre-rollover backups must pass `backupSchema` before download.
- Restore helpers write only JSON-present columns; never enumerate every column through `jsonb_populate_record(set)`.
- Never hydrate React state from raw backup arrays. If the restore RPC fails, do not mutate state.
- Season rollover requires a completed cloud load and an empty sync queue, advances exactly one year up to `currentYear + 1`, downloads the JSON backup, then calls `start_pre_season_reset`. The new season is shown immediately and rolled back if that call fails. The latest server snapshot is undone with `undo_pre_season_reset` (free farms included). Uploading a backup file still uses `restore_farm_backup`. `profiles` must stay in the `supabase_realtime` publication.
