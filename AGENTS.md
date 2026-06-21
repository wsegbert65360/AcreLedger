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
- `farmStore.tsx` — global React Context store and CRUD actions.
- `@/lib/native.ts` — centralized native capabilities (haptics, status bar, geolocation).
- `@/lib/syncQueue.ts` — local sync queue and transaction retry engine for offline operation.
- `@/lib/offlineStorage.ts` — offline persistent key-value store.
- `@/hooks/useNetworkStatus.ts` — network connectivity monitoring hook.
- `@/lib/complianceReports` — report generation.
- `@/lib/sprayExport.ts` — universal spray log PDF export.
- `@/types/fsaTract.ts` — canonical FSA tract import and CLU assignment types.
- `@/lib/cluImport.ts` — CLU/FSA GeoJSON parsing and validation.
- `@/lib/tractLookup.ts` and `@/lib/bundledFsaTracts.ts` — bundled FSA tract lookup and merge helpers.
- `@/store/useFsaTracts.ts` — FSA tract import and CLU assignment CRUD actions.
- `@/services/fsaTractService.ts` and `@/services/cluAssignmentService.ts` — Supabase persistence for FSA tract imports and CLU assignments.
- `@/components/TractAssignmentFlow.tsx`, `@/components/CluAssignmentMap.tsx`, `@/components/CluFieldSelector.tsx`, `@/components/FsaTractImporter.tsx` — FSA tract management UI.
- `@/utils/dates`, `@/utils/numbers`, `@/utils/text` — pure formatting helpers.
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
5. Await the Supabase operation.
6. On success, show success feedback and return `true`.
7. On error, roll back state to the previous snapshot, show detailed error feedback, and return `false`.

All add, update, and delete operations return `Promise<boolean>` — `true` on success, `false` on failure. Never return `undefined`.

### Supabase and Database

- Do not use `upsert` for updates. Use `.update().eq('id', id).eq('farm_id', farm_id)`.
- Scoped exception: `fsa_tract_imports` and `field_clu_assignments` MUST use `.upsert(..., { onConflict: ... })` (`farm_id,tract_key` and `farm_id,tract_key,clu_number` respectively) for inserts, and the offline sync queue MUST replay those inserts the same way. These tables carry non-partial unique constraints plus mandatory soft delete, so re-importing a tract or reassigning a CLU must restore a soft-deleted row by conflict key rather than `insert` (which would violate the constraint). Do not "fix" these upserts into plain inserts/updates. `update`/`soft_delete` paths for these tables still use `.update().eq('id', id).eq('farm_id', farm_id)`.
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
- Grain movement edits need a concurrency guard to prevent ghost rows and inventory drift.

### Spray Compliance

- Spray records support multiple products per application.
- Product identity in tank-mix UI rows must use a temporary `ui_id`, not the array index.
- Missing `epaRegNumber` marks the record non-compliant.
- Active ingredients are tracked per product.
- Keep spray terminology state-neutral unless a specific legal report requires state wording.
- `WIND_ALERT_MPH = 10` is the named wind alert threshold.
- Past weather recovery uses Visual Crossing based on field location and start time.

### FSA Tracts and CLU Assignments

- FSA tract imports and field CLU assignments are farm-owned records and must follow farm scoping, mapper discipline, optimistic updates, and soft delete rules.
- FSA tract and CLU assignment changes usually touch the whole stack together: `types/fsaTract.ts`, `mappers.ts`, `useFsaTracts.ts`, Supabase services, migrations/RLS, backup/restore schema, bundled tract helpers, assignment UI, and FSA report generation/tests.
- `field_clu_assignments` stores one active assignment per farm/tract/CLU. Assignment actions must preserve the authoritative current `farm_id`, restore soft-deleted rows when reassigning, and never hard-delete assignments.
- `fsa_tract_imports` stores parsed GeoJSON per farm/tract key. Imported tracts may replace bundled tract data with the same tract key in assignment flows.
- When showing CLU totals, assigned counts, or unassigned counts, compare assignments against the same CLU universe being displayed. Do not subtract bundled or legacy assignment keys from imported-only tract totals.
- Active CLU assignment counts must exclude soft-deleted assignments (`deletedAt` / `deleted_at`).
- Bundled FSA tract data may be used for display and assignment flows, but imported tract counts should be labeled and calculated as imported-only unless the UI explicitly says it includes bundled tracts.
- Persisting assignments back to fields should round computed field acreage for display/state, but not mutate the source CLU feature acres.
- FSA-578 and fall production worksheets are farmer worksheets, not official USDA forms. Preserve the disclaimer wording and keep CSV/PDF exports aligned when changing columns, summaries, footers, or readiness checks.
- FSA report readiness checks should surface missing farm/tract/CLU/crop/acreage issues without blocking export unless the user explicitly asks for blocking validation.
- FSA acreage reports must preserve multiple planting records for the same field/CLU as separate rows instead of collapsing to latest-only.
- Assigned cropland CLUs with no planting record must appear as review rows so missing FSA reporting is visible.
- If an assigned cropland field is labeled hay or pasture by `intendedUse`, use that hay/pasture label as the FSA crop instead of flagging crop as missing.
- Plant records support FSA status (`Planted`, `Prevented Planting`, `Failed`, `Volunteer`, `Cover Crop`) and optional planting pattern/practice notes. Update `types/farm.ts`, `types/database.ts`, mappers, backup schema, migrations, UI, reports, and tests together when changing these fields.
- Prevented planting records may omit seed variety; normal planted/failed/volunteer/cover-crop records should still require the expected crop/seed details.
- FSA PDF output intentionally omits type/variety unless the user asks otherwise; preview/print/CSV may include it for farmer review.
- FSA compliance reports (both FSA-578 and Fall Production worksheets) must include the farm name in their header subtitles for both on-screen UI preview tables and generated PDF exports.

### Backup and Restore

- Backup restore must treat the current selected `farm_id` as authoritative.
- Before mapping restored records, merge `{ ...record, farm_id }` into each restored record.
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

## UI and Component Rules

### Accessibility

- Every `DialogContent` must include a `DialogDescription`.
- Visually hidden descriptions are acceptable with `sr-only`.
- Every form input must have a unique `id` and `name`.
- Every `Label` must use `htmlFor` linked to the input ID.
- Interactive touch targets should be at least 44px high.

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

### Layout

- Preserve the mobile-first design.
- Page headers should follow the sticky header pattern from `BLUEPRINT.md`.
- Use consistent radius rules:
  - Inline items, badges, small buttons: `rounded-lg`
  - Cards, sections, containers: `rounded-2xl`
  - Pills and avatars: `rounded-full`
  - Progress bars: `rounded-full`

### Icons

- Lucide React is the only icon library.
- Never import a Lucide icon using a name that conflicts with a browser global object.
- Always alias risky icons:

```ts
import { Map as MapIcon, History as HistoryIcon } from 'lucide-react';
```

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

- Weather uses Visual Crossing.
- Rainfall uses the Rain API with IEM Stage IV radar plus Supabase RPC merge.
- Rainfall lookups should use coordinates when available so the radar merge remains active.
- Lat/lng should be rounded to 4 decimals for radar grid consistency.
- Polygon field boundaries should fall back to centroids when explicit coordinates are missing.
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
3. Update types, mappers, database logic, UI, and reports together when the data model changes.
4. Do not leave TODOs in production code unless the user explicitly asks for scaffolding.

After editing:

1. Run the most relevant available checks from `package.json`.
2. If tests are unavailable, run TypeScript/build checks when possible.
3. Summarize changed files, behavior changes, and verification results.
4. Mention any unchecked risk clearly.

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
- `GEMINI.md` may add Gemini CLI behavior but must not contradict this file.
- Other agent-specific files may point back here.
- If instructions conflict, follow the more specific project safety rule first, especially data safety, farm scoping, RLS, mapper discipline, and soft delete rules.
