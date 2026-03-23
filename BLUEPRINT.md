# BLUEPRINT.md — AcreLedger

> **Purpose:** Single authoritative reference for AcreLedger's architecture, patterns, and rules.
> Read this file before making any change or addition. A capable AI agent must be able to
> reconstruct a functionally equivalent application from this document alone.

---

## 1. Application Overview

AcreLedger is a mobile-first, PWA-ready agricultural record-keeping and compliance reporting
application for row-crop farmers and licensed commercial applicators. It solves the problem of
tracking complex, multi-year farm operations — planting, spraying, fertilizing, harvesting, and
grain movement — while generating strict regulatory compliance logs including FSA 578 Acreage
Reports and MDA/state private applicator audit trails. Data is stored per-farm in Supabase with
optimistic UI, offline-capable client-side backup/restore, and printable FSA-compliant reports.
The target user is an individual farmer or small operation, not an enterprise.

---

## 2. Tech Stack

| Layer | Library / Service | Role |
|---|---|---|
| Framework | React 18 + TypeScript (strict) | UI, hooks, JSX transform |
| Build | Vite + Vite PWA Plugin | Bundler, dev server, service worker |
| Routing | React Router v6 | Page navigation |
| Database | Supabase (Postgres + RLS) | Persistent storage, Row Level Security |
| Auth | Supabase Auth | Session, JWT, user identity |
| Realtime | Supabase Realtime channels | Connection health probe (sync status) |
| State | Zustand (`farmStore.tsx`) | Global client state + CRUD actions |
| UI Components | shadcn/ui (Radix primitives) | Dialog, Select, Alert, Button, Card, etc. |
| Styling | Tailwind CSS v3 | Utility classes, CSS variables for theming |
| Icons | Lucide React | All iconography — no other icon lib |
| Toasts | Sonner | User feedback — success / error / warning / info |
| Validation | Zod (`@/lib/backupSchema`) | Backup file schema validation on restore |
| Weather | Visual Crossing API | Current wind/temp conditions |
| Rainfall | MRMS Hourly + Supabase | Persisted radar-derived hourly precipitation |
| Utilities | `@/utils/dates`, `@/utils/numbers`, `@/utils/text` | Pure formatting helpers |
| Mappers | `@/lib/mappers` | Entity ↔ DB row transformation |
| Reports | `@/lib/complianceReports` | CSV & PDF export generators (FSA, spray log, etc.) |

---

## 3. Data Architecture

All entities are strictly typed in `@/types/farm.ts`. Every season-specific record carries
`seasonYear: number`. Every record supports soft-delete via `deleted_at: string | null`
(ISO timestamp). Active records always have `deleted_at === null`. Soft-deleted records are
excluded by RLS policies server-side and by `.filter(r => !r.deleted_at)` client-side.

### Field
Physical farm field. Referenced by `fieldId` on all activity records.
```ts
{ id, name, acreage, lat, lng, intendedUse, fsaFarmNumber, fsaTractNumber,
  irrigationPractice, notes, deleted_at, boundary: { type, coordinates } }
```
`notes` is a TEXT field used for informal scratchpad entries, persisted with auto-save.
`lat`/`lng` may be null if geocoding was skipped — always guard before calling `.toFixed()`.
`boundary` is a GeoJSON Polygon for field geometry.

### Bin
Grain storage bin. Tracks capacity and identity.
```ts
{ id, farm_id, name, capacity, deleted_at }
```
- **Inventory**: `currentBushels` is a derived value calculated via `getBinTotal()` in the store.

### PlantRecord
Single planting event on a field. Core FSA 578 source record.
```ts
{ id, farm_id, fieldId, fieldName, crop, seedVariety, seedingRate, population,
  acreage, plantDate, timestamp, seasonYear, intendedUse, irrigationPractice,
  producerShare, fsaFarmNumber, fsaTractNumber, fsaFieldNumber, deleted_at }
```

### SprayRecord
Pesticide/herbicide application. Supports multiple products per application (tank-mix).
```ts
{ id, farm_id, fieldId, fieldName, sprayDate, startTime, timestamp, seasonYear,
  products: { product, epaRegNumber, rate, rateUnit }[],
  treatedAreaSize, totalAmountApplied, rateUnit,
  windSpeed, windDirection, temperature, relativeHumidity,
  targetPest, applicatorName, licenseNumber, equipmentId,
  siteAddress, involvedTechnicians, mixtureRate, totalMixtureVolume,
  isPremixed, deleted_at }
```
- Wind alert threshold: `WIND_ALERT_MPH = 10` (named constant — never hardcode `10`).
- Records missing `epaRegNumber` are flagged `NON-COMPLIANT` in audit reports.
- `products` may be an empty array if using legacy single-product fields.

### HarvestRecord
Grain harvest event.
```ts
{ id, farm_id, fieldId, fieldName, crop, bushels, moisturePercent, harvestDate,
  timestamp, seasonYear, destination: 'bin' | 'town', landlordSplitPercent,
  landlordName, scaleTicketNumber, deleted_at }
```

### HayHarvestRecord
Hay cutting event. Tracked by cutting number per field per season.
```ts
{ id, farm_id, fieldId, fieldName, baleCount, baleType, cuttingNumber,
  timestamp, seasonYear, deleted_at }
```

### FertilizerApplication
```ts
{ id, farm_id, fieldId, fieldName, fertilizer_formula, acres, date,
  timestamp, seasonYear, created_at, updated_at, deleted_at }
```
Note: `date` is an ISO date string; `timestamp` is Unix ms. Both exist on the same record.
`created_at`/`updated_at` are managed by DB triggers.

### GrainMovement
Grain in/out of a bin, including sales and contracts.
```ts
{ id, farm_id, binId, binName, type: 'in' | 'out', bushels, moisturePercent,
  price?, destination?, sourceFieldName?, timestamp, seasonYear, deleted_at }
```
**`bushels` may be negative.** Negative values represent an estimate-vs-actual correction
(more grain removed than estimated). This is intentional business logic — do not block or clamp.
Display with an amber `AlertTriangle` warning only.

### SavedSeed
Seed inventory reference. Not season-scoped.
```ts
{ id, farm_id, crop, variety, supplier, lotNumber, year, notes, deleted_at }
```

### SprayRecipe
Saved tank-mix recipe for reuse on spray records. Not season-scoped.
```ts
{ id, farm_id, name, products: { product, epaRegNumber, rate, rateUnit }[],
  deleted_at }
```

### Rainfall
Radar-derived precipitation totals from the NOAA MRMS dataset. Persisted in Supabase
to support historical analysis and performance.

#### field_rainfall_hourly
```ts
{ id, field_id, timestamp_utc, rainfall_in, finalized, source }
```
#### field_rainfall_coverage
```ts
{ field_id, range_start_utc, range_end_utc, status, last_checked_at }
```
- **Stats RPC**: `get_rainfall_stats(field_id, start_date, end_date)` returns total inches,
  hours with rain, max hourly intensity, and coverage percentage.
- **Pipeline**: Managed by `mrms-hourly` Edge Function.
- **Status**: `pending` | `partial` | `complete`.

---

## 4. State Management Rules

### farmStore (Zustand)
Single global store in `farmStore.tsx`. Exposes all entity arrays, their setters, `session`,
`farm_id`, `activeSeason`, `viewingSeason`, and all CRUD action methods. Accessed everywhere
via `useFarm()`. Never import Zustand's `useStore` directly in components.

### Optimistic Update Pattern
Every mutation follows this exact sequence — no exceptions:
```
1. Guard: if (!farm_id) → toast.error('No farm selected.'), return false
2. Validate inputs → return false on invalid
3. Call mapper (mapXToDb) — BEFORE touching state
   → mapper throws: toast.error, return false, do NOT touch state or DB
4. Apply optimistic state update via functional setter
5. Await Supabase operation
6a. Success: toast.success, return true
6b. Error: roll back state to pre-step-4 snapshot, toast.error, return false
```

### OpResult Convention
All add / update / delete operations on every hook return `Promise<boolean>`:
- `true` = record committed to DB
- `false` = blocked (validation, no farm) or rolled back (DB error)
- **Never returns `undefined`.** Callers (e.g. modals deciding whether to close) rely on this.

### farm_id Scoping
Every Supabase write is scoped to `farm_id`. The null guard is always the **first line** of
every mutation function — before validation, mapping, or any state change.

---

## 5. Database Conventions

### Table Names
| Entity | Supabase Table |
|---|---|
| Field | `fields` |
| Bin | `bins` |
| PlantRecord | `plant_records` |
| SprayRecord | `spray_records` |
| HarvestRecord | `harvest_records` |
| HayHarvestRecord | `hay_harvest_records` |
| FertilizerApplication | `fertilizer_applications` |
| GrainMovement | `grain_movements` |
| SavedSeed | `saved_seeds` |
| SprayRecipe | `spray_recipes` |
| User profile / active season | `profiles` |

Application state uses `camelCase`; DB columns use `snake_case`. Mappers handle all translation.

### Mapper Pattern
Every entity has a dedicated mapper in `@/lib/mappers.ts`:
```ts
mapFieldToDb(f: Field): DbField
mapSprayToDb(r: SprayRecord): DbSprayRecord
// one mapper per entity — no exceptions
```
Mappers are called **before** any optimistic state update. If a mapper throws, abort entirely.
Never inline DB shape transformation in a hook or component.

### farm_id Rule
`farm_id` is a relational partition key. It belongs **only** in `.eq('farm_id', farm_id)`
filter clauses. **Never** include it in the `.update()` payload:
```ts
// Wrong:
.update({ ...mapped, farm_id })
// Right:
.update(mapped).eq('id', r.id).eq('farm_id', farm_id)
```

### Soft Delete
```ts
.update({ deleted_at: new Date().toISOString() }).in('id', ids).eq('farm_id', farm_id)
```
Never use Supabase `.delete()` on user records. Excluded server-side by RLS, client-side
by filtering `!r.deleted_at` when loading state.

### Update vs Upsert
`.update().eq('id', r.id).eq('farm_id', farm_id)` for edits — always.
**Never use `.upsert()` for edit operations.** Upsert silently inserts a ghost row if the
record ID is absent from the DB, corrupting inventory and report totals.

### Security Hardening
All locally-managed functions, RPCs, and triggers MUST include a explicit search path:
```sql
CREATE OR REPLACE FUNCTION ...
RETURNS ... AS $$
...
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;
```
This prevents "search_path not set" security warnings and protects against search-path hijacking.

---

## 6. Component Patterns

### useMemo Rules
Wrap in `useMemo` any value derived from large arrays:
- Field lookup map (see below)
- Filtered + sorted record lists for each tab/view
- Season selector option arrays
- Aggregate totals in report footers
- Expanded row sets (e.g. spray `flatMap` over products)

Do **not** compute these inline in JSX — they recalculate on every render.

### fieldMap Pattern
Never call `fields.find(f => f.id === r.fieldId)` per row inside a `.map()`. Build once:
```ts
const fieldMap = useMemo(() => new Map(fields.map(f => [f.id, f])), [fields]);
// Per row — O(1):
const field = fieldMap.get(r.fieldId);
const farmNum = field?.fsaFarmNumber ?? '—';
```

### Module-Level Pure Helpers
Functions that don't depend on component state or props belong **outside** the component at
module level. Examples: date formatters (`fmtDate`, `fmt`), detail line builders (`buildDetails`,
`buildSubtitle`), export wrappers. Not recreated on render and independently testable.

### safeExport Wrapper
All CSV/JSON export calls go through this wrapper — never called bare in `onExport` props:
```ts
function safeExport(fn: () => void, label: string): void {
  try { fn(); }
  catch (err) {
    console.error(`Export failed (${label}):`, err); // → Sentry in production
    toast.error(`Failed to export ${label}. Please try again.`);
  }
}
```

### ReportTable Component
Standardized wrapper for all compliance report tabs. Props: `title`, `subtitle`, `headers[]`,
`onExport`, `exportLabel`, `summary` (ReactNode), `children` (`<tr>` rows).
All six report tabs use it for layout or data processing: FSA Plant, Spray Audit, Fertilizer, 
FSA Harvest, Hay Summary, Landlord Statement. Supports both CSV and PDF direct exports.

### ActivityFeed Component
Reusable component for displaying field-specific historical records. Filters records for the 
`viewingSeason` and provides an `onEdit` callback for granular record editing.

### FieldNotes Component (Auto-Save)
Persistent scratchpad for field-specific notes. Uses a **2000ms debounce** on the `onChange` 
event to automatically sync content to Supabase. Includes a visual "Syncing..." / "Saved" 
status indicator to confirm persistence without blocking user input.

### Null Safety in Display Strings
Always guard optional numeric/string fields before interpolation:
```ts
// Wrong → "undefined MPH undefined":
`${r.windSpeed} MPH ${r.windDirection}`
// Right:
const wind = r.windSpeed != null ? `${r.windSpeed} MPH ${r.windDirection || ''}`.trim() : null;
const temp = r.temperature != null ? `${r.temperature}°F` : null;
const details = [wind, temp].filter(Boolean).join(' · ') || '—';
```

### Zero vs Falsy in Display
`0` is a valid and meaningful farm value (zero bales, zero bushels, zero price).
```ts
value || '—'              // Wrong — hides legitimate zero
value > 0 ? value : '—'  // Right for counts/quantities
value != null ? value : '—'  // Right for measurements where 0 is valid
```

### Sorting
Never call `.sort()` directly on a state-derived array — `Array.sort` mutates in place.
Always spread first inside `useMemo`: `[...arr].sort((a, b) => ...)`.

### Report Date Stability
Capture report generation date at mount via `useRef`:
```ts
const reportDateRef = useRef(new Date().toLocaleDateString());
```
A subtitle date must not silently change if the component re-renders after midnight.

---

## 7. Hook Patterns

### Standard Data Hook Signature
```ts
interface UseXRecordsArgs {
  farm_id: string | null;
  activeSeason: number;
  setXRecords: React.Dispatch<React.SetStateAction<XRecord[]>>;
  // Never pass the records array — read state inside functional updaters instead
}

export function useXRecords({ farm_id, activeSeason, setXRecords }: UseXRecordsArgs) {
  const isAdding    = useRef(false);
  const previousRef = useRef<XRecord | undefined>(undefined);
  const snapshotRef = useRef<{ record: XRecord; index: number }[]>([]);
}
```

### In-Flight Guard (Add operations only)
Single boolean ref — not a UUID Set. UUID collision guard never fires; a boolean actually
prevents double-tap regardless of how many UUIDs are generated:
```ts
if (isAdding.current) return false;
isAdding.current = true;
try {
  /* map → optimistic add → await insert */
} finally {
  isAdding.current = false; // always release — even on unexpected throw
}
```

### Cross-Await State Capture
Never read a `let` assigned inside a `setState` callback after an `await`. React 18 may
batch or defer setter execution. Capture into a ref inside the setter:
```ts
previousRef.current = undefined;
setXRecords(prev => {
  previousRef.current = prev.find(item => item.id === r.id);
  return prev.map(item => item.id === r.id ? r : item);
});
const { error } = await supabase...
// previousRef.current is safe to read here
```

### Delete Rollback with Ordered Splice
Sort snapshot **descending by index** before splicing — prevents index shift bugs:
```ts
snapshotRef.current = [];
setXRecords(prev => {
  snapshotRef.current = prev
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => ids.includes(record.id));
  return prev.filter(r => !ids.includes(r.id));
});
// On error:
const sorted = [...snapshotRef.current].sort((a, b) => b.index - a.index);
setXRecords(prev => {
  const restored = [...prev];
  for (const { record, index } of sorted)
    restored.splice(Math.min(index, restored.length), 0, record);
  return restored;
});
```

### Records Array Not in Deps
Never include the entity array (e.g. `sprayRecords`) in `useCallback` deps. The callback
recreates on every optimistic update it triggers. Use functional updaters and refs instead.

### Modal Submission Hardening
All data-entry modals must use an `isSaving` state and `await` the result of store actions.
```tsx
const [isSaving, setIsSaving] = useState(false);
const handleSubmit = async () => {
  setIsSaving(true);
  try {
    const success = await addRecord(data);
    if (success) onClose();
  } finally {
    setIsSaving(false);
  }
};
```
This prevents double-submissions and ensures the modal only closes when the data is safe.

---

## 8. Auth & Session Rules

- `session: Session | null | undefined` flows from Supabase Auth through `useFarm()`.
- `session === undefined` → hydrating. **Show a loading skeleton. Do not return null.**
- `session === null` → unauthenticated. Return null, redirect, or hide the component.
- `session` truthy → authenticated. `session.user.id` is the scoping key.
- `farm_id: string | null` stored in `profiles` — may be null even when session exists
  (new user who hasn't completed onboarding).

### localStorage Key Scoping
- Anonymous / fallback: `al_<key>` (e.g. `al_zip`, `acreledger_last_backup`)
- Per-user: `${userId}_al_<key>` (e.g. `abc123_al_zip`)

Never seed `useState` from localStorage using `userId` in the initializer — session loads
async and `userId` is undefined on first render. Use a `useEffect` on `userId`:
```ts
const [zip, setZip] = useState('');
useEffect(() => { setZip(loadZip(userId)); }, [userId]);
```
Always wrap localStorage in `try/catch` — throws in private browsing and at storage quota.

---

## 9. Season System

The system **decouples data entry from data viewing**:

- **`activeSeason: number`** — the current physical farming year (e.g. `2025`). Stored in
  `profiles.active_season`. All new records stamp `seasonYear = activeSeason`.
- **`viewingSeason: number`** — the year shown in UI. Controlled by a dropdown. Filters all
  lists, grids, and reports. **Does not affect writes.** Can be set to any past season.

Every season-specific record carries `seasonYear: number`. Always filter by `viewingSeason`
in report and list views. Never render records from the wrong season in a scoped view.

### Season Rollover (`rolloverToNewSeason`)
Destructive — cannot be undone. Strict gated sequence, abort on any failure:
```
1. Validate year: integer, 2000 ≤ year ≤ currentYear + 1
2. setLoading(true)
3. Build backup payload, call downloadJson() → must return true
   → false or throw: toast.error('Backup failed — season not changed'), STOP
4. Write new year to profiles.active_season in Supabase
   → error: toast.error, STOP, do not update local state
5. setActiveSeason(year), setViewingSeason(year)
6. toast.success, setLoading(false)
```

---

## 10. Backup & Restore Rules

### Explicit Payload — No Whole-Store Passthrough
```ts
// Wrong — leaks auth tokens, setters, session:
createBackupData(store)
// Right:
createBackupData({ fields, bins, plantRecords, sprayRecords,
                   harvestRecords, hayHarvestRecords, fertilizerApplications,
                   grainMovements, savedSeeds, sprayRecipes, activeSeason })
```

### downloadJson Contract
Returns `boolean` — `true` on success, `false` or thrown on failure.
Revoke the object URL with a delay — synchronous revoke races the download:
```ts
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(() => URL.revokeObjectURL(url), 2000);
return true;
```

### Restore: Sequential Upserts Over Promise.all
```ts
for (const [table, data] of tables) {
  if (data.length === 0) continue;
  const { error } = await supabase.from(table).upsert(data);
  if (error) throw new Error(`Failed to restore "${table}": ${error.message}`);
}
// Only update local state AFTER all tables succeed
```
`Promise.all` allows partial writes with no rollback. Sequential stops at first failure.
Note: no true DB-level transaction is available from the client.

### Empty Array Restore Rule
```ts
// Wrong — skips restoring a legitimately empty array:
if (backupData.fields) setFields(backupData.fields);
// Right:
if (backupData.fields !== undefined) setFields(backupData.fields);
```

### Last Backup Tracking
Store last successful backup timestamp in localStorage: `acreledger_last_backup`.
Show in BackupManager UI. Amber warning if > 7 days old or never taken.

---

## 11. Error Handling Standards

### Toast Usage
| Situation | Call |
|---|---|
| DB write failed, state rolled back | `toast.error('...')` |
| User input validation failed | `toast.error('...')` |
| Offline / network issue detected | `toast.warning('...')` |
| Operation committed successfully | `toast.success('...')` |
| Informational, no action needed | `toast.info('...')` |
| SW update available (user must act) | `toast('Title', { description, action: { label, onClick } })` |

### Rainfall Pipeline Error States
- **Coverage Gaps**: Indicated by `status IN ('pending', 'partial')` in `field_rainfall_coverage`.
- **Vercel 404 (NOT_FOUND)**: Usually malformed URL or invalid coordinates. Caught by UI guards.
- **API 404**: Location outside supported coverage (CONUS only).
- **API 502**: IEM service unreachable. Friendly app message required.
- **NaN / Missing Coords**: Blocked by `RainService` and UI level; button disabled.

### Sentry Placeholder Pattern
```ts
// Replace with Sentry.captureException(err) in production
console.error('Descriptive context label:', err);
```

### No Silent Failures
- Data-entry modals (Plant, Spray, Fertilizer, Harvest) must `await` the save operation and
  only close on success (`return true` from store).
- Destructive operations (delete, rollover, cache clear) always show explicit feedback.
- Export functions always wrapped in `safeExport` — never bare in `onExport` props.
- PDF generation uses `jspdf` and `jspdf-autotable` for consistent tabular output.
- Blocked operations (`farm_id` null, empty data) always return `false` and show a toast.
- User-visible error messages never say "check the console" — surface the actual reason.

### SyncStatus Connection Health
Must use a real Supabase Realtime channel probe — not the store's `loading` flag.
`loading` reflects initial hydration only. Map channel status to four states:
`connecting` | `connected` | `disconnected` | `offline`.
Use `window.addEventListener('online'/'offline')` in parallel with channel status.

---

## 12. Coding Rules & Conventions

- **No whole-store passthrough.** Destructure only the exact fields needed.
- **No `upsert` for updates.** `.update().eq('id').eq('farm_id')` only — upsert silently inserts on miss.
- **`farm_id` is a filter, never a payload field.** Never include in `.update({...})` body.
- **`parseInt` always takes a radix.** `parseInt(v, 10)` — bare `parseInt` is ambiguous.
- **`onOpenChange` always checks the boolean.** `(open) => { if (!open) onClose(); }` never `() => onClose()`.
- **Sort descending before splice rollback.** Ascending order causes insertion index drift.
- **Named constants over magic numbers.** `WIND_ALERT_MPH`, `MIN_SEASON_YEAR`, `MAX_SEASON_YEAR`, `LAST_BACKUP_KEY`, `LAST_SYNC_KEY`.
- **Defer `URL.revokeObjectURL`.** `setTimeout(..., 2000)` — synchronous revoke races the download.
- **Backup gates rollover.** `downloadJson` returning `false` aborts the season change entirely.
- **`isAdding` boolean ref, not UUID Set.** UUID Set does not prevent double-tap; boolean does.
- **`try/finally` on in-flight guards.** Guard must release even on unexpected throw.
- **Module-level pure helpers only.** Functions with no component dependency go outside the component.
- **Memoize all derived data.** `fieldMap`, filtered/sorted arrays, season lists, totals — all `useMemo`.
- **`[...arr].sort()` never `arr.sort()`.** Sort mutates in place — spread first.
- **`value > 0 ? value : '—'` not `value || '—'`.** Zero is a valid farm value.
- **`!== undefined` for optional restore fields.** Falsy check skips `[]` and `0`.
- **`previousRef`/`snapshotRef` for cross-await rollback.** Never read a `let` set inside a setter after `await`.
- **Remove unused imports at time of edit.** Never commit dead imports.
- **No default `React` import.** Modern JSX transform — named imports only.
- **Soft delete only.** Never call `.delete()` on user records — always set `deleted_at`.
- **Validate year range before rollover.** Reject `NaN`, `0`, values outside `[2000, currentYear+1]`.
- **`session === undefined` ≠ `session === null`.** Undefined = hydrating (skeleton). Null = logged out.
- **`lat`/`lng` are nullable on Field.** Guard before `.toFixed()`: `field.lat != null ? field.lat.toFixed(3) : '—'`.
- **GrainMovement `bushels` may be negative.** Intentional adjustment — warn in UI, never reject.
- **Spray product row keys use index.** `` `${r.id}-${i}` `` not `` `${r.id}-${p.product}` `` — product names can duplicate.
- **One import statement per module path.** `import { a, b } from '@/utils/dates'` — never two lines from the same path.
