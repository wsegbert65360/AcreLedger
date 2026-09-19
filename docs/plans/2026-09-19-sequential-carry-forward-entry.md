# WP-1 "Keep the Run" — Fast Sequential Single-Field Entry with Selective Carry-Forward

**Date:** 2026-09-19
**Status:** Approved by product owner (scope locked; see Binding Rule). Ready for engineering.
**Author:** product-architect (Compass)
**Next owner:** Principal Engineer
**Artifacts this plan changes:** new code only at implementation time. This document adds no code.

---

## 1. Problem

Operators work a run: they spray (or fertilize, or plant) one field, then move to the next and do it again. Today each new form pre-fills only from **that field's own last record** of the same type (`getLatestForField`, `@/lib/utils`), filtered to the viewing season. Mid-run, the next field's form either comes up blank or — worse — pre-fills from that field's stale record from weeks ago with a **different tank mix**. The operator re-enters products, applicator, license, and equipment at every stop, or risks saving a stale mix.

The fix is **carry-forward, not batching**: one field = one form = one record, with run-persistent details carried from the record the operator *just* created.

## 2. Binding Product Rule (owner decision, 2026-09-18)

> Do **NOT** build bulk field entry for spray, fertilizer, or planting. Operators enter each field separately as work happens, not as an end-of-day batch. Optimize **sequential entry** by carrying forward appropriate prior details while creating an **independent record per field/operation**.

Hard constraints:

- **C1.** No UI path may select multiple fields or create more than one record per submit. Enforced by test (AC-4).
- **C2.** Every created record is independent: its own `fieldId`, `farm_id`, `seasonYear`, timestamps, acreage/area, weather/conditions, and compliance flags.
- **C3.** Field-specific values are **never** carried from the source record (see matrix in §6).
- **C4.** This rule supersedes the June 2026 UI audit's "Bulk Apply" recommendation (Priority 2) and any backlog reference to it.

## 3. Goals / Non-Goals

**Goals**

- G1. Cut re-entry of run-persistent details (tank mix, applicator, license, equipment) to one tap between fields.
- G2. Keep every record compliant-by-construction: per-field time, area, and conditions.
- G3. Zero schema, sync-queue, or report changes.
- G4. Work identically online and offline (suggestion computed from local state).

**Non-Goals** — see §11 (Out of Scope).

## 4. Current State (verified in code, 2026-09-19)

| Fact | Location |
|---|---|
| Shared latest-record helper: `getLatestForField(records, fieldId, dateKey, filter?)` | `@/lib/utils` |
| Spray prefill: `suggestedSpray = getLatestForField(sprayRecords, field.id, 'sprayDate', r => r.seasonYear === viewingSeason)`; prefills products (via `normalizeProducts`, fresh `ui_id` per product), `applicatorName`/`licenseNumber` (suggestion → `localStorage al_applicator_name_*` fallback), `targetPest` (→ `'grass/broadleaves'`); `equipmentId` from `localStorage al_equipment_id_*`; weather auto-pull `WeatherService.fetchCurrentWeather(\`${field.lat},${field.lng}\`)` on open | `src/hooks/useSprayForm.ts` (~L136–213, 237) |
| Spray wizard: steps `core → mix → conditions → review` (`WIZARD_STEPS`), in-cab quick mode (`al_spray_quick_mode`), compliance flags `isMinimumValid`/`isFullyCompliant` | `src/components/SprayModal.tsx`, `src/components/spray/*` |
| Plant prefill: `suggestedPlanting` = latest planted, current season; carries only `seedVariety` + `crop`; everything else field-default or blank; `plantDate` = today; `acreage` default = `displayFieldAcres` with `acreageEditedRef` + CLU-hydration refresh | `src/components/PlantModal.tsx` (~L89–130) |
| Fertilizer prefill: `suggestedFertilizer = getLatestForField(fertilizerApplications, field.id, 'date')` — **deliberately cross-season** (comment in code); carries `fertilizer_formula` only; visible prefill-note UI already exists; `acresEditedRef` + CLU refresh; save payload `{ fieldId, date, acres, fertilizer_formula }` | `src/components/FertilizerModal.tsx` (~L65–115, ~L240) |
| Store actions stamp `seasonYear`/`farm_id` server-side of the hook: `addSprayRecord`, `addPlantRecord`, `addFertilizerApplication` (all `Omit<…, 'seasonYear' \| 'farm_id' …>`) | `src/store/farmStore.tsx` (L94–118) |
| Acreage helpers: `getDisplayFieldAcres(field, cluAssignments)`, `getEffectiveSprayTreatedAcres(record, field, cluAssignments)` | `@/lib/fieldAcreage` |
| Quick Add: GPS nearest-field via squared Euclidean distance, `preselectedType`, `lastUsedFieldId` | `src/components/QuickAddDialog.tsx` |
| Activity deep link opens one-time editor: `/activity?tab=…&record=…&type=…` | `src/pages/Activity.tsx` (~L72–148) |
| Record types: `SprayRecord`, `PlantRecord`, `FertilizerApplication` | `src/types/farm.ts` |
| Wind alert threshold `WIND_ALERT_MPH = 10`, canonical export | `@/lib/weatherHelpers` |

New-record entry points that must all get the behavior: **Field detail actions** (`FieldDetailScreen.tsx` `FIELD_ACTIONS`), **Quick Add** (`QuickAddDialog.tsx`, including GPS nearest-field), and any future entry point that opens these three modals for a field.

## 5. UX Design

### 5.1 The carry chip

When a new-record form opens for field **B** and a qualifying source record exists (§7), show a dismissible **carry chip** at the top of the form (top of `WizardStepLayout` in SprayModal's core step; top of the form body in PlantModal / FertilizerModal):

```
[⏱ Carry from Field A · 8:42 AM today]
  Applies products, applicator, and equipment.
  Area, time, and weather stay specific to this field.
  [ Carry details ]  [ Start fresh ]
```

- **Carry details** — applies the carry set (§6) into the form; toast "Details carried from Field A"; chip collapses to a small removable tag ("Carried from Field A ✕") so the origin stays visible at review time.
- **Start fresh** — chip disappears; form opens blank **except** existing same-field/`localStorage` defaults that already exist today (applicator name, license, equipment ID). No silent stale prefill behind the chip.
- Removing the tag after carrying reverts only carry-set fields to their defaults; reset-set fields are never disturbed.

### 5.2 Precedence (deliberate change, keep narrow)

1. **Edit or duplicate mode** (`initialData` present): no chip — existing modes are unchanged.
2. **Same-day cross-field source exists** (§7): chip takes precedence; the form does **not** auto-prefill from a stale same-field record while the chip is visible.
3. **No same-day cross-field source:** behavior is **exactly today's** (same-field suggestion prefill, `localStorage` defaults, weather pull). No regression.

Rationale: mid-run, a same-field record from three weeks ago is the *wrong* prefill source; the record from 20 minutes ago on the previous field is the right one. We only change behavior when a fresher, cross-field source exists.

### 5.3 Per-surface notes

- **Spray wizard:** chip renders on the **core** step; in-cab **quick mode** shows the same chip (that's where seconds matter most). On carry, the operator still walks the steps; the conditions step pulls weather for the current field as it does today.
- **Plant / Fertilizer modals:** chip sits above the existing form; FertilizerModal's existing "Prefilled from last entry on this field…" note and the chip are mutually exclusive by the precedence rule (§5.2).
- **Quick Add:** no changes to QuickAddDialog itself; the chip appears inside whichever modal it opens (including the GPS nearest-field path — the primary in-cab flow).
- **Custom spray** (`SprayTypeChooser` → `CustomSprayModal`): no chip in v1 (§11).

### 5.4 Copy rules

Plainspoken, no jargon: name the **source field** and **time**, state plainly what carries and what doesn't. Buttons are verbs. Never say "batch", "bulk", or "apply to multiple fields" anywhere in this feature.

## 6. Carry / Reset Matrix (exact fields)

Legend: **CARRY** = copied from source into the new form (editable afterward). **RESET** = computed fresh for this field/record; never read from the source. Field names match `src/types/farm.ts`.

### 6.1 Spray (`SprayRecord` → new record on field B)

| Field(s) | Behavior |
|---|---|
| `products[]` (`SprayRecipeProduct[]`: product name, `epaRegNumber`, active ingredient, rate, rate unit) | **CARRY** — mapped through the existing `normalizeProducts` path with fresh `ui_id` per row (never reuse source `ui_id`s or array indices) |
| `applicatorName`, `licenseNumber`, `equipmentId`, `applicationMethod`, `complianceProfile`, `rei` | **CARRY** |
| `targetPest`, `cropOrSiteTreated` | **CARRY** (editable; operator may change crop per field) |
| `nozzleType`, `nozzleSize`, `pressurePsi`, `boomHeight`, `actualSpeed` | **CARRY** (equipment setup persists across a run) |
| `fieldId`, `fieldName` | **RESET** — current field |
| `sprayDate`, `startTime` | **RESET** — today / now at this stop; `endTime` blank |
| `treatedAreaSize`, `treatedAreaUnit` | **RESET** — new-record default = FSA cropland acreage via `getDisplayFieldAcres(field, cluAssignments)` (the AGENTS.md treated-area default; explicit edits preserved by the existing `treatedAreaEditedRef` pattern). Never copy the source's stored value (spot-spray values must not leak) |
| Weather: `windSpeed`, `windDirection`, `temperature`, `relativeHumidity`; end-of-run: `windSpeedEnd`, `windDirectionEnd`, `tempEnd` | **RESET** — existing `WeatherService.fetchCurrentWeather(field.lat, field.lng)` pull for the **current** field; end-of-run fields blank. If the pull fails, manual entry works exactly as today. **Weather is never carried** (drift risk between stops is the #1 compliance variable) |
| `sensitiveAreaCheck`, `sensitiveAreaNotes` | **RESET** — blank/false; field-specific safety check |
| `notes` | **RESET** — blank |
| Legacy scalars: `epaRegNumber` (top-level), `applicationRate`, `rateUnit`, `mixtureRate`, `totalMixtureVolume`, `totalAmountApplied`, `isPremixed`, `involvedTechnicians` | **RESET/DERIVE** — do not copy; per AGENTS.md these are legacy summaries derived at save from products |
| `nonCompliant` and all compliance flags | **RESET** — recomputed from carried products + this record's own conditions/area by existing logic |
| `id`, `timestamp`, `seasonYear`, `farm_id`, `deleted_at` | **RESET** — store-stamped (`addSprayRecord`); season = `viewingSeason` |

### 6.2 Plant (`PlantRecord`)

| Field(s) | Behavior |
|---|---|
| `crop`, `seedVariety` | **CARRY** (same set the existing same-field suggestion carries today) |
| `acreage` | **RESET** — `displayFieldAcres` default, `acreageEditedRef` + CLU-hydration refresh unchanged |
| `plantDate` | **RESET** — today |
| `cropStatus`, `cropSequence` | **RESET** — `'Planted'` / `'First Crop'` defaults |
| `intendedUse`, `producerShare`, `irrigationPractice` | **RESET** — field defaults (current behavior) |
| `plantingPattern`, `memo` | **RESET** — blank |
| FSA farm/tract/field numbers | **RESET** — field-derived, current behavior |
| `id`, `timestamp`, `seasonYear`, `farm_id`, `deleted_at` | **RESET** — store-stamped |

### 6.3 Fertilizer (`FertilizerApplication`)

| Field(s) | Behavior |
|---|---|
| `fertilizer_formula` | **CARRY** (same set the existing same-field suggestion carries today) |
| `acres` | **RESET** — `displayFieldAcres` default with `acresEditedRef` + CLU refresh (validated `> 0` at save) |
| `date` | **RESET** — today |
| `id`, `timestamp`, `seasonYear`, `farm_id`, `deleted_at` | **RESET** — store-stamped |

Fertilizer has no weather/time/compliance surface; the matrix is small by design. Note: the existing same-field fertilizer prefill is intentionally **cross-season** (documented in code) — that behavior is untouched. The **chip** source (§7) is always same-season + same-day for all three types.

## 7. Source Selection & Recency (v1 rules)

A source record qualifies for the chip when **all** hold:

1. Same record type (spray → spray, plant → plant, fertilizer → fertilizer).
2. `fieldId` ≠ current field (cross-field; same-field prefill is the existing behavior).
3. Its application date is **today, local calendar day** (spray: `sprayDate`; plant: `plantDate`; fertilizer: `date`, compared via the local-date helpers in `@/utils/dates` — never `new Date(iso)` date math).
4. `seasonYear === viewingSeason` and `deleted_at === null`.
5. The record exists in local React state (farmStore) — true offline by construction.

Selection: the **most recent** qualifier per the type's date key (spray: `timestamp`, display `startTime`; plant/fertilizer: date — ties broken by `timestamp`). Only **one** candidate is offered in v1 (no picker). If the operator needs an older/different source, the existing **duplicate** flow on any record (Activity feed / field history) remains the path.

New pure helper (testable, no React):

```ts
// src/lib/carryForward.ts
getCarryForwardSource<T extends { fieldId: string; deleted_at: string | null; seasonYear: number }>(
  records: T[],
  currentFieldId: string,
  viewingSeason: number,
  opts: { dateKey: keyof T; todayLocalIso: string }
): T | null
```

Mapping from source → form stays in each modal/hook (they own their setters); the helper only picks the source. `getLatestForField` is **not** modified.

## 8. Offline Behavior

- The chip and carry work fully offline: source selection reads farmStore's in-memory collections (the same data `getLatestForField` uses today).
- Weather: offline pull fails → manual entry (existing behavior, preserved per the custom-spray precedent). The chip does not change this.
- Saving enqueues through the existing store actions and sync queue — **single-record mutations, no batch changes** (binding rule C1; AGENTS.md optimistic-update and sign-out-queue rules apply unchanged).
- No new `localStorage` keys except none required in v1 (dismiss is per-open, §10).

## 9. Edge Cases

| Case | Behavior |
|---|---|
| No same-type record today (or farm has one field) | No chip; standard form |
| Source record soft-deleted after chip shown | Harmless — accept copies values into form state; no reference is held at save |
| Only candidate is on the **current** field | Not a chip candidate; existing same-field prefill applies |
| Viewing a historical season | Chip suppressed (rule 4) unless source matches `viewingSeason` |
| Edit/duplicate mode | Chip suppressed (§5.2) |
| User edits carried fields, then taps Carry again | Re-apply overwrites carry-set fields only; toast confirms |
| Two fields sprayed today | Most recent wins (v1; picker is out of scope) |
| Spray quick mode (in-cab) | Chip shown; same behavior |
| Partial-field spot spray yesterday + run today | Spot value never carried (`treatedAreaSize` is RESET) |
| `SprayTypeChooser` path | Chooser unchanged; chip lives in `SprayModal`, not the chooser or `CustomSprayModal` |
| Weather pull returns partial data | Existing partial-fill behavior; carried nothing — nothing to reconcile |

## 10. Accessibility & Mobile

- Chip row and buttons meet the repo's 44px (`h-11`) minimum touch-target rule; full-width on narrow screens; inside the existing modal scroll (safe-area handled by the modal).
- Announce via `aria-live="polite"` ("Suggestion available: carry spray details from {field}, {time} today"); chip is keyboard-operable (Enter/Space), first in the modal's form tab order, with visible `focus-visible:ring-2` focus.
- No color-only meaning: icon + text on both buttons; semantic theme tokens (dark mode/high-contrast safe); long field names truncate with ellipsis and full name available via `title`.
- Plain-language copy at roughly 8th-grade reading level; no compliance jargon in the chip.
- Optional polish (non-blocking): a one-time coachmark via the existing `useCoachmarks` system introducing the chip.

## 11. Out of Scope (explicit)

1. **Any multi-field or bulk creation** for spray, fertilizer, or planting — forbidden by the binding rule (§2), not "deferred".
2. Carry-forward for tillage, harvest, hay, grain, or custom (`outside-party`) spray records.
3. Multi-day carry (yesterday's mix), source-picker UI, persistent "don't ask again" preference, cross-season carry.
4. Schema/migrations, `syncQueue` changes, backup/restore changes, report/export changes, recipe-system changes.
5. Remote analytics implementation (§12 defines the seam + events; wiring a sink requires separate owner approval and a privacy-policy update).
6. Auto-refreshing weather when the operator changes fields mid-form (v1 keeps the existing open-time pull + manual override).

## 12. Privacy-Preserving Analytics (seam now, wiring deferred)

Single seam: `trackProductEvent(event, props)` in a new `src/lib/productAnalytics.ts` — a no-op by default, never throws, never blocks UI. No PII, no identifiers, no free text: event props are enums/coarse buckets only (no field names, no crop/product names, no user/farm ids).

| Event | Props | Purpose |
|---|---|---|
| `carry_suggestion_shown` | `recordType: 'spray'\|'plant'\|'fertilizer'` | Exposure count |
| `carry_suggestion_accepted` | `recordType` | Adoption |
| `carry_suggestion_declined` | `recordType` | Rejection signal |

Instrumentation may ship as the no-op stub (AC-9). Enabling any remote sink is a separate owner-approved change with a privacy-policy update.

## 13. Acceptance Criteria

- **AC-1.** After logging a spray on field A today, opening a new spray for field B (via field actions, Quick Add + GPS nearest-field, or Activity entry) shows the chip with field A's name and time; accepting prefills exactly the §6.1 carry set.
- **AC-2.** After accept, the form shows field-specific values: `sprayDate`/`startTime` = now, treated-area default = field B's FSA cropland acreage, weather pulled for field B (or manual on failure); review lists this record only.
- **AC-3.** Same behavior for plant (`crop`, `seedVariety` carried; `plantDate`/`acreage` fresh) and fertilizer (`fertilizer_formula` carried; `date`/`acres` fresh).
- **AC-4.** No UI path selects multiple fields or creates >1 record per submit; a unit test asserts each save path produces a single record per submission.
- **AC-5.** Each saved record is independent (own `farm_id`, `seasonYear` = `viewingSeason`, timestamps, area, conditions, compliance flags) and appears separately in the Spray/Activity feeds, field history, and all existing reports with **zero report-code changes**.
- **AC-6.** Declining yields a fresh form; with no same-day cross-field source, behavior is byte-for-byte today's (existing same-field prefill + `localStorage` defaults).
- **AC-7.** Edit/duplicate modes show no chip; existing duplicate semantics unchanged.
- **AC-8.** Offline: chip works from local state; save enqueues a single mutation; weather failure leaves manual entry fully functional.
- **AC-9.** Analytics events emit through the no-op seam with the exact names/props in §12 (no PII).
- **AC-10.** Chip is keyboard-operable, `aria-live` announced, ≥44px targets, no color-only indicators; passes the repo's dialog-description/label conventions.
- **AC-11.** New unit tests cover: source selection (same-day, same-season, cross-field, most-recent, soft-delete exclusion, single-field farm), carry/reset mapping per type (spot-spray value not carried; fresh `ui_id`s), and chip suppression rules. `npm run lint`, `typecheck`, `test`, `build` all green.

## 14. Implementation Touchpoints (guidance, not code)

- **New:** `src/lib/carryForward.ts` (helper per §7) + `src/lib/__tests__/carryForward.test.ts`; `src/lib/productAnalytics.ts` (no-op seam) + `src/lib/__tests__/productAnalytics.test.ts`; `src/components/spray/SprayWizardCarryChip.tsx` (shared chip component, reused by all three modals).
- **Modify:** `src/hooks/useSprayForm.ts` (source selection + chip state + accept/decline mapping), `src/components/SprayModal.tsx` (render chip on core step incl. quick mode), `src/components/PlantModal.tsx`, `src/components/FertilizerModal.tsx` (chip + precedence per §5.2; reuse FertilizerModal's existing prefill-note styling).
- **Do not touch:** `getLatestForField`, mappers, store CRUD signatures, sync queue, reports, migrations.
- Repo invariants that keep applying: farm scoping, season stamping via `viewingSeason`, mapper discipline before state changes, optimistic-update pattern, soft delete, no `.select()` on updates.

## 15. Validation Plan

1. Unit tests per AC-11.
2. Manual pass, online: spray run across 3 fields (carry → edit area → save ×3), then plant and fertilizer single carries.
3. Manual pass, offline (airplane mode): carry + save on 2 fields; verify queue replay on reconnect and sign-out blocking while pending.
4. Quick Add GPS path + quick mode pass.
5. Mobile visual check at 350/390px, dark + light themes; screen-reader announcement check.
6. `npm run lint`, `typecheck`, `test`, `build` before hand-back.
