# Cattle

Agent rules for the optional cattle book. Architecture detail is [BLUEPRINT → Cattle](../../BLUEPRINT.md#cattle).

> **Verified against code:** 2026-11-15, `679be07`. Files opened: `supabase/migrations/20261114120000_cattle_schema_and_rpcs.sql`, `supabase/migrations/20261115120000_cattle_events_pro_gate.sql`, `src/store/useCattle.ts`, `src/pages/Cattle.tsx`, `src/components/cattle/CattleEventsSection.tsx`, `src/lib/entitlements.ts`, `src/copy/entitlements.ts`, `src/test/aiAssistantTools.test.ts`. This is not a line-by-line audit.

<!-- contents:start -->
- [Switch](#switch)
- [Free and Pro](#free-and-pro)
- [Writes](#writes)
- [Mixed herds](#mixed-herds)
<!-- contents:end -->

## Switch

- Cattle is off unless `farms.runs_cattle` is true. The column is `NOT NULL DEFAULT false`. The Settings switch calls `set_runs_cattle`. While it is off, do not show the Cattle tile, the `/cattle` routes, or the field lines, and do not query the cattle tables.
- A database that does not have the column yet must not fail the farm load. A queued switch wins over the server value.

## Free and Pro

- Free, once `ENTITLEMENTS_MODE` is `enforce`: add and edit groups, move a group between pastures (`move_cattle_group`), and change a group's head count by editing the group. `updateCattleGroup` sends `head_count` only when the user changed it.
- Pro: `log_cattle_event` and `transfer_cattle_head` call `assert_premium(farm, 'cattle_events')` after an already-applied replay return. Weaning's "move N head" uses the transfer RPC. The feature name is on the `assert_premium` allowlist in `20261115120000_cattle_events_pro_gate.sql` and in `PREMIUM_FEATURES`.
- The cattle CSV is Pro on the client only. `Cattle.tsx` uses `isFreeTierLocked` and `ENTITLEMENT_COPY.cattleCsvLocked`. It does not call `assert_premium`. The file is built on the device from rows the farm already has.
- While `ENTITLEMENTS_MODE` is `off`, `assert_premium` and `isFreeTierLocked` do not refuse these actions. Do not turn the flag on from this file.
- Deleting a group, move, or event stays allowed on a free farm (`soft_delete_cattle_row`). Deleting an event reverses its head change and floors the count at zero. Deleting either half of a transfer reverses both.
- The Settings plan bullets in `paidPlanAdds()` do not name cattle. The cattle screens do.

## Writes

- Moves, events, transfers, deletes, and the current pasture change only through the RPCs (`move_cattle_group`, `log_cattle_event`, `transfer_cattle_head`, `soft_delete_cattle_row`, `set_runs_cattle`). Do not replace them with direct table writes. A group insert or edit is the direct `cattle_groups` write, with `farm_id` on the filter and no `.select()` after `.update()`.
- Offline replay uses one `__cattle_rpc` envelope. Replay re-stamps `p_farm_id`. A plain `farms` mutation without that envelope is discarded.
- No dollar fields, no hay tracking, and no individual animals.
- Ask the Book must not read `cattle_groups`, `cattle_moves`, or `cattle_events`.
- Backup, restore, account deletion, and `scripts/recovery/tenant-registry.ts` include the three tables. The six `20261114*` and `20261115*` cattle migrations must be live in production before a build that contains cattle is deployed.

## Mixed herds

Added 2026-11-25 (`20261126020000_cattle_mixed_herds.sql`). A herd (`cattle_groups` row) holds cows, heifers, bulls, calves, steers and stockers together.

- `cattle_groups` has six count columns: `cows`, `heifers`, `bulls`, `calves`, `steers`, `stockers`. `head_count` is always their sum; the `sync_cattle_class_counts` trigger enforces it. Never write `head_count` alone from new code.
- A write that changes only `head_count` (an older client, a backup without counts) puts the difference on the herd type's class (`_cattle_count_column(class)`; `mixed` → cows). A decrease that class cannot cover comes off the others in a fixed order. `src/lib/cattle/counts.ts` mirrors this (`herdTypeClass`, `countsFromRow`, `normalizeCattleGroup`).
- `class` is now the herd type. `mixed` is labeled "Cow-calf herd". The stored enum did not change, so older app builds still read it.
- `updateCattleGroup` sends the six counts and `head_count` only when a count changed (`mapCattleGroupUpdateToDb(..., { countsChanged })`). Editing one class never clears the others.
- `cattle_events` gains `cattle_class` (the class a head change hit; the from-class for a reclass), `to_class` + `class_head` (reclass only) and `calf_sex` (calving only). Event type `reclass` moves N head between classes inside one herd with `head_delta = 0`.
- `log_cattle_event(..., p_class, p_to_class, p_class_head, p_calf_sex)` and `transfer_cattle_head(..., p_class)` take the new arguments with `DEFAULT NULL`, so the older argument lists still resolve. Calving always hits calves. A class may not go below zero even if the herd total could cover it. Both RPCs return `counts` (`from_counts` / `to_counts` for a transfer); the client takes those over its optimistic counts.
- `soft_delete_cattle_row` reverses an event on its own class (floored at zero); a reclass is moved back. Old events without a class fall back to the herd type's class.
- Backup: `cattleGroupSchema.counts` is optional so older backups load; `restoreMappers.ts` aliases the six columns to `counts`, so an older backup sends only `head_count` and the trigger assigns it.
- The herd detail shows per-class counts, cow-calf pairs (calves paired with cows + heifers), females per bull, and this year's calves born / lost / calving % (calves born ÷ cows + heifers now in the herd — not cows exposed, which is not recorded).
