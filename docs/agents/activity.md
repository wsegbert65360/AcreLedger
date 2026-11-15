# Activity records

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/components/PlantModal.tsx, src/hooks/useUndoDelete.ts, src/lib/utils.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
<!-- contents:end -->

## Activity Record Acreage Defaults

This rule applies to **every** activity modal that captures a per-record acreage/area value. Today that is spray (Treated Area Size above), **plant** (`PlantModal` `acreage`), and **fertilizer** (`FertilizerModal` `acres`). Harvest, hay, tillage, custom spray, and grain movement have no acreage field and are out of scope.

- The **new-record default** and every report/export fallback must use `getDisplayFieldAcres(field, cluAssignments)` — the FSA crop acreage — never a raw `field.acreage` read. `PlantModal` and `FertilizerModal` pull `cluAssignments` from `useFarm()` and compute `displayFieldAcres` for the default, mirroring `useSprayForm`.
- Each modal wraps its acreage setter in an **edited-ref** (`treatedAreaEditedRef` / `acreageEditedRef`) and runs a **CLU-hydration refresh effect** so the default self-corrects if CLU assignments load after the modal opens, while respecting manual edits and preserving stored values on edit/duplicate.
- An explicitly stored per-record acreage (e.g. a partial-field spot-spray or spot-application) is always preserved; only the default/fallback changes.
- Historical plant and fertilizer records were backfilled to FSA cropland acreage by migrations `20260715130000_backfill_plant_acreage_to_fsa_acreage.sql` and `20260715120000_backfill_fertilizer_acres_to_fsa_acreage.sql`, matching the spray backfill precedent. These historical one-shots are retired by the review-07 guard migration; never rerun them as data repair. New activity defaults must preserve explicit stored values. Any future backfill needs separately scoped approval, null/default-only selection, and pre-images.

## Activity Record Modals

All activity record modals (`PlantModal`, `SprayModal`, `HarvestModal`, `HayModal`, `FertilizerModal`, `TillageModal`, `GrainMovementModal`, and the lightweight `CustomSprayModal`) share a common prop and behavior pattern. `CustomSprayModal` is reached via `SprayTypeChooser` (not a top-level activity button) and its records render inside the Spray tab through `CustomSprayTab`.

- **`mode?: 'edit' | 'duplicate'`** — defaults to `'edit'`. Pass `'duplicate'` to open the modal pre-filled from an existing record but creating a new record on save instead of updating the source.
- **`isDuplicate = mode === 'duplicate' && !!initialData`** — every modal computes this locally. Duplicate mode without `initialData` falls through to "new" behavior.
- **Duplicate semantics**: stamp today's date (not the source record's date), stamp `viewingSeason` as `seasonYear` (not the source's season), and call `addXxxRecord` (not `updateXxxRecord`) on save.
- **`onDuplicate?` callback** is plumbed through `RecordListItem` → activity tabs (`PlantTab`, `SprayTab`, `HarvestTab`, `HayTab`, `FertilizerTab`, `TillageTab`, `GrainTab`) and `HistoryFeed` → `Activity.tsx` / `FieldDetailScreen.tsx`. Tabs that don't pass `onDuplicate` simply hide the duplicate button.

**Suggested-record prefill**: when opening a modal without `initialData` (new record), each modal pre-fills non-date fields from the most recent prior record of the same type for that field — e.g., spray pre-fills applicator name, license number, target pest, and tank-mix products from the last spray on the field; plant pre-fills crop and seed variety; hay pre-fills bale type; etc. Use `getLatestForField` from `@/lib/utils` to compute the source record. Duplicate mode bypasses the prefill (it uses `initialData`).

**`editingRecordType` discriminator**: `Activity.tsx` and `FieldDetailScreen.tsx` track the clicked record's type in a separate `editingRecordType` state and gate modal rendering on it (`editingRecordType === 'plant' && ...`), NOT on the visible tab. This lets users click edit/duplicate on any record from the All/History tab and still get the correct modal — gating on `tab` would fail when the user is on the All tab. Modal `onClose` handlers must reset all three states together: `setEditingRecord(null); setEditingRecordType(null); setEditingMode('edit')`.

**Spray review queue**: `Activity.tsx` includes a review-queue filter for incomplete/non-compliant spray records (`nonCompliant === true`). Keep the queue scoped to `viewingSeason`, the current search filter, and pending-delete filtering so it matches the records the user can act on.

## Undo-Delete Pattern

Field deletion uses an undo-safe pattern via `src/hooks/useUndoDelete.ts`. Instead of a blocking AlertDialog confirmation, the record is hidden immediately with a toast undo affordance. The mutation commits only after the undo window expires:

```ts
const { pending, requestDelete } = useUndoDelete<T>({
  onCommit: async (ids) => { /* actual deleteField() calls */ },
  onError: () => toast.error('Failed to delete field.'),
});

// Call site:
requestDelete([fieldId], `Field "${field.name}" deleted`, field.name);
```

`pending` is a `Set<T>` of IDs pending deletion. Filter it out of render arrays: `fields.filter(f => !f.deleted_at && !pending.has(f.id))`. Never call the delete API directly from a UI click handler when using this hook.
