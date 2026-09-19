# Local disposable recovery drill

This rehearsal exercises only synthetic data in a temporary local directory. It does not read credentials, connect to Supabase or Google Drive, invoke `psql`, or mutate an external system.

Run with Node 22:

```sh
npm run drill:local --prefix scripts/recovery
```

## Scope proved

- Builds a synthetic two-farm backup tree with the required restore files.
- Writes artifact checksums and a manifest, creates a real `tar.zst` archive, extracts it, and verifies every recorded checksum.
- Recounts the restored synthetic rows and compares them with the manifest.
- Builds the checked-in single-transaction, side-effect-neutralizing `psql` restore command through an injected recorder; `psql` is deliberately not executed.
- Extracts only the target farm from the restored fixture, validates the tenant-bundle checksum, and runs merge mode as a zero-write dry run.
- Proves that adding the control farm's row to the target bundle is rejected before apply planning.
- Removes its temporary directory on success or failure.

## Not proved by this rehearsal

- `age` encryption/decryption or offline-key recovery.
- Real `pg_dump`/`psql` compatibility, extension restoration, constraints, triggers, or transaction behavior in a disposable Supabase project.
- Auth-user restoration, Storage object restoration, RLS behavior through real user sessions, or source-versus-restored live counts.
- Google Drive upload/download integrity, retention, scheduling, and alerts.

Those remain mandatory live/disposable-project gates in the owner recovery runbooks before production scheduling or an actual tenant recovery.

## 2026-09-19 receipt

The drill completed locally under Node 22 with no external mutation. The archive extracted successfully, checksums and synthetic table counts matched, the guarded restore command was planned once without execution, the tenant dry run wrote zero rows, and a bundle containing the control farm was rejected.
