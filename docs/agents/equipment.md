# Equipment and maintenance

Moved from the AGENTS.md routing index. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: `src/pages/Equipment.tsx`, `src/store/useEquipment.ts`, `supabase/migrations/20261006214500_equipment_maintenance.sql`, `supabase/migrations/20261006233000_equipment_meter_rpcs.sql`. The equipment UI is mounted with no feature flag. This is not a line-by-line audit.

<!-- contents:start -->
- [Equipment](#equipment)
<!-- contents:end -->

## Equipment

- [src/types/equipment.ts](../../src/types/equipment.ts), [src/store/useEquipment.ts](../../src/store/useEquipment.ts), and [src/pages/Equipment.tsx](../../src/pages/Equipment.tsx) — non-seasonal equipment state, atomic meter/service mutations, and the equipment UI (live for all users; no feature flag).
- [src/lib/equipment](../../src/lib/equipment) — due-status, meter conversion, parked-mutation overlay, and CSV export helpers. Details: [BLUEPRINT → Equipment and Maintenance](../../BLUEPRINT.md#equipment-and-maintenance).
- [supabase/migrations/20261006214500_equipment_maintenance.sql](../../supabase/migrations/20261006214500_equipment_maintenance.sql) and [20261006233000_equipment_meter_rpcs.sql](../../supabase/migrations/20261006233000_equipment_meter_rpcs.sql) — tenant-scoped schema and atomic RPC contracts. Do not replace these RPCs with client-side read/compare/write sequences.
