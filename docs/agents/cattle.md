# Cattle

Agent rules for the optional cattle book. Architecture detail is [BLUEPRINT → Cattle](../../BLUEPRINT.md#cattle).

> **Verified against code:** 2026-11-15, `679be07`. Files opened: `supabase/migrations/20261114120000_cattle_schema_and_rpcs.sql`, `supabase/migrations/20261115120000_cattle_events_pro_gate.sql`, `src/store/useCattle.ts`, `src/pages/Cattle.tsx`, `src/components/cattle/CattleEventsSection.tsx`, `src/lib/entitlements.ts`, `src/copy/entitlements.ts`, `src/test/aiAssistantTools.test.ts`. This is not a line-by-line audit.

<!-- contents:start -->
- [Switch](#switch)
- [Free and Pro](#free-and-pro)
- [Writes](#writes)
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
