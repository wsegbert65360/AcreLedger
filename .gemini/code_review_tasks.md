# AcreLedger Code Review Tasks

Each task below is atomic and self-contained. Execute them one at a time, top-to-bottom. Each includes the exact file(s), what to change, and why.

---

## CRITICAL PRIORITY

### Task 1 — Remove API key from console output
- **File:** `src/services/WeatherService.ts` line 25
- **Problem:** `console.error` prints the `API_KEY` value to the browser console, visible via DevTools.
- **Fix:** Replace the log message to NOT include the `API_KEY` variable. Print only a generic message like `'[WeatherService] API Key missing or invalid. Set VITE_VISUALCROSSING_KEY in your .env file.'`
- **Also fix:** Line 63 has the same issue in the `fetchCurrentWeather` method — remove `API_KEY` from the logged string there too.
- **Tag:** [Security]

### Task 2 — Pass userId to localStorage helpers
- **File:** `src/store/farmStore.tsx` lines 89–98 and 167–178
- **Problem:** `loadFromStorage` and `saveToStorage` accept an optional `userId` param for key scoping, but `farmStore.tsx` never passes it. On shared devices, different users' data collides under the same `al_*` keys.
- **Fix:** 
  1. In `farmStore.tsx`, get `session?.user?.id` from the `auth` object.
  2. Pass it as the third argument to every `loadFromStorage(key, default, userId)` and `saveToStorage(key, value, userId)` call.
  3. In `useSeasonManagement.ts` `clearLocalCache` (line 154–161), update the key-clearing logic to also account for user-prefixed keys (keys that start with `${userId}_al_`).
- **Tag:** [Security]

### Task 3 — Validate backup data before restore
- **File:** `src/store/useSeasonManagement.ts` line 87
- **Problem:** `restoreFromBackup(backupData: any)` directly upserts unvalidated JSON into Supabase. Malformed data could corrupt the database.
- **Fix:**
  1. Change the parameter type from `any` to a defined `BackupData` interface (or use Zod schema validation).
  2. At minimum, validate that each expected array property (`fields`, `bins`, `plantRecords`, etc.) exists and is an array before proceeding.
  3. Add a Zod schema in `src/types/farm.ts` or a new `src/lib/backupSchema.ts` that validates the structure.
- **Tag:** [Security]

### Task 4 — Guard against null farm_id in CRUD hooks
- **Files:** All 6 record hooks:
  - `src/store/usePlantRecords.ts` (lines 21, 53, 84)
  - `src/store/useSprayRecords.ts` (lines 21, 61, 100)
  - `src/store/useHarvestRecords.ts` (lines 21, 52, 82)
  - `src/store/useHayRecords.ts` (lines 21, 49, 76)
  - `src/store/useFertilizerRecords.ts` (lines 28, 51, 74)
  - `src/store/useGrainMovements.ts` (lines 21, 49, 76)
  - `src/store/useFieldsAndBins.ts` (lines 30, 45, 61, 75, 88, 103)
- **Problem:** These hooks use `farm_id!` (non-null assertion) when calling Supabase, but `farm_id` can be `null`. This silently inserts `null` as the farm_id.
- **Fix:** At the start of each `add`/`update`/`delete` callback, add:
  ```ts
  if (!farm_id) { toast.error('No farm selected'); return; }
  ```
- **Tag:** [Error Handling]

### Task 5 — Sanitize CSV export values
- **File:** `src/lib/complianceReports.ts`
- **Problem:** User-controlled strings (field names, applicator names) are inserted into CSV output without sanitization. Values starting with `=`, `+`, `-`, or `@` can trigger formula injection in Excel.
- **Fix:** Create a helper function:
  ```ts
  function sanitizeCsvValue(val: string): string {
    if (/^[=+\-@\t\r]/.test(val)) return `'${val}`;
    return val;
  }
  ```
  Apply it to all user-supplied string values before wrapping them in quotes across `generateMissouriLog`, `exportFsa578Data`, `exportHarvestData`, and `exportFertilizerData`.
- **Tag:** [Security]

---

## HIGH PRIORITY

### Task 6 — Type mapper inputs instead of `any`
- **File:** `src/lib/mappers.ts`
- **Problem:** All 10 `mapXxxFromDb` functions accept `any` as input, losing type safety.
- **Fix:** Define DB row types. At minimum, create a `src/types/supabase.ts` with interfaces for each table's row shape (e.g. `FieldRow`, `PlantRecordRow`). Then change each mapper's parameter from `any` to the corresponding row type. Example:
  ```ts
  export const mapFieldFromDb = (db: FieldRow): Field => ({ ... });
  ```
- **Tag:** [Type Safety]

### Task 7 — Type `exportHarvestData` parameter
- **File:** `src/lib/complianceReports.ts` line 130
- **Problem:** First parameter is `any[]` instead of `HarvestRecord[]`.
- **Fix:** Change `(harvestRecords: any[], fields: Field[])` to `(harvestRecords: HarvestRecord[], fields: Field[])` and add the import.
- **Tag:** [Type Safety]

### Task 8 — Type `Field.boundary`
- **File:** `src/types/farm.ts` line 14
- **Problem:** `boundary` is typed as `any`.
- **Fix:** Replace with a GeoJSON polygon type:
  ```ts
  boundary?: {
    type: 'Polygon';
    coordinates: number[][][];
  } | null;
  ```
- **Tag:** [Type Safety]

### Task 9 — Use existing mappers in CRUD hooks
- **Files:** `src/store/usePlantRecords.ts`, `useSprayRecords.ts`, `useHarvestRecords.ts`, `useHayRecords.ts`, `useGrainMovements.ts`
- **Problem:** Each hook manually maps frontend fields to DB column names inline (e.g. `field_id: r.fieldId`), duplicating logic already in `src/lib/mappers.ts` (`mapPlantToDb`, `mapSprayToDb`, etc.).
- **Fix:** In each hook's `add` and `update` functions, replace the inline object literal with a call to the corresponding `mapXxxToDb` function. Example for `usePlantRecords.ts`:
  ```ts
  // Before:
  await supabase.from('plant_records').insert([{ id, farm_id, field_id: r.fieldId, ... }]);
  // After:
  import { mapPlantToDb } from '@/lib/mappers';
  await supabase.from('plant_records').insert([{ ...mapPlantToDb(newRecord), farm_id }]);
  ```
- **Tag:** [Architecture]

### Task 10 — Extract UUID-cleaning utility
- **File:** `src/pages/Activity.tsx` — lines 275, 290, 305, 320, 335, 350
- **Problem:** The regex `.replace(/[a-f0-9]{8}-[a-f0-9]{4}-…/gi, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '')` is duplicated 6 times.
- **Fix:** 
  1. Create a function in `src/utils/strings.ts`:
     ```ts
     export function cleanRecordName(name: string): string {
       return name
         .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '')
         .trim()
         .replace(/\s*—\s*$/, '')
         .replace(/\s*-\s*$/, '');
     }
     ```
  2. Replace all 6 occurrences in `Activity.tsx` with `cleanRecordName(r.fieldName)` or `cleanRecordName(m.binName)`.
- **Tag:** [Code Quality]

### Task 11 — Extract deleted-field fallback component
- **File:** `src/pages/Activity.tsx` — lines 399–405, 418–424, 437–443, 456–462, 475–481
- **Problem:** The same "deleted field" fallback modal JSX is copy-pasted 5 times.
- **Fix:** Create `src/components/DeletedFieldFallback.tsx`:
  ```tsx
  export default function DeletedFieldFallback({ onClose }: { onClose: () => void }) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        <div className="bg-card border border-border p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
          <p className="text-sm text-muted-foreground">The original field for this record has been deleted.</p>
          <Button onClick={onClose} className="w-full">Close</Button>
        </div>
      </div>
    );
  }
  ```
  Replace all 5 instances in `Activity.tsx`.
- **Tag:** [Code Quality]

### Task 12 — Add unit tests for mappers
- **File:** Create `src/lib/mappers.test.ts`
- **Problem:** Zero test coverage for the mapper layer — the data transformation layer between Supabase and frontend state.
- **Fix:** Write tests for at least `mapPlantFromDb`/`mapPlantToDb`, `mapSprayFromDb`/`mapSprayToDb`, and `mapFieldFromDb`/`mapFieldToDb`. Test round-trips: `mapXxxFromDb(mapXxxToDb(record))` should return the original.
- **Tag:** [Testing]

### Task 13 — Add unit tests for complianceReports
- **File:** Create `src/lib/complianceReports.test.ts`
- **Problem:** Zero test coverage for CSV report generation — critical compliance functionality.
- **Fix:** Test `generateMissouriLog` and `exportFsa578Data` with mock records. Verify correct CSV header, row count, and field mapping. Mock `URL.createObjectURL` and `document.createElement`.
- **Tag:** [Testing]

### Task 14 — Remove placeholder test
- **File:** `src/test/example.test.ts`
- **Problem:** Asserts `expect(true).toBe(true)` — no value.
- **Fix:** Delete the file.
- **Tag:** [Testing]

### Task 15 — Remove dead code in useAuth
- **File:** `src/store/useAuth.ts` lines 8–11
- **Problem:** `pageTransition` object is defined but never used (it's a copy-paste artifact from `App.tsx`).
- **Fix:** Delete lines 8–11 (the `const pageTransition = { ... };` block).
- **Tag:** [Code Quality]

---

## MEDIUM PRIORITY

### Task 16 — Split Activity.tsx into tab components
- **File:** `src/pages/Activity.tsx` (495 lines)
- **Problem:** Single monolithic file handling 6 tabs, 6 filtered lists, 5 edit modals.
- **Fix:** Extract each tab's record list + rendering into separate components: `src/components/activity/PlantTab.tsx`, `SprayTab.tsx`, `HarvestTab.tsx`, `HayTab.tsx`, `FertilizerTab.tsx`, `GrainTab.tsx`.
- **Tag:** [Architecture]

### Task 17 — Split Settings.tsx sub-components into separate files
- **File:** `src/pages/Settings.tsx` (613 lines)
- **Problem:** 7 inner components defined in a single file.
- **Fix:** Move each to `src/components/settings/`: `SeedManager.tsx`, `RecipeManager.tsx`, `RecipeForm.tsx`, `DisplayManager.tsx`, `SyncStatus.tsx`, `BackupManager.tsx`, `SecurityManager.tsx`, `AccountManager.tsx`, `DevTools.tsx`.
- **Tag:** [Architecture]

### Task 18 — Split FieldManageModal.tsx
- **File:** `src/components/FieldManageModal.tsx` (483 lines)
- **Problem:** Exports both `FieldManageModal` and `FieldManager` from one file.
- **Fix:** Move `FieldManager` to its own file `src/components/FieldManager.tsx`.
- **Tag:** [Architecture]

### Task 19 — Add concurrency limiter to rainfall fetcher
- **File:** `src/hooks/useFieldRainfall.ts`
- **Problem:** Fetches sequentially with 1-second delay per field. Slow for large farms.
- **Fix:** Use a batch approach with `Promise.allSettled` and a concurrency limiter (e.g. manual semaphore or `p-limit` library) to fetch 3–5 fields in parallel while still respecting rate limits.
- **Tag:** [Performance]

### Task 20 — Pre-compute bin totals
- **File:** `src/store/useGrainMovements.ts` lines 90–94
- **Problem:** `getBinTotal` re-scans the full array on every call.
- **Fix:** Replace with a `useMemo` that pre-computes a `Map<string, number>` keyed by binId, then have `getBinTotal` do a simple map lookup.
- **Tag:** [Performance]

### Task 21 — Consolidate date formatting utilities
- **Files:** `src/config/constants.ts` and `src/utils/dates.ts`
- **Problem:** `formatDate` in `constants.ts` is a date utility function, not a constant. It exists separately from the other date utilities in `utils/dates.ts`.
- **Fix:** Move `formatDate` to `src/utils/dates.ts`. Update all imports (primarily `Activity.tsx` and `Reports.tsx`). Delete `src/config/constants.ts` if it becomes empty.
- **Tag:** [Code Quality]

### Task 22 — Consolidate backup creation logic
- **Files:** `src/pages/Settings.tsx` (BackupManager, line 166) and `src/store/useSeasonManagement.ts` (rolloverToNewSeason, line 59)
- **Problem:** Two independent backup blob creation implementations with different field sets (BackupManager omits `bins` and `fertilizerApplications`).
- **Fix:** Create `src/lib/backup.ts` with a `createBackupBlob(data)` function. Use it in both locations.
- **Tag:** [Code Quality]

### Task 23 — Move @types/leaflet to devDependencies
- **File:** `package.json` line 47
- **Problem:** `@types/leaflet` is a type-only package listed under `dependencies`.
- **Fix:** Move it to `devDependencies`.
- **Tag:** [Dependencies]

### Task 24 — Audit unused Radix UI packages
- **File:** `package.json` lines 17–43
- **Problem:** 25+ Radix UI packages are installed. Many may be unused.
- **Fix:** For each Radix package, search the codebase for its import. Remove any packages with zero imports. Likely unused: `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-slider`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`.
- **Tag:** [Dependencies]

### Task 25 — Replace window.confirm with AlertDialog
- **File:** `src/pages/Settings.tsx` line 591
- **Problem:** `SecurityManager` uses `window.confirm()` instead of the project's AlertDialog component.
- **Fix:** Replace with an AlertDialog matching the pattern used elsewhere (e.g. the delete confirmation in `Activity.tsx`).
- **Tag:** [Error Handling]

### Task 26 — Show validation feedback in SprayModal
- **File:** `src/components/SprayModal.tsx` line 117
- **Problem:** `handleSubmit` silently returns if `!isFormValid` — no feedback to user.
- **Fix:** Add `toast.error('Please fill in all required compliance fields')` before the early return.
- **Tag:** [Error Handling]

### Task 27 — Add JSDoc to store hooks and FarmState
- **Files:** `src/store/farmStore.tsx` (FarmState interface, FarmProvider), and all 6 record hooks.
- **Problem:** No documentation on any store-level code.
- **Fix:** Add JSDoc blocks to: the `FarmState` interface, the `FarmProvider` component, and each hook's exported functions explaining the optimistic update + rollback pattern.
- **Tag:** [Documentation]

### Task 28 — Type the `edit` function parameter
- **File:** `src/pages/Activity.tsx` line 74
- **Problem:** `record: any` should be `record: EditableRecord` (the union type defined on line 20).
- **Fix:** Change `(e: React.MouseEvent, record: any)` to `(e: React.MouseEvent, record: EditableRecord)`.
- **Tag:** [Code Quality]

---

## LOW PRIORITY

### Task 29 — Add aria-labels to icon-only buttons
- **Files:**
  - `src/pages/Settings.tsx` line 272 (seed delete button) — add `aria-label="Delete seed variety"`
  - `src/pages/Settings.tsx` line 337 (recipe delete button) — add `aria-label="Delete spray recipe"`
  - `src/components/FieldManageModal.tsx` lines 403–414 (edit/delete field buttons) — add `aria-label="Edit field"` and `aria-label="Delete field"`
- **Tag:** [Accessibility]

### Task 30 — Add label to search input
- **File:** `src/pages/Activity.tsx` line 248
- **Problem:** Search `<input>` has no associated label.
- **Fix:** Add `aria-label="Search records"` to the input element.
- **Tag:** [Accessibility]

### Task 31 — Use `useMap()` instead of `useMapEvents({})`
- **File:** `src/components/FieldManageModal.tsx` line 40
- **Problem:** `ChangeView` calls `useMapEvents({})` with empty handlers just to get the map instance.
- **Fix:** Replace with `const map = useMap();` from `react-leaflet`. Remove the `useMapEvents` import if no longer needed.
- **Tag:** [Code Quality]

### Task 32 — Use scoped @turf/area instead of full library
- **Files:** `src/lib/gisService.ts` line 1, `package.json` line 46
- **Problem:** `import * as turf from '@turf/turf'` imports the entire Turf.js library (~500KB) but only uses `turf.area()`.
- **Fix:**
  1. `npm install @turf/area` and `npm uninstall @turf/turf`
  2. Change import: `import { area } from '@turf/area';`
  3. Change usage: `const areaSqMeters = area(geojson);`
- **Tag:** [Performance]

### Task 33 — Use react-router navigation instead of window.location
- **File:** `src/pages/Settings.tsx` line 604
- **Problem:** `window.location.href = '/privacy'` forces a full page reload.
- **Fix:** Use `useNavigate` from `react-router-dom`:
  ```tsx
  const navigate = useNavigate();
  // ...
  onClick={() => navigate('/privacy')}
  ```
- **Tag:** [Code Quality]

### Task 34 — Add client-side password validation on signup
- **File:** `src/components/Auth.tsx`
- **Problem:** No minimum password length enforcement on signup — Supabase returns a generic error.
- **Fix:** Before calling `supabase.auth.signUp`, check `password.length >= 6`. If not, show `toast.error('Password must be at least 6 characters')` and return early.
- **Tag:** [Code Quality]

### Task 35 — Add environment variable documentation
- **File:** Create or update `README.md` in project root
- **Problem:** No documentation of required environment variables.
- **Fix:** Add a section listing: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VISUALCROSSING_KEY` with descriptions and setup instructions.
- **Tag:** [Documentation]
