# Single-farm recovery

Use this when one customer farm needs to come back and every other farm must stay untouched.

Never restore one farm directly from a raw full dump into production.

## Modes

**Merge missing data** — default and safest. Inserts rows whose registered primary or business keys are absent. Its read-only preview reports existing keys and rejects keys owned by another farm instead of overwriting. It leaves the current login and farm membership alone.

**Restore farm to snapshot** — puts that farm back to the backup picture. Needs a second typed confirmation, a maintenance window for that farm, and a verified pre-recovery backup. Soft-deletes that farm's missing rows. Never hard-deletes farm records. Never writes another farm's rows.

## Procedure

1. Download and verify the encrypted owner archive.
2. Decrypt it with the offline age private key.
3. Restore it into a **disposable** isolated Supabase project in the same region when possible.
4. Before loading app data in that isolated project, the checked-in restore command neutralizes Cron schedules, outbound database webhook triggers, and application Realtime publications recreated by the schema, then verifies they are off. Also:
   - Do not attach production domains or clients
   - Do not load production Stripe, email, or webhook secrets
   - Do not bypass the restore command's enforced side-effect neutralization
5. Compare restored counts with `manifest.json`. Stop on mismatch.
6. Identify the farm by exact `farm_id`. Email or farm name may help you find candidates, but the command must show the resolved ID and you must type it back.
7. Inventory, then extract only that farm into a tenant bundle.
8. Dry-run apply against production. Confirm zero writes and review every reported existing-key conflict.
9. Take and verify a fresh pre-recovery backup of production.
10. Apply with the typed confirmation:
    - `MERGE-MISSING-DATA`
    - or `RESTORE-FARM-TO-SNAPSHOT`
11. After apply, sign in as the recovered user and as a different farm user. Each must see only their own farm.

## Auth during selective recovery

- If the Auth user still exists, do not change `auth.users`. Restore farm data only.
- If the account is gone, run the checked-in `recreate-auth-user.ts` owner command with a verified pre-recovery backup and the exact typed confirmation. It invites through the Auth Admin API, safely reassigns only an empty trigger-created profile/farm, remounts a surviving old profile onto the new Auth ID, writes a new checksum-protected tenant bundle without overwriting the source, and maps only registered user-ID columns. If attach fails, it removes the new Auth user and output bundle. The user will set a new password.
- Never restore old sessions or refresh tokens.
- If the whole project is gone, use full-project recovery instead.

## Storage

Current spray photos live inside database notes, so the SQL dump already has them. The extraction report lists every Storage key in the isolated project—including keys belonging to other farms—for manual review because no key is attributed automatically. Copy only an object that can be tied to the selected farm with certainty.
