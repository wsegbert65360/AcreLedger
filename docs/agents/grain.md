# Grain movement

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: `src/store/farmStore.tsx` (`getBinTotal` takes an optional season and is all-season when omitted). This is not a line-by-line audit of every historical date.

<!-- contents:start -->
<!-- contents:end -->

## Grain Movement

Canonical detail: [BLUEPRINT → GrainMovement](../../BLUEPRINT.md#grainmovement).

- `bushels` may be negative (estimate-vs-actual correction). Never clamp; display a warning, not a validation error.
- Bin inventory is season-independent (see Season Scoping). Validate sales against `getBinTotal(bin.id)`.
- Online and replayed updates/deletes carry the expected `grain_movements.version` captured from the render closure. Never use the activity `timestamp` as the concurrency token.
- A bin harvest and its incoming movement are one operation: create through `create_harvest_with_grain`, soft-delete through `soft_delete_harvests_with_grain`, queue offline as one envelope, and roll back both collections together.
