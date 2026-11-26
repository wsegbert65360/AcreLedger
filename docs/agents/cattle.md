# Cattle

Agent rules for the optional cattle book. Architecture detail is [BLUEPRINT â†’ Cattle](../../BLUEPRINT.md#cattle).

> **Verified against code:** 2026-11-15, `679be07`. Files opened: `supabase/migrations/20261114120000_cattle_schema_and_rpcs.sql`, `supabase/migrations/20261115120000_cattle_events_pro_gate.sql`, `src/store/useCattle.ts`, `src/pages/Cattle.tsx`, `src/components/cattle/CattleEventsSection.tsx`, `src/lib/entitlements.ts`, `src/copy/entitlements.ts`, `src/test/aiAssistantTools.test.ts`. This is not a line-by-line audit.

<!-- contents:start -->
- [Switch](#switch)
- [Free and Pro](#free-and-pro)
- [Writes](#writes)
- [Mixed herds](#mixed-herds)
- [Herd health and breeding](#herd-health-and-breeding)
- [Weaning, sales and locations](#weaning-sales-and-locations)
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

Added 2026-11-25 (`20261126032045_cattle_mixed_herds.sql`). A herd (`cattle_groups` row) holds cows, heifers, bulls, calves, steers and stockers together.

- `cattle_groups` has six count columns: `cows`, `heifers`, `bulls`, `calves`, `steers`, `stockers`. `head_count` is always their sum; the `sync_cattle_class_counts` trigger enforces it. Never write `head_count` alone from new code.
- A write that changes only `head_count` (an older client, a backup without counts) puts the difference on the herd type's class (`_cattle_count_column(class)`; `mixed` â†’ cows). A decrease that class cannot cover comes off the others in a fixed order. `src/lib/cattle/counts.ts` mirrors this (`herdTypeClass`, `countsFromRow`, `normalizeCattleGroup`).
- `class` is now the herd type. `mixed` is labeled "Cow-calf herd". The stored enum did not change, so older app builds still read it.
- `updateCattleGroup` sends the six counts and `head_count` only when a count changed (`mapCattleGroupUpdateToDb(..., { countsChanged })`). Editing one class never clears the others.
- `cattle_events` gains `cattle_class` (the class a head change hit; the from-class for a reclass), `to_class` + `class_head` (reclass only) and `calf_sex` (calving only). Event type `reclass` moves N head between classes inside one herd with `head_delta = 0`.
- `log_cattle_event(..., p_class, p_to_class, p_class_head, p_calf_sex)` and `transfer_cattle_head(..., p_class)` take the new arguments with `DEFAULT NULL`, so the older argument lists still resolve. Calving always hits calves. A class may not go below zero even if the herd total could cover it. Both RPCs return `counts` (`from_counts` / `to_counts` for a transfer); the client takes those over its optimistic counts.
- `soft_delete_cattle_row` reverses an event on its own class (floored at zero); a reclass is moved back. Old events without a class fall back to the herd type's class.
- Backup: `cattleGroupSchema.counts` is optional so older backups load; `restoreMappers.ts` aliases the six columns to `counts`, so an older backup sends only `head_count` and the trigger assigns it.
- The herd detail shows per-class counts, cow-calf pairs (calves paired with cows + heifers), females per bull, and this year's calves born / lost / calving % (calves born Ã· cows + heifers now in the herd â€” not cows exposed, which is not recorded).

## Herd health and breeding

Added 2026-11-25 (`20261126040807_cattle_herd_health_breeding.sql`; the `sync_cattle_class_counts` SECURITY DEFINER hotfix is `20261126035847_cattle_counts_trigger_definer.sql`). All of it is Pro through the same `assert_premium(farm, 'cattle_events')` gate; deleting stays free.

- `cattle_treatments`: one row per treatment or vaccine for a herd (product, kind, optional class, head, dose + unit + per head / per 100 lb, route, withdrawal days, generated `withdrawal_until`, lot, given by). RLS select only; writes go through `log_cattle_treatment` / `delete_cattle_treatment` (`__cattle_rpc` envelope, `CATTLE_RPCS` and `ALLOWED_TABLES` include them). Deleting a herd tombstones its treatments. Backup, restore, the tenant registry and account deletion include the table.
- `cattle_events` gains `bred_count` / `open_count` / `not_checked_count` (preg check), `exposed_count` (`bull_in` only), `head_weaned` / `avg_weight` (weaning) and event types `bull_in` / `bull_out`. `log_cattle_event` takes `p_bred, p_open, p_not_checked, p_exposed, p_head_weaned, p_avg_weight`; older argument lists still resolve by name.
- Withdrawal: the product's days are typed once and remembered per product (`productMemory`). Shipping a herd or class during an active withdrawal asks for confirmation; it never blocks. The hold follows the cattle: a later `reclass` or transfer out of a held class carries it to the destination class and herd (the source stays held, since events do not say which head moved). A withdrawal badge shows on the herd card and detail.
- Stats (`src/lib/cattle/health.ts` `herdYearStats`): pregnancy %, calving %, weaning %, and weight weaned per cow exposed. Exposed comes from bulls-in records when there are any, otherwise the cows and heifers on hand (labeled).
- Exports: the cattle CSV has treatment rows and the new columns. The Pro treatment record PDF (`src/lib/cattle/treatmentRecordPdf.ts`, report type `cattle-treatment-record`) is server-authorized like the other Pro reports.
- No dollars, no animal IDs, no feeding records.

## Weaning, sales and locations

- Herd page buttons: Move, Sell, Death, Transfer, Wean calves. Sell, Death and Transfer take head per class (`src/lib/cattle/lines.ts`), so one save can be 24 steers and 3 cull cows.
- Each class line is its own queued event (`head_removed` / `death` / `transfer_cattle_head`). There is no batch id and no single server transaction (the plan's `wean_cattle_calves` RPC was not built); a failed later line reports "N of M saved" and earlier lines stay saved. Every call is already idempotent.
- Sales are `head_removed` with reason `shipped` (label "Sold / shipped"), optional `avg_weight` (accepted only when the sale covers one class), buyer or hauler in notes. No prices. Withdrawal conflicts still ask first. Deaths take an optional cause (`illness, calving, weather, predator, unknown, other`) in `reason`. Migration `20261126163733_cattle_sales_deaths.sql` widens the weaning-shape check and `log_cattle_event` validation for these.
- Wean calves records one `weaning` event (head weaned, avg weight), then `reclass` events calves to heifers / steers (split prefilled from this year's calving `calf_sex`; blank split keeps them calves), then optional transfers to an existing or new herd.
- Locations (`src/lib/cattle/locations.ts`, `LocationPicker`): pasture, hay fields and crop fields. Crop fields are offered after harvest or Sep 1 to Mar 31, otherwise under "Show all fields"; an unharvested crop field needs a confirmation. A new herd made by Transfer or Wean gets its first move to its location after the head land. One location per herd; splitting a herd is a transfer to a new herd.
- Still true: no dollars, no animal IDs, no feeding records; Pro-only writes via `assert_premium(farm,'cattle_events')`, deleting stays free.
