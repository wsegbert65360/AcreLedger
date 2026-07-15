# AGENTS.md — AcreLedger

## Purpose

This file is the cross-agent operating guide for AcreLedger. It is written for Codex, Gemini CLI, Pi/local agents, and any other AI coding assistant working in this repository.

Use this file as the first-read instruction layer. Use `BLUEPRINT.md` as the full architecture reference, but do not load the entire blueprint unless the task truly needs broad architectural context.

## Project Summary

AcreLedger is a mobile-first, PWA-ready agricultural record keeping and compliance reporting app for row-crop farmers and small operations. It tracks fields, planting, spraying, fertilizing, harvest, hay, grain bins, grain movement, weather, rainfall, and compliance exports.

The app uses React 18, TypeScript strict mode, Vite, React Router, Supabase Postgres/Auth/RLS, React Context state, shadcn/ui, Tailwind CSS, Lucide React, Sonner, Zod, Visual Crossing weather, IEM Stage IV rainfall integration, and **Capacitor 6 for native iOS wrapper and device capabilities**.

## Context Loading Rules

1. Read this file first.
2. Identify the task area before editing.
3. Read only the relevant source files and relevant sections of `BLUEPRINT.md`.
4. Use `TESTING.md` only when credentials, verification flows, or test protocols are needed.
5. Do not stuff the working context with unrelated architecture details.
6. Prefer focused source inspection over guessing.
7. Do not make broad refactors while solving a narrow issue.

## Important Reference Files

- `BLUEPRINT.md` — full authoritative architecture, data model, conventions, and domain rules.
- `TESTING.md` — verification protocols and test credentials.
- `@/types/farm.ts` — canonical TypeScript entity definitions.
- `@/lib/mappers.ts` — entity to database row translation.
- `@/lib/backupSchema.ts` — strict backup/restore validation schema.
- `farmStore.tsx` — global React Context store and CRUD actions.
- `@/lib/native.ts` — centralized native capabilities (haptics, status bar, geolocation).
- `@/lib/syncQueue.ts` — local sync queue and transaction retry engine for offline operation.
- `@/lib/offlineStorage.ts` — offline persistent key-value store.
- `@/hooks/useNetworkStatus.ts` — network connectivity monitoring hook.
- `@/lib/complianceReports` — report generation.
- `@/lib/reportReadiness.ts` — shared report-readiness types, summary builder, and FSA/spray/fertilizer/hay/landlord readiness adapters.
- `@/lib/reportExportHistory.ts` — per-user/farm/season/report local export fingerprints and changed-since-export status.
- `@/components/reports/MobileReportExportPanel.tsx` + `ReportReadinessPanel.tsx` + `ReportIssueList.tsx` — mobile export-first report workspace, readiness summary, and actionable grouped issues.
- `@/lib/complianceReports/fsa578PdfExport.ts` — dedicated FSA employee-facing acreage worksheet PDF (cropland entry table, reconciliation totals, readiness review, and all-CLU reference appendix).
- `@/lib/complianceReports/generateLandlordSummary.ts` — Landlord Summary data builder (field-level landlord grouping, activity timeline, bu/acre + crop-share math, CSV export).
- `@/components/reports/LandlordSummaryReport.tsx` — Landlord tab report UI (Fields overview + Activity Timeline, CSV/Detailed-PDF exports).
- `@/lib/sprayExport.ts` — universal spray log PDF export, including spray attachment image rendering from encoded note tokens.
- `@/types/fsaTract.ts` — canonical FSA tract import and CLU assignment types.
- `@/lib/cluImport.ts` — CLU/FSA GeoJSON parsing and validation.
- `@/lib/tractLookup.ts` and `@/lib/bundledFsaTracts.ts` — bundled/imported FSA tract lookup and merge helpers; use `loadKeyedTractCollections` when code needs tract keys preserved alongside GeoJSON collections.
- `@/lib/fieldLocation.ts` — rainfall coordinate resolver that falls back from field coordinates to drawn boundaries, assigned CLU polygons, and legacy CLU numbers.
- `@/store/useFsaTracts.ts` — FSA tract import and CLU assignment CRUD actions.
- `@/services/fsaTractService.ts` and `@/services/cluAssignmentService.ts` — Supabase persistence for FSA tract imports and CLU assignments.
- `@/components/TractAssignmentFlow.tsx`, `@/components/CluAssignmentMap.tsx`, `@/components/CluFieldSelector.tsx`, `@/components/FsaTractImporter.tsx` — FSA tract management UI.
- `@/utils/dates`, `@/utils/numbers`, `@/utils/text` — pure formatting helpers.
- `@/lib/utils.ts` — `cn` Tailwind class merge plus `getLatestForField` generic helper for finding the most recent non-deleted record for a field (used by activity modal suggested-record prefill).
- `@/lib/activityIcons.ts` — centralized activity type icon and color maps (`ACTIVITY_ICONS`, `ACTIVITY_TEXT_COLORS`, `ACTIVITY_BG_COLORS`).
- `@/hooks/useSprayForm.ts` — shared spray form state for the SprayWizard step components.
- `@/components/CustomSprayModal.tsx` + `@/components/SprayTypeChooser.tsx` + `@/store/useCustomSprayRecords.ts` — custom (outside-party) spray modal, the spray-entry chooser, and the CRUD hook (see Custom (Outside-Party) Spray Records).
- `@/components/SeasonSelect.tsx` — centralized viewing-season dropdown (`variant="sidebar"` for the Sidebar); reads `activeSeason`/`viewingSeason`/`seasonOptions`/`setViewingSeason` from `useFarm()`. Do not re-declare inline season `Select`s — reuse this component.
- `@/hooks/useUndoDelete.ts` — undo-safe soft-delete pattern for FieldManager and similar bulk-delete UI.
- `@/hooks/useCoachmarks.ts` + `@/components/CoachmarkOverlay.tsx` — onboarding coachmark overlay system.
- `@/context/QuickAddContext.tsx` — global Quick Add provider managing modal states, preselected types, and active fields.
- `@/components/QuickAddDialog.tsx` — global Quick Add dialog providing field selection and GPS-based nearest field detection.
- `codemagic.yaml` — CodeMagic CI/CD workflow for iOS builds and TestFlight distribution.
- `CODEMAGIC.md` — CodeMagic setup guide, credentials, and troubleshooting.

## Non-Negotiable Rules

### Data Safety

- Never hard-delete user farm records.
- Use soft delete by setting `deleted_at` to an ISO timestamp.
- Active records always have `deleted_at === null`.
- Client logic must exclude soft-deleted records.
- Supabase RLS must also exclude or protect soft-deleted records where applicable.

### Farm Scoping

- Every Supabase write must be scoped to the current `farm_id`.
- The null farm guard must be the first line of every mutation function:

```ts
if (!farm_id) {
  toast.error('No farm selected.');
  return false;
}
```

- Inserts and restore payloads must include the authoritative current `farm_id`.
- Updates must filter by `.eq('farm_id', farm_id)`.
- Do not send `farm_id` inside `.update()` payloads. Always filter by `.eq('farm_id', farm_id)` instead.

### Season Scoping

- Always stamp new records (both inside CRUD hooks and client components like `SprayModal.tsx`) with the user's currently selected `viewingSeason` (retrieved from `useFarm()`), not `activeSeason`.
- `activeSeason` represents the farm's currently active/current crop year. `viewingSeason` represents the season the user is currently viewing in the sidebar/UI.
- All record-creation and record-editing forms or modals must indicate their target season year in the title, and write actions must scope to `viewingSeason`.
- The local storage key `al_viewing_season` (with a user-scoped prefix) stores the current viewing season.
- On loading or syncing, `viewingSeason` must be validated and clamped to a window of `[activeSeason - 10, activeSeason + 1]`.
- Dropdown selectors (e.g. sidebar, activity, reports) must fetch dynamic options (`seasonOptions`) computed from `farmStore.tsx` rather than hardcoding options.
- **Exception — grain bin inventory:** grain movements are still season-stamped on insert (`seasonYear: viewingSeason`), but bin *inventory* is continuous physical state and must be read season-independently via `getBinTotal(binId)` (no season arg → all-season total). Carryover grain vanishes and becomes unsellable if bin contents are scoped to the viewing season. Season-scoped views (history, reports) are fine; the Logistics bin monitor, SellModal inventory check, and DashboardStats bin totals must use the all-season total.

### Mapper Discipline

- Always call the relevant mapper before touching React state.
- Mappers must convert camelCase app objects to snake_case database rows.
- Optional fields must be sent as `null`, not `undefined`.
- Use mapper safety helpers such as `safeNum` and `safeStr` where appropriate.
- Mappers for user-managed reference data must preserve `id`, `farm_id`, and `deleted_at`.

### Optimistic Update Pattern

Every add, update, and delete mutation must follow this sequence:

1. Guard `farm_id` and return `false` if missing.
2. Validate inputs and return `false` on invalid data.
3. Call mapper before state changes.
4. Apply optimistic React state update with a functional setter.
5. Await the Supabase operation inside a `try...catch` block. You MUST catch unexpected fetch exceptions and assign them to an `error` variable so your existing rollback logic triggers gracefully instead of skipping it.
6. On success (e.g., `error` is null and `{ count: 'exact' }` matches), show success feedback and return `true`.
7. On error, roll back state to the previous snapshot, show detailed error feedback, and return `false`.

All add, update, and delete operations return `Promise<boolean>` — `true` on success, `false` on failure. Never return `undefined`.

### Supabase and Database

- Do not use `upsert` for updates. Use `.update().eq('id', id).eq('farm_id', farm_id)`.
- **Do not use `.select()` in update or soft-delete mutations** to verify success. The `deleted_at IS NULL` RLS SELECT policy will hide newly soft-deleted rows from the returning clause, making the client think 0 rows were updated (triggering a false rollback). Instead, use `.update(payload, { count: 'exact' })` and verify `count === 1` or `count === ids.length`.
- Scoped exception: `fsa_tract_imports` and `field_clu_assignments` MUST use `.upsert(..., { onConflict: ... })` (`farm_id,tract_key` and `farm_id,tract_key,clu_number` respectively) for inserts, and the offline sync queue and backup restore RPC MUST replay those inserts the same way. These tables carry non-partial unique constraints plus mandatory soft delete, so re-importing a tract, reassigning a CLU, or restoring a backup must restore a soft-deleted row by conflict key rather than `insert` (which would violate the constraint). Do not "fix" these upserts into plain inserts/updates. `update`/`soft_delete` paths for these tables still use `.update().eq('id', id).eq('farm_id', farm_id)`.
- New migrations must use unique 14-digit timestamp filenames: `YYYYMMDDHHMMSS_name.sql`.
- Every Data API table must include explicit grants for `authenticated`, `anon` where appropriate, and `service_role`.
- Every farm-owned table must have RLS enabled.
- RLS policies must restrict access by the user's farm through `public.profiles`.
- Do not bypass RLS assumptions in client code.

### Grain Movement

- `bushels` may be negative.
- Negative bushels represent estimate-vs-actual corrections.
- Do not clamp negative grain movement values.
- Display negative bushels with a warning, not as a validation error.
- Bin inventory is season-independent (see Season Scoping). Validate sales against `getBinTotal(bin.id)` (all-season), not just the current season's movements.
- Grain movement edits need a concurrency guard to prevent ghost rows and inventory drift. `useGrainMovements` enforces this with a module-level `isMutating` lock plus an optimistic-concurrency check on `update`/`delete` keyed on the row's `timestamp` (captured from the closure, not a ref mutated inside the state setter). Legacy rows without a usable timestamp fingerprint fall back to an unlocked update so they self-heal instead of getting stuck. Do not reintroduce a ref-based timestamp capture — the closure form exists specifically to avoid a React eager-update dependency.

### Spray Compliance

- Spray records support multiple products per application.
- Product identity in tank-mix UI rows must use a temporary `ui_id`, not the array index.
- Missing `epaRegNumber` marks the record non-compliant.
- Active ingredients are tracked per product.
- Keep spray terminology state-neutral unless a specific legal report requires state wording.
- `WIND_ALERT_MPH = 10` is the named wind alert threshold. Its canonical export is `@/lib/weatherHelpers.ts`; import from there rather than re-declaring a local constant.
- Past weather recovery uses Visual Crossing based on field location and start time.
- **Treated area default**: the "Treated Area Size" pre-fill and every report/export fallback (`useSprayForm`, `Reports.tsx` spray rows, `generateMissouriLog`) must use `getDisplayFieldAcres(field, cluAssignments)` (CLU cropland wins, `field.acreage` fallback) — the FSA crop acreage, never a raw `field.acreage` read. This matches the acreage shown on the field. Current form edits preserve an explicitly stored `treatedAreaSize` (e.g. a partial-field spot-spray). The one-time migration `20260713120000_backfill_spray_treated_area_to_fsa_acreage.sql` intentionally normalized every active historical treated-area value because legacy automatic defaults could not be distinguished from manual entries. That migration changes only `treated_area_size`; it must not rewrite products, totals, weather, wind, temperature, humidity, application times, or notes. Reports may derive product-total display values from the normalized acreage without persisting those calculations back to the record.

### Custom (Outside-Party) Spray Records

- Custom spray records (`custom_spray_records` / `CustomSprayRecord`) are a lightweight log for applications performed by an outside applicator (co-op / custom sprayer), modeled on the hay record — NOT a compliance `SprayRecord`.
- They are reached from the **Spray** button via `SprayTypeChooser` (`src/components/SprayTypeChooser.tsx`), which offers a full spray entry vs. a custom spray and remembers the last choice (per-user `al_spray_entry_choice_<userId>`). The chooser intercepts the spray click in both `FieldDetailScreen.tsx` (`FIELD_ACTIONS`) and `QuickAddDialog.tsx`.
- Fields are minimal: `applicator`, `date`, and `applicationTime` (`HH:mm`, local field/application time) are required; `recipe` (free text), `windSpeed` / `windDirection` / `temperature`, and `notes` are optional. `CustomSprayModal` does not fetch weather automatically: the user explicitly selects the application date/time and taps **Pull historical weather**, which calls `WeatherService.fetchHistoricalConditions` with the field coordinates. Recovered values remain editable, and a failed/no-data lookup must preserve manual weather values.
- Custom sprays appear in the Spray tab (via `CustomSprayTab`, rendered under the regular `SprayTab`) and in All / field history, but are **excluded** from the universal spray-log PDF (`sprayExport.ts`) and the non-compliant review queue, which stay driven by `SprayRecord`.
- `customSpray` is a member of `ActivityType` and the `ActivityRecord` union (reuses the spray icon/colors). `custom_spray_records` is in the sync queue `ALLOWED_TABLES` set and in the backup/restore payload + `restore_farm_backup` RPC. Add/update/delete go through `useCustomSprayRecords.ts` with the same farm-scope, season-stamp, soft-delete, and optimistic-update rules as the other activity hooks.

### FSA Tracts and CLU Assignments

- FSA tract imports and field CLU assignments are farm-owned records and must follow farm scoping, mapper discipline, optimistic updates, and soft delete rules.
- FSA tract and CLU assignment changes usually touch the whole stack together: `types/fsaTract.ts`, `mappers.ts`, `useFsaTracts.ts`, Supabase services, migrations/RLS, backup/restore schema, bundled tract helpers, assignment UI, and FSA report generation/tests.
- Central mapper names are `mapFsaTractFromDb`, `mapFsaTractToDb`, `mapFieldCluAssignmentFromDb`, and `mapFieldCluAssignmentToDb`; use them before React state changes and before backup restore RPC payload construction.
- CLU parsing and GeoJSON rendering logic must support both `Polygon` and `MultiPolygon` geometries. Downstream systems (like map rendering and FSA reports) must extract coordinates or centroids correctly from deeply nested `MultiPolygon` structures.
- `field_clu_assignments` stores one active assignment per farm/tract/CLU. Assignment actions must preserve the authoritative current `farm_id`, restore soft-deleted rows when reassigning, and never hard-delete assignments.
- `fsa_tract_imports` stores parsed GeoJSON per farm/tract key. Imported tracts may replace bundled tract data with the same tract key in assignment flows.
- Backup exports MUST include `fsaTracts` and `cluAssignments`. Restore must validate those arrays through `backupSchema.ts`, map them to `fsa_tract_imports` and `field_clu_assignments`, and replay them through the restore RPC using the CLU conflict keys above.
- When showing CLU totals, assigned counts, or unassigned counts, compare assignments against the same CLU universe being displayed. Do not subtract bundled or legacy assignment keys from imported-only tract totals.
- Active CLU assignment counts must exclude soft-deleted assignments (`deletedAt` / `deleted_at`).
- When a field is soft-deleted, its active field CLU assignments must also be soft-deleted. These deletion mutations must be enqueued via `syncQueue.enqueueMutation` to guarantee offline synchronization.
- Bundled FSA tract data may be used for display and assignment flows, but imported tract counts should be labeled and calculated as imported-only unless the UI explicitly says it includes bundled tracts.
- Persisting assignments back to fields should round computed field acreage for display/state, but not mutate the source CLU feature acres.
- Use `@/lib/geoHelpers.ts` for converting Polygon and MultiPolygon coordinates for Leaflet map render layers and centroid calculations.
- FSA CLU assignments automatically synchronize only their associated field's `cluNumbers` immediately on each assignment toggle via `syncFieldAcreageAndClus` in `TractAssignmentFlow.tsx`. Never overwrite the field's boundary/manual acreage with the CLU total. The stable boundary acreage is exposed as `Field.boundaryAcreage` and stored in the legacy `fields.operational_acreage` column; `getDisplayFieldAcres` independently derives the current FSA cropland total from active CLU assignments. The sync reads from `displayAssignments` (persisted + legacy) through `getFieldAssignmentsWithDelta`, and its order-independent no-op guard prevents redundant writes on idempotent toggles.
- FSA-578 and fall production worksheets are supporting worksheets, not official USDA forms. The FSA-578 PDF is designed to be handed to an FSA employee for crop-acreage entry and reconciliation. Preserve the disclaimer wording and keep CSV/PDF source semantics aligned when changing columns, summaries, footers, or readiness checks.
- FSA report readiness checks should surface missing farm/tract/CLU/crop/acreage issues without blocking export unless the user explicitly asks for blocking validation.
- All report readiness findings are advisory: errors and warnings must never disable PDF/CSV export. Keep authoritative FSA validation in `validateFsa578Rows` / `validateFsaFallProductionRows`; `reportReadiness.ts` adapts those results for presentation instead of duplicating their rules.
- The Reports page is export-first on mobile. FSA-578, Fall FSA, Spray Audit, Fertilizer, Hay, and the selected Landlord report render `MobileReportExportPanel` below the `lg` breakpoint; full report previews remain desktop/print-only. Do not reintroduce large report previews as the default mobile experience.
- Spray readiness headline counts are per application record, not per expanded tank-mix product row. Product-specific issues may be multiple, but `affectedItems` must count the application once.
- Readiness issue actions route field-setup issues to `/field/:fieldId` and record issues to `/activity?tab=...&record=...&type=...`; `Activity.tsx` must keep query-driven tab selection and one-time editor opening working.
- Successful report exports record a deterministic fingerprint in local storage, scoped by user ID, farm ID, viewing season, and report type (`al_report_export_<user>_<farm>_<season>_<report>`). Storage failure must never fail the export. Do not include volatile generation timestamps in fingerprints.
- The FSA-578 PDF must use the dedicated `exportFsa578WorksheetPdf` generator in `fsa578PdfExport.ts`, not the generic `exportToPdf` footer mechanism. Its section order is canonical: cropland reporting rows → crop/use and farm/tract reconciliation totals → items to review/FSA correction notes → all-CLU reference.
- Keep non-cropland CLUs out of the primary crop-entry table. Include them in the all-CLU appendix as boundary-reconciliation rows explicitly labeled reference-only, so they cannot be mistaken for planted acreage.
- Every FSA-578 PDF page must repeat farm name, crop year, producer and county/state blanks or values, section identity, and `Page X of Y`. Use explicit column widths and render verification so farm/tract/CLU columns never clip on continuation pages.
- The main FSA-578 PDF table must provide the data needed for FSA entry: farm, tract, CLU, field, crop, crop status, acres, planting date, intended use, irrigation, producer share, crop sequence, and practice/notes. Type/variety remains omitted from the PDF unless explicitly requested; it remains available in preview/CSV.
- Dated crop rows without an explicit status may display as `Planted`. Undated hay/pasture cropland may display as `Existing stand` and must not generate a missing-status readiness error. Other undated cropland requires an explicit FSA status or a readiness error.
- Reconciliation totals in the PDF must include crop/intended-use totals, farm/tract cropland totals, and a clearly labeled total cropland acreage. Do not label hay/pasture acreage as “planted acreage” when no planting event exists.
- Readiness issues must be included inside the exported PDF, followed by usable FSA office correction lines and review/date/producer-initial fields. A clean report must still state that county FSA review is required.
- Do not call the text-only CLU section a “map appendix.” It is the “All CLU Reference.” If actual maps are added later, they must contain rendered CLU/field geometry rather than text-only assignments.
- FSA acreage reports must preserve multiple planting records for the same field/CLU as separate rows instead of collapsing to latest-only.
- Assigned cropland CLUs with no planting record must appear as review rows so missing FSA reporting is visible.
- If an assigned cropland field is labeled hay or pasture by `intendedUse`, use that hay/pasture label as the FSA crop instead of flagging crop as missing.
- Plant records support FSA status (`Planted`, `Prevented Planting`, `Failed`, `Volunteer`, `Cover Crop`) and optional planting pattern/practice notes. Update `types/farm.ts`, `types/database.ts`, mappers, backup schema, migrations, UI, reports, and tests together when changing these fields.
- Prevented planting records may omit seed variety; normal planted/failed/volunteer/cover-crop records should still require the expected crop/seed details.
- FSA PDF output intentionally omits type/variety unless the user asks otherwise; preview/print/CSV may include it for farmer review.
- FSA compliance reports (both FSA-578 and Fall Production worksheets) must include the farm name in their header subtitles for both on-screen UI preview tables and generated PDF exports.

### Landlord Summary

- The **Landlord** report tab (`LandlordSummaryReport.tsx` + `generateLandlordSummary.ts`) is a per-landlord overview driven by the **field-level** `Field.landlordName`, NOT the legacy harvest-only `HarvestRecord.landlordName`.
- A landlord is selectable only if at least one non-deleted field carries their name (`getFieldLandlordNames` filters on `deleted_at`). Soft-deleting a landlord's last field removes them from the dropdown.
- The summary aggregates all season-scoped activity (plant, spray, custom spray, fertilizer, tillage, harvest) across the landlord's fields into a date-sorted timeline, plus a per-field yield summary (acres via `getDisplayFieldAcres`, total bushels, bu/acre, and landlord crop-share bushels computed from each harvest's `landlordSplitPercent`).
- Acreage must use `getDisplayFieldAcres(field, cluAssignments)` (CLU cropland wins, `field.acreage` fallback) — the canonical display acreage, never a raw `field.acreage` read.
- Activity dates must format via `parseLocalDate` (from `@/utils/dates`), not `new Date(iso)`, to avoid the one-day-early UTC shift on date-only strings.
- The desktop/print report renders through `ReportTable`; every `<td>` must carry `data-label` matching its header. Mobile uses the shared export-first workspace after a landlord is selected.
- Exports: CSV (`generateLandlordSummaryCSV`, per-field + totals) and a landscape **Detailed PDF** via `exportToPdf` with the activity timeline in the footer. The PDF subtitle must include the farm name (per the FSA rule above). Long footer lines are wrapped via `doc.splitTextToSize` inside `exportToPdf`.
- The older `LandlordStatementReport` / `generateLandlordStatement` (harvest-only crop-share statement) is retained for its tests but no longer rendered in the UI. Do not delete it without migrating its coverage.
- **Grain delivered-vs-owed is intentionally out of scope.** The owed side (crop-share bushels) is computed; the delivered side is not, because `GrainMovement` has no field/landlord link (only an optional `harvestRecordId` that `SellModal` doesn't populate). Adding it is a separate schema change.

### Backup and Restore

- Backup restore must treat the current selected `farm_id` as authoritative.
- Before mapping restored records, merge `{ ...record, farm_id }` into each restored record.
- For FSA tract imports and CLU assignments, the app type uses `farmId`; merge `{ ...record, farmId: farm_id }` before calling `mapFsaTractToDb` or `mapFieldCluAssignmentToDb`.
- Backups must preserve CLU setup with `fsaTracts` and `cluAssignments`; the restore RPC payload must send those as `fsa_tract_imports` and `field_clu_assignments`.
- Do not hydrate React state directly from raw backup arrays.
- Normalize restored records first.
- If the restore RPC fails, do not mutate React state.

### CI/CD (CodeMagic)

- `codemagic.yaml` defines the iOS build workflow for CodeMagic.
- The workflow triggers on push to `main` and builds an IPA for App Store distribution.
- Code signing uses uploaded certificates and provisioning profiles via `ios_signing`.
- TestFlight publishing uses `auth: integration` with the `appstore` integration.
- Environment variable group `appstore` contains `VITE_*` build secrets and ASC API credentials.
- Confirmed working TestFlight builds require `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `APP_STORE_CONNECT_PRIVATE_KEY`, `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_KEY_ID` in the `appstore` group.
- `VITE_RAIN_API_URL` is optional because `RainService` falls back to `https://rain-api.vercel.app` when the variable is missing. If configured, it must be a clean HTTPS URL; do not include quotes, `KEY=`, commas, CLI commands, or duplicate `/rain` path suffixes.
- `VITE_SUPABASE_URL` must be the raw HTTPS project URL, e.g. `https://<project-ref>.supabase.co`; do not include quotes, `KEY=`, commas, CLI commands, or the Postgres connection string in Codemagic values.
- Capacitor iOS builds depend on `npm run cap:build` using `vite build --mode capacitor`; keep `base: "./"` for capacitor mode so bundled JS/CSS load from `capacitor://localhost`.
- Do not add a global `tar` override in `package.json`. Capacitor 6 CLI requires its compatible nested `tar@6` dependency shape; forcing `tar@7` breaks `npx cap sync ios` with `Cannot read properties of undefined (reading 'extract')`.
- Do not re-enable automatic external TestFlight submission unless App Store Connect Beta App Information and Beta App Review Information are complete.
- **Marketing version** is read from `package.json` at build time. **Build number** uses CodeMagic's `$BUILD_NUMBER`.
- **Do not** add `app_store_connect` publishing blocks without verifying the integration name exists in CodeMagic.
- The working integration name is `appstore`. Do not rename it without updating the yaml.
- All three remotes (GitHub, Codeberg, GitLab) must be synced when pushing CI/CD changes. For normal mainline pushes, verify remote heads after pushing because `origin` has multiple push URLs.

### Native & Offline Capability

- **Web Compatibility**: The codebase is a shared web/native hybrid. Never call Capacitor plugins unconditionally. All native device APIs must check `Capacitor.isNativePlatform()` or use `@/lib/native.ts` wrappers.
- **Offline Operations**: Mutations must support offline caching. The app automatically pushes sync actions to a local queue when offline (`@/lib/syncQueue.ts`), saving them locally (`@/lib/offlineStorage.ts`) and auto-replaying them upon connection restoration or app foreground resume.
- **Haptic Feedback**: Trigger native haptic feedback on major user interactions:
  - Navigation tab taps: light haptic feedback.
  - Record save/validation success: success notification haptic.
  - Form validation failure: error notification haptic.
- **Layout Insets**: Use CSS env safe-area variables for header and bottom navigation spacing to prevent content overlaps on notched screens (e.g. Dynamic Island).
- **PWA / Service Worker** (`src/main.tsx`): In `DEV`, service workers and caches are unregistered/cleared on load so code changes always win. In production, `registerSW` is wired so a waiting worker (`onNeedRefresh`) **and** a `controllerchange` flip both trigger an auto-reload — iOS checks for SW updates only ~daily on its own, so the app also polls `registration.update()` on `visibilitychange`, `focus`, `online`, and every 30 min while visible. Two safety guards must be preserved when touching this code:
  - The reload is deferred while a Radix overlay is open (`[data-state="open"]`, `[role="dialog"]`, `[role="alertdialog"]`) so unsaved form entries aren't lost; after `MAX_DEFERS` (10 × 30 s ≈ 5 min) it force-reloads so a stuck overlay can't pin the tab to a stale worker forever.
  - The `controllerchange` handler is guarded on `hadControllerAtLoad` so a first-ever visit (where the new worker claims a previously-uncontrolled page via `clients.claim()`) is **not** reloaded. Don't drop either guard — reloading on first load or mid-entry both wreck UX.

## UI and Component Rules

### Accessibility

- Every `DialogContent` must include a `DialogDescription`.
- Visually hidden descriptions are acceptable with `sr-only`.
- Every form input must have a unique `id` and `name`.
- Every `Label` must use `htmlFor` linked to the input ID.
- Interactive touch targets should be at least 44px high. Default form `Input` and `SelectTrigger` components must use `h-11` (44px) height. Custom height overrides (such as `h-9` or `h-10`) on form inputs and selectors should be avoided to prevent touch-target regressions.

### Light Mode Theme
- The light mode theme is a high-contrast, vibrant palette.
- Background uses a soft pastel denim-blue (`212 40% 91%`).
- Cards and popover elements use pure white (`0 0% 100%`) for crisp visual elevation.
- Typography foreground color uses deep navy-black (`212 80% 6%`) to guarantee high readability.
- Brand colors are highly saturated: Plant/primary green (`142 90% 28%`), Spray/secondary blue (`212 100% 36%`), and Harvest/accent amber (`36 95% 44%`).
- Outlines and borders use defined slate-denim gray (`212 25% 78%`).
- Muted helper/secondary text uses a darker slate-denim gray (`212 25% 30%`) to meet WCAG AA contrast guidelines.

### Typography

- Use Inter through `font-sans` for normal labels, headings, body text, buttons, navigation, empty states, and descriptions.
- Use JetBrains Mono through `font-mono` for data values such as numbers, dates, timestamps, coordinates, table cells, IDs, registration numbers, ticket numbers, and version strings.
- The AcreLedger brand text intentionally uses `font-mono` and `tracking-tighter`.

### Numeric Display

- Do not render raw summed floating-point values for acreage, bushels, rainfall, percentages, or report totals.
- Use `roundTo` and `formatMeasurement` from `@/utils/numbers` for displayed measurements unless a more specific formatter already exists.
- Keep stored numeric precision intact; round for display/export summaries, not by mutating source records.
- Treat `0` as a valid display value. Use `value != null ? value : '—'`, not simple truthiness.

### Text Case

- Prefer sentence case.
- Avoid `uppercase` with `tracking-widest` for normal labels, buttons, and body text.
- Uppercase is acceptable for tiny badges, report table headers, and legal/regulatory footers.
- Field status indicators must render as high-contrast inline labeled pills (e.g., "Planted", "Activity logged", or "No activity") using opacity-friendly theme styles (e.g. `bg-plant/10 text-plant border-plant/20` / `bg-spray/10 text-spray border-spray/20` / `bg-muted text-muted-foreground border-border`) next to the entity header, rather than absolute-positioned corner status dots.

### Layout

- Preserve the mobile-first design.
- Page headers should follow the sticky header pattern from `BLUEPRINT.md`.
- Mobile pages must reserve bottom padding for the fixed `BottomNav`. `BottomNav` uses `.touch-target` (`min-height: 64px` ≈ `4rem`) plus `pb-[env(safe-area-inset-bottom)]`. The page-container value depends on whether the global Quick Add FAB renders on that route (`App.tsx` → `hideQuickAddFab`):
  - **FAB shown** (Index, Reports, Settings, Weather, other root pages): use `pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8` so the last card clears both the nav and the FAB.
  - **FAB hidden** (`/activity`, `/logistics`, `/onboarding`, `/privacy`, `/field/*`): use `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8` (nav only). `FieldDetailScreen` uses `6rem` because it renders its own in-flow Quick Actions grid.
  - Never set page-container bottom padding below the nav height, or the last cards scroll under the tab bar.
- Do not reintroduce floating/sticky bottom bars on the dashboard. Crop filters, totals, and quick actions live in the scrollable body (directly below the `WeatherBar`), not in an overlay footer.
- `FieldDetailScreen` section order is canonical (see `BLUEPRINT.md` → Field Dashboard): header → boundary map → Quick Actions → Today at a Glance → Latest Spray → Field History → Rainfall Summary → CLU Summary → Field Details & Notes. Daily-use action sections (Quick Actions, Today at a Glance, Latest Spray, Field History) sit above reference sections (rainfall detail, CLU, field meta). The CLU section is a single row showing count + cropland/non-cropland totals + Manage/Assign button; the full per-CLU list lives in the management dialog, not inline on the page.
- Horizontal tab bars on mobile viewports should support horizontal scrolling (`flex overflow-x-auto no-scrollbar`) with non-shrinking, non-wrapping tab labels (`shrink-0 whitespace-nowrap`) to guarantee that labels are always visible and readable on mobile without text cutoff.
- Use consistent radius rules:
  - Inline items, badges, small buttons: `rounded-lg`
  - Cards, sections, containers: `rounded-2xl`
  - Pills and avatars: `rounded-full`
  - Progress bars: `rounded-full`

### Responsive Tables

- `ReportTable` applies the `mobile-cards` class globally. On screens ≤ 768px each table renders as a stack of bordered cards instead of a horizontally-scrollable grid.
- Reports-page tables are intentionally wrapped in `hidden lg:block print:block`; mobile users receive readiness, issue review, and export controls instead of the full table. `mobile-cards` remains the fallback for `ReportTable` consumers rendered on small screens elsewhere.
- Every data `<td>` inside a `ReportTable` MUST carry a `data-label="<HEADER>"` matching its column header. Cells without `data-label` render as unlabeled, right-aligned cards on mobile.
- Full-width rows (`<td colSpan={n}>` for banners, readiness checks, and empty states) MUST NOT carry `data-label`; they are handled automatically by the `td[colspan]` CSS rules and render full-width.
- Standalone `<table>`s that bypass `ReportTable` are excluded from the card layout by design. Do not add `mobile-cards` to them unless every cell also gets `data-label`. The Landlord Summary desktop/print preview (`LandlordSummaryReport.tsx`) uses `ReportTable` for both its Fields and Activity Timeline tables, so every cell there must carry `data-label`.

### Icons

- Lucide React is the only icon library.
- Never import a Lucide icon using a name that conflicts with a browser global object.
- Always alias risky icons:

```ts
import { Map as MapIcon, History as HistoryIcon } from 'lucide-react';
```

### Leaflet Maps

- Leaflet's internal panes default to z-index 200–1000, which sit above shadcn's `Dialog`/`Sheet`/`Popover` overlays (`z-50`). A global CSS override in `src/index.css` caps all Leaflet panes/controls at z-index 1–6 (preserving internal ordering) so modals render above maps. Do not raise these values without also bumping the shadcn overlay z-index, or maps will bleed through dialogs again.
- Internal map overlays (loading spinners, source badges, footer selectors) should use `z-10` to layer above the panes (1–6) but stay below the dialog overlay (50).
- Polygon and MultiPolygon coordinate extraction for Leaflet render layers and centroid calculations must go through `@/lib/geoHelpers.ts` (`getLatLngsFromGeometry`, `hasValidGeometry`, `getCentroid`).

## Error Handling

- Every page route is wrapped in `ErrorBoundary` (`src/components/ErrorBoundary.tsx`), a class component that catches render-time crashes and shows a retry UI.
- When adding new top-level routes, wrap the element in `<ErrorBoundary>`.
- Do not remove or bypass the error boundary; it prevents full-app blank-screen crashes.
- For non-fatal async errors (Supabase failures, weather/rainfall lookups), use `toast.error(...)` and degrade gracefully rather than throwing.

## React and Performance Rules

- Use `useFarm()` for global farm state.
- Wrap expensive derived values from large arrays in `useMemo`.
- Do not call `fields.find(...)` inside row-level `.map()` loops.
- Build lookup maps once with `useMemo`, for example `new Map()`.
- Pure helpers that do not depend on component state or props belong outside the component.
- Avoid manual chunks for UI libraries in Vite config unless there is a confirmed reason.
- `useEffect` dependency arrays must not depend on store entity object references (e.g. `field`, `plantRecords`) that `farmStore.tsx` recreates on every `fetchData()` call (app mount + each network reconnect). Depend only on primitives (e.g. `field.id`, `field.lat`, `field.lng`) or stable flags (e.g. `open`, `initialData`). Mismatched deps between sibling effects cause one effect to wipe async-fetched data (such as spray-log weather) while the effect that re-fetches it never re-runs, silently leaving the data missing. This caused the spray modal weather-not-loading bug; `HayModal` already follows the correct pattern.
- When an effect both initializes form state and an async fetch populates some of that state, the initialize/reset effect and the fetch effect must share the same stable trigger set (typically `open` and `initialData`), so a store refresh cannot clear already-fetched data without re-triggering the fetch.

## Weather and Rainfall Rules

- Weather uses Visual Crossing, routed through `WeatherService.buildWeatherUrl`. In dev (or Capacitor builds with `VITE_VISUALCROSSING_KEY` set and no proxy), it calls the Visual Crossing API directly; otherwise it goes through the `/api/weather-proxy` edge function (auth bearer header attached when a session token exists). `WeatherService` resolves the proxy base via `resolveWeatherProxyUrl()`.
- `VITE_WEATHER_PROXY_URL` (optional) overrides the proxy base for Capacitor builds. If set, it must be HTTPS (or `localhost`/`127.0.0.1`), have no surrounding quotes, and not already include the `/api/weather-proxy` path suffix — `WeatherService` appends it. A Capacitor build with neither `VITE_VISUALCROSSING_KEY` nor `VITE_WEATHER_PROXY_URL` throws at URL-build time rather than failing silently. `WeatherService.cleanEnvValue` strips stray quotes/whitespace from these env vars at load.
- Rainfall uses the Rain API with IEM Stage IV radar plus Supabase RPC merge.
- Rainfall lookups should use coordinates when available so the radar merge remains active.
- Lat/lng should be rounded to 4 decimals for radar grid consistency.
- Polygon field boundaries should fall back to centroids when explicit coordinates are missing.
- Field rainfall lookups should go through `resolveFieldRainfallLocation` from `@/lib/fieldLocation.ts` so fields without explicit lat/lng can use drawn boundary centroids, assigned CLU geometry, or legacy CLU numbers before showing missing-location errors.
- When resolving CLU geometry for rainfall or maps, preserve tract keys with `loadKeyedTractCollections` rather than losing key context from raw `TractFeatureCollection[]` arrays.
- Weather and rainfall request failures should degrade gracefully without crashing the UI.
- Windy radar embeds require CSP entries in both `child-src` and `frame-src`.

## Coding Style

- TypeScript strict mode is expected.
- Prefer explicit types for exported functions and public helpers.
- Keep logic local and boring unless a shared helper already exists.
- Do not introduce new libraries without a strong reason.
- Reuse existing shadcn/ui, Tailwind, Lucide, Sonner, Zod, mapper, and utility patterns.
- Use existing naming conventions rather than inventing new ones.

### File Naming

- **Components**: PascalCase — e.g. `FieldCard.tsx`, `SprayModal.tsx`.
- **Pages**: PascalCase — e.g. `Index.tsx`, `Settings.tsx`, `FieldDetailScreen.tsx`.
- **Hooks**: camelCase with `use` prefix — e.g. `usePlantRecords.ts`, `useAuth.ts`.
- **Services and utilities**: camelCase — e.g. `binService.ts`, `sprayExport.ts`, `dates.ts`.
- **Type definitions**: camelCase — e.g. `farm.ts`, `database.ts`, `weather.ts`.
- **shadcn/ui primitives**: kebab-case in `src/components/ui/` — e.g. `alert-dialog.tsx`, `input-otp.tsx`.
- **Tests**: colocated, appended `.test` — e.g. `mappers.test.ts`, `WeatherService.test.ts`.

### Spray Wizard Pattern

`SprayModal` is refactored into a 5-file wizard pattern:
- `src/components/spray/SprayWizardNav.tsx` — step progress bar and Prev/Next/Save buttons.
- `src/components/spray/SprayWizardCoreStep.tsx` — field, date, applicator, equipment, site info.
- `src/components/spray/SprayWizardMixStep.tsx` — tank mix, products, rates, recipe loading.
- `src/components/spray/SprayWizardConditionsStep.tsx` — weather, wind, conditions.
- `src/components/spray/SprayWizardReviewStep.tsx` — summary and save.
- `src/hooks/useSprayForm.ts` — shared form state (products, weather, conditions, review data) consumed by all step components.

Keep each step component under ~150 lines. All form state lives in `useSprayForm`; step components are pure presenters. `SprayModal` owns only the step routing, navigation callbacks, and save dispatch.

Spray also has an in-cab quick mode controlled by `useSprayForm.isQuickMode`; preserve both the quick path and full wizard path when changing validation, save behavior, or field prefills. Quick mode is optimized for glove-friendly spray logging and still writes through the same `handleSubmit` path.

Spray photo/ticket attachments are stored in `notes` as `[ATTACHMENT:data:image/...;base64,...]` tokens. UI and exports must parse/strip this token and render the image separately; never display or export raw base64 attachment text. `sprayExport.ts` is responsible for embedding the attachment image in PDF exports.

After a successful new spray with a novel mix, `useSprayForm` may prompt to save the mix as a spray recipe. Keep that recipe dialog mounted until the user confirms or cancels, even if the spray record itself has already saved. Recipe duplicate checks should compare product name, rate, rate unit, and EPA registration number, not product names alone.

### Activity Record Modals

All activity record modals (`PlantModal`, `SprayModal`, `HarvestModal`, `HayModal`, `FertilizerModal`, `TillageModal`, `GrainMovementModal`, and the lightweight `CustomSprayModal`) share a common prop and behavior pattern. `CustomSprayModal` is reached via `SprayTypeChooser` (not a top-level activity button) and its records render inside the Spray tab through `CustomSprayTab`.

- **`mode?: 'edit' | 'duplicate'`** — defaults to `'edit'`. Pass `'duplicate'` to open the modal pre-filled from an existing record but creating a new record on save instead of updating the source.
- **`isDuplicate = mode === 'duplicate' && !!initialData`** — every modal computes this locally. Duplicate mode without `initialData` falls through to "new" behavior.
- **Duplicate semantics**: stamp today's date (not the source record's date), stamp `viewingSeason` as `seasonYear` (not the source's season), and call `addXxxRecord` (not `updateXxxRecord`) on save.
- **`onDuplicate?` callback** is plumbed through `RecordListItem` → activity tabs (`PlantTab`, `SprayTab`, `HarvestTab`, `HayTab`, `FertilizerTab`, `TillageTab`, `GrainTab`) and `HistoryFeed` → `Activity.tsx` / `FieldDetailScreen.tsx`. Tabs that don't pass `onDuplicate` simply hide the duplicate button.

**Suggested-record prefill**: when opening a modal without `initialData` (new record), each modal pre-fills non-date fields from the most recent prior record of the same type for that field — e.g., spray pre-fills applicator name, license number, target pest, and tank-mix products from the last spray on the field; plant pre-fills crop and seed variety; hay pre-fills bale type; etc. Use `getLatestForField` from `@/lib/utils` to compute the source record. Duplicate mode bypasses the prefill (it uses `initialData`).

**`editingRecordType` discriminator**: `Activity.tsx` and `FieldDetailScreen.tsx` track the clicked record's type in a separate `editingRecordType` state and gate modal rendering on it (`editingRecordType === 'plant' && ...`), NOT on the visible tab. This lets users click edit/duplicate on any record from the All/History tab and still get the correct modal — gating on `tab` would fail when the user is on the All tab. Modal `onClose` handlers must reset all three states together: `setEditingRecord(null); setEditingRecordType(null); setEditingMode('edit')`.

**Spray review queue**: `Activity.tsx` includes a review-queue filter for incomplete/non-compliant spray records (`nonCompliant === true`). Keep the queue scoped to `viewingSeason`, the current search filter, and pending-delete filtering so it matches the records the user can act on.

### Undo-Delete Pattern

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

### Activity Icons

Icon and color mapping for activity types is centralized in `src/lib/activityIcons.ts`:
- `ACTIVITY_ICONS` — Lucide icon per `ActivityType`.
- `ACTIVITY_TEXT_COLORS` — Tailwind text color class per type.
- `ACTIVITY_BG_COLORS` — Tailwind background color class per type.

Replace inline icon/color switch logic in `RecordListItem`, `FieldCard`, `DashboardStats`, and similar components with these maps. `ActivityType` covers: `plant`, `spray`, `customSpray`, `harvest`, `grain`, `hay`, `fertilizer`, `tillage`.

### Coachmarks (Onboarding Overlay)

Onboarding coachmarks use `src/hooks/useCoachmarks` and render via `src/components/CoachmarkOverlay`. Steps target DOM elements by `id` on those elements. Target IDs on key UI elements:
- Dashboard tab: `id="coachmark-activity-tab"`, `id="coachmark-reports-tab"`.

The hook is enabled only when `session && onboardingComplete && location.pathname === '/'`. New coachmark steps targeting other elements must add stable `id` attributes to those elements first.

### Testing

- Component testing involving complex map lifecycles (like `MapContainer` or Leaflet) should mock the nested map components (`CluAssignmentMap`, `CluFieldSelector`, etc.) and invoke their callbacks explicitly.
- Use explicit `await waitFor(...)` assertions when interacting with mocked component state that relies on React's asynchronous render cycle to avoid stale prop values during test execution.
- When mocking `useFarm` in modal tests, include every collection the modal reads (`plantRecords`, `sprayRecords`, `harvestRecords`, `hayHarvestRecords`, `customSprayRecords`, `fertilizerApplications`, `tillageRecords`, `fields`, `cluAssignments`, etc.). Activity modals compute suggested-record prefills via `.filter()` on these arrays, so an `undefined` collection crashes the `useMemo` on mount — see `SprayModal.test.tsx` for the canonical mock shape.

### Import Order

Group imports in this order, separated by blank lines:

1. React and React addons (e.g. `react`, `react-router-dom`).
2. External libraries (e.g. `@supabase/supabase-js`, `sonner`, `lucide-react`, `framer-motion`).
3. Internal `@/` imports — components, store, types, services, utils.
4. Relative imports (`../lib/`, `./`).

Within each group, order alphabetically by module path. This matches the existing codebase and keeps diffs clean.

## Change Workflow

Before editing:

1. State the likely files involved.
2. Inspect existing implementations and adjacent patterns.
3. Check relevant data types and mappers.
4. Check whether the change touches RLS, migrations, reports, exports, or backup/restore.

While editing:

1. Keep changes minimal and task-scoped.
2. Preserve existing behavior unless the task explicitly asks to change it.
3. Update types, mappers, database logic, UI, and reports together when the data model changes. For any new field/table, also update `backupSchema.ts` (the `.strict()` schemas reject unknown keys, so a missing entry throws on every save), add a Supabase migration, and extend `generateTestData.ts`.
4. Do not leave TODOs in production code unless the user explicitly asks for scaffolding.

After editing:

1. Run the most relevant available checks. The repo defines:
   - `npm run lint` — `eslint .` (fast, run for any source change).
   - `npm run test` — `vitest run` (run when touching logic with colocated `*.test.*` files).
   - `npm run build` — `vite build` (the de-facto typecheck; there is no separate `tsc`/`typecheck` script, so `build` is the type gate before merging).
2. Summarize changed files, behavior changes, and verification results, including which of the above commands you ran and their outcome.
3. Mention any unchecked risk clearly.

## When to Use `BLUEPRINT.md`

Use targeted sections of `BLUEPRINT.md` when working on:

- Data models or farm entity behavior.
- Supabase writes, RLS, migrations, or restore flows.
- UI design system or accessibility patterns.
- Spray compliance, weather, rainfall, FSA reports, or grain movement.
- Any bug involving optimistic updates, local state, or mapper output.

Do not read the full blueprint for small isolated edits such as text copy, minor styling, or a local bug fix unless the code path is unclear.

## Cross-Agent Consistency

- `AGENTS.md` is the canonical shared instruction file.
- Agent-specific instruction files (`CLAUDE.md`, `GEMINI.md`, `CODEX.md`) may add model-specific notes but must always point back to `AGENTS.md` and never contradict it.
- If instructions conflict, follow the more specific project safety rule first, especially data safety, farm scoping, RLS, mapper discipline, and soft delete rules.
