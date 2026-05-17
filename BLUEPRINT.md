# BLUEPRINT.md — AcreLedger

> **Purpose:** Single authoritative reference for AcreLedger's architecture, patterns, and rules.
> Read this file before making any change or addition. A capable AI agent must be able to
> reconstruct a functionally equivalent application from this document alone.

---

### External Resources
- **Testing & Credentials**: [TESTING.md](./TESTING.md)

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
| State | React Context (`farmStore.tsx`) | Global client state + CRUD actions |
| UI Components | shadcn/ui (Radix primitives) | Dialog, Select, Alert, Button, Card, etc. |
| Styling | Tailwind CSS v3 | Utility classes, CSS variables for theming |
| Icons | Lucide React | All iconography — no other icon lib |
| Toasts | Sonner | User feedback — success / error / warning / info |
| Validation | Zod (`@/lib/backupSchema`) | Backup file schema validation on restore |
| Weather | Visual Crossing API | Current conditions, extended data (gusts, dew point, feels-like), 10-day forecast |
| Rainfall | IEM Stage IV + Supabase RPC | Dual-source precipitation tracking (Radar + DB) |
| Utilities | `@/utils/dates`, `@/utils/numbers`, `@/utils/text` | Pure formatting helpers |
| Mappers | `@/lib/mappers` | Entity ↔ DB row transformation |
| Reports | `@/lib/complianceReports` | CSV & PDF export generators (FSA, spray log, etc.) |

---

## 2b. Visual Design System

### Typography Split
- **Inter (sans-serif)** — default `font-sans`: all labels, headings, body text, subtitles, buttons, empty states, descriptions, navigation labels.
- **JetBrains Mono (`font-mono`)** — data values only: numbers (bushels, acreage, percentages, prices), dates, timestamps, GPS coordinates, table cells, form field inputs, FSA/EPA/license numbers, scale ticket numbers, version strings.
- **Brand logo** — `font-mono` + `tracking-tighter` on the AcreLedger text is an intentional identity element.
- Form labels inside modals use `font-mono` — acceptable because they annotate data-entry fields.

### Accessibility (Mandatory Standards)
- **Modal Descriptions**: Every `DialogContent` MUST include a `DialogDescription` (can be `sr-only` for visual cleanliness) to satisfy Radix UI accessibility requirements.
- **Label Association**: Every form input MUST have a unique `id` and `name`. The corresponding `Label` MUST use the `htmlFor` attribute to link to that ID.
- **Touch Targets**: Buttons and interactive elements follow a 44px minimum height standard for mobile usability.

### Text Case & Tracking
- **Default**: sentence-case ("Farm overview", "No fields detected").
- **Avoid**: `uppercase` + `tracking-widest` on labels, buttons, or body text — fatiguing on mobile.
- **Acceptable uppercase**: tiny badge pills, table column headers (report context only), legal/regulatory footers.

### Dark Mode Palette
Dark mode uses near-black with a subtle blue undertone — never pure `#000000`. This provides better surface hierarchy and reduces eye strain:
```
--background:  240 6% 4%    (not 0 0% 0%)
--card:         240 5% 8%
--popover:      240 5% 9%
--muted:        240 5% 15%
--border:       240 4% 16%
--sidebar-bg:   240 6% 3%
```

### Border Radius Standard
One consistent radius per element type — no mixing on the same page:
| Element | Radius |
|---|---|
| Inline items, badges, small buttons | `rounded-lg` |
| Cards, sections, containers | `rounded-2xl` |
| Pills, avatar circles | `rounded-full` |
| Progress bars | `rounded-full` |

### Page Header Pattern
Every page follows the same sticky header structure:
```
<header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
  <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between lg:max-w-5xl lg:px-8">
    [icon + title + subtitle]  ...  [action button]
  </div>
</header>
```

### Field Card Status Dots
Field cards display a colored dot in the top-right corner:
- 🟢 Green (`bg-plant`): field has a planting record
- 🔵 Blue (`bg-spray`): field has activity but no planting record
- ⚪ Gray (`bg-muted-foreground/30`): no activity this season

### Bin Capacity Bar Colors
Bin fill bars change color by percentage:
- `bg-harvest` (gold): ≤ 60%
- `bg-amber-500`: > 60%
- `bg-destructive` (red): > 85%

### Bottom Navigation
- Active tab: `text-primary`, bold label, `strokeWidth={2.5}`, animated pill background via `layoutId="bottom-nav-pill"`, and a small dot indicator below the label.
- Inactive tab: `text-muted-foreground`, normal weight, `strokeWidth={1.5}`.
- Bar uses `bg-card/90 backdrop-blur-lg`.

### Auth Screen
Dark background matching the app's default theme. Uses a `Sprout` icon hero with the AcreLedger brand name and tagline. The auth card is `rounded-2xl` with `bg-card border border-border`. Inputs use `bg-background` to stand out from the card surface.

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

### SprayRecord (2026 Standards)
Pesticide/herbicide application. Refactored for universal private-applicator compliance (45+ states).
Supports multiple products per application (tank-mix) and advanced environmental tracking.
```ts
{ id, farm_id, fieldId, fieldName, sprayDate, startTime, endTime, timestamp, seasonYear,
  products: { product, epaRegNumber, activeIngredients, rate, rateUnit, totalProductAmount, totalProductUnit }[],
  treatedAreaSize, treatedAreaUnit, totalAmountApplied,
  windSpeed, windDirection, temperature, relativeHumidity,
  targetPest, applicatorName, licenseNumber, equipmentId,
  siteAddress, involvedTechnicians, mixtureRate, totalMixtureVolume,
  rei, notes, complianceProfile: 'universal', isPremixed, nonCompliant, 
  nozzleType, nozzleSize, pressurePsi, boomHeight, actualSpeed, 
  windSpeedEnd, windDirectionEnd, tempEnd, sensitiveAreaCheck, sensitiveAreaNotes,
  deleted_at }
```
- **End Time Estimation**: Application duration is auto-calculated at a default rate of **60.6 acres/hour** (representing a 100' wide sprayer at 5 mph) with manual override.
- **Total Product Auto-summing**: The system automatically calculates and persists `totalProductAmount` and `totalProductUnit` for **all** products in the tank mix based on their application rate and the field's treated acreage.
- **Wind Alert**: `WIND_ALERT_MPH = 10` (named constant).
- **Non-Compliant Flag**: Triggered if any product is missing an `epaRegNumber`.
- **Active Ingredients**: Documented per-product for compliance; populated automatically from recipes.
- **Universal Standard**: Replaced Missouri-specific labeling with state-neutral agricultural terminology.
- **Weather Recovery**: "Recover Past Weather" feature pulls historical conditions from Visual Crossing based on field location and start time.

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

### TillageRecord
Track tillage events (Disk, Cultivation, etc.) per field per season.
```ts
{ id, farm_id, fieldId, fieldName, date, implementType, notes,
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

#### The "Ghost Row" Prevention Rule
To prevent inventory drift if two sessions edit the same bin simultaneously, all Grain Movement edits must include a **Concurrency Guard**:
- Use a `Last-Modified` or `version` stamp check in the `WHERE` clause of the update.
- If the count of updated rows is 0, notify the user that the record has been modified by another session and trigger a state refresh.

### SavedSeed
Seed inventory reference. Not season-scoped.
```ts
{ id, farm_id, crop, variety, supplier, lotNumber, year, notes, deleted_at }
```

### SprayRecipe
Saved tank-mix recipe for reuse on spray records. Not season-scoped.
```ts
{ id, farm_id, name, products: { product, epaRegNumber, activeIngredients, rate, rateUnit }[],
  applicatorName, licenseNumber, targetPest, deleted_at }
```

#### Tank-Mix Product Identity
For the `products` array in SprayRecords, generate a temporary `ui_id` (e.g., `crypto.randomUUID()`) when adding a row in the modal. Use this for React key props instead of array index to prevent input focus loss during reorders.

### FertilizerRecipe
Saved fertilizer formulas for reuse on fertilizer application records.
```ts
{ id, farm_id, name, npkRatio, deleted_at }
```
- **Management**: Users can create, edit, and delete fertilizer recipes directly in the **Settings** page or save a new formula as a recipe while recording an application.
- **Usage**: Saved recipes appear as a dropdown in the Fertilizer Modal for quick data entry.

### Rainfall
High-resolution precipitation tracking using the **Rain API** (IEM Stage IV radar + field-based historical lookups).
The system uses a **Dual-Source Lookup** strategy to ensure data reliability and range coverage.

#### Rain API Core Logic
- **Primary Source (Radar + DB merge)**: Rain API returns fixed windows (`rain.24h`, `rain.72h`, `rain.168h`) via `GET /rain?lat=X&lon=Y&field_id=Z`. The API merges IEM Stage IV (CONUS radar) with Supabase RPC server-side, taking the MAX of both sources per window.
- **Custom Ranges**: Since-planting and since-spray rainfall are fetched via Rain API `GET /rain?lat=X&lon=Y&field_id=Z&start_date=A&end_date=B`. Returns `{ rain: { total: number }, rainMm: { total: number } }`. Including coordinates ensures the hybrid IEM radar merge is active for historical periods.
- **Coordinate Precision**: Lat/Lng are rounded to **4 decimal places** for consistent matching with the 4km radar grid.
- **Centroid Logic**: Polygon boundaries automatically fall back to centroids if explicit field coordinates are null or invalid.

#### Service Reliability
- **Service Cache**: `RainService` implements a 30-second `promiseCache` to deduplicate concurrent requests (e.g., when switching between tabs or fields rapidly).
- **Data Warning**: The API includes `dataWarning` when >10% of hourly data is missing or when Supabase merge adds rain beyond IEM. Passed through to UI.
- **API Fallback**: Custom range calls return `0` gracefully on failure to prevent UI crashes.

### Weather Page (`/weather`)
Full-page weather dashboard accessible by tapping the WeatherBar on the Index page. Provides agricultural weather intelligence beyond the summary bar.

#### Route & Navigation
- **Path**: `/weather` — registered in `App.tsx` alongside other page routes.
- **Entry**: WeatherBar (Index page) is wrapped as a clickable element with `useNavigate('/weather')`. The zip-code form inside uses `stopPropagation` so editing still works.
- **Location sharing**: Reads from the same `localStorage` key (`${userId}_al_zip`) as WeatherBar. Uses saved coordinate strings or first field coordinates before requesting browser GPS; saved zip codes are used directly for weather without prompting for GPS.

#### Data Flow
- `WeatherService.fetchExtendedWeather(location)` — single Visual Crossing call requesting `last7days?forecastDays=10` with elements: `temp`, `feelslike`, `humidity`, `dew`, `windspeed`, `windgusts`, `winddir`, `precip`, `precipprob`, `cloudcover`. Returns current conditions, 7-day rainfall history, and 10-day forecast.
- Auto-refreshes every 5 minutes (matches WeatherBar polling interval).
- Uses its own `extendedCache` promise cache, separate from the WeatherBar's `promiseCache`.

#### Weather Types (`@/types/weather.ts`)
- **`ForecastDay`**: `{ date, tempHighF, tempLowF, rainChance, precipIn }` — one row in the 10-day forecast.
- **`ExtendedWeatherData`**: Current conditions plus forecast array, rainfall history (24h/72h/168h), `latitude`/`longitude` (from Visual Crossing for radar positioning), `isRainingNow`, `gusts`, `dewPoint`, `feelsLike`.

#### Weather Components (`@/components/weather/`)
- **`RadarEmbed`**: Windy.com radar iframe with fullscreen expand via `createPortal` to document body. Includes loading spinner (15s timeout), error fallback, body scroll lock when expanded, and a single AcreLedger close bar above the interactive map.
- **CSP requirement**: Windy radar embeds require `https://www.windy.com` in both `child-src` and `frame-src` in `index.html`. Without this, the browser blocks the iframe even though the React component renders correctly.
- **`ForecastGrid`**: 2×5 grid of `ForecastDay` cells with weather emojis, rain-chance progress bars, high/low temps. Today cell highlighted with blue border.

#### Future Expansion (Planned)
Additional agricultural decision-support cards are planned, ported from FarmCMD's feature set:
- **Spray Decision** (GO/WAIT) — wind, delta-T, inversion risk, humidity thresholds
- **Field Workability** — composite score (0–100) factoring soil temp, rainfall, wind, forecast
- **Frost & Freeze** — 3-night outlook with advisory/warning thresholds
- **Rain Window** — dry stretch analysis with soil saturation estimate
- **Atmosphere** — humidity, dew point, sunrise/sunset, daylight hours

All calculators will be pure functions in `@/lib/` (no config dependency) using named constants for thresholds.

---

## 4. State Management Rules

### farmStore (React Context)
Single global store in `farmStore.tsx`. Exposes all entity arrays, their setters, `session`,
`farm_id`, `farmName`, `activeSeason`, `viewingSeason`, and all CRUD action methods. Accessed everywhere
via `useFarm()`.

### Optimistic Update Pattern
Every mutation follows this exact sequence — no exceptions:
1. Guard: `if (!farm_id) → toast.error('No farm selected.'), return false`
2. Validate inputs → return false on invalid
3. Call mapper (`mapXToDb`) — **BEFORE** touching state. Ensuring all optional fields default to **`null`** (not `undefined`).
   → mapper throws: toast.error, return false, do NOT touch state or DB
4. Apply optimistic state update via functional setter
5. Await Supabase operation
6a. Success: toast.success, return true
6b. Error: roll back state to pre-step-4 snapshot, toast.error (with detailed Postgres message), return false

### OpResult Convention
All add / update / delete operations on every hook return `Promise<boolean>`:
- `true` = record committed to DB
- `false` = blocked (validation, no farm) or rolled back (DB error)
- **Never returns `undefined`.** Callers (e.g. modals deciding whether to close) rely on this.

### farm_id Scoping
Every Supabase write is scoped to `farm_id`. The null guard is always the **first line** of
every mutation function — before validation, mapping, or any state change.

### Backup / Restore Farm Ownership
Backup files may contain stale, missing, or foreign `farm_id` values because users can restore
older exports or pre-fix local cache data. Restore must always treat the currently selected
`farm_id` as authoritative:
- Before calling any `mapXToDb` mapper in `restoreFromBackup`, merge `{ ...record, farm_id }`
  into every restored record.
- The Supabase `restore_farm_backup` RPC payload and the React state hydrated after a successful
  restore must use the same current `farm_id`.
- Never hydrate React state directly from raw backup arrays after a restore. Normalize records
  first so localStorage, in-memory state, and Supabase stay aligned.
- Restore must fail without mutating state if the RPC returns an error.

---

## 5. Database Conventions

### Migration Strategy (Mandatory)
- **Unique Timestamps**: Every migration filename MUST start with a unique **14-digit timestamp** (`YYYYMMDDHHMMSS_name.sql`). This prevents collisions in the Supabase CLI.
- **Example**: `20260514100000_fix_security.sql`.

### Data API Access (Mandatory)
Starting May 2026, Supabase requires explicit `GRANT` statements for all tables exposed via the Data API (`supabase-js`). Every new table creation migration MUST include:
```sql
-- Grant access to standard roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
GRANT SELECT ON public.your_table TO anon;
GRANT ALL ON public.your_table TO service_role;

-- Always pair with RLS
ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;
```

### Tenant Isolation (RLS)
Every table MUST have Row Level Security (RLS) enabled with a policy that restricts access to the user's `farm_id`.
```sql
CREATE POLICY "Users can access their farm data" ON public.your_table
  FOR ALL TO authenticated
  USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
```

### Mapper Pattern
Every entity has a dedicated mapper in `@/lib/mappers.ts`.
- **CamelCase to SnakeCase**: Mappers handle all translation.
- **Payload Sanitization**: Mappers MUST ensure optional fields are sent as `null` to the DB to prevent serialization issues.
- **Safety**: Use `safeNum` and `safeStr` helpers to prevent type errors.
- **Identity Preservation**: Mappers for user-managed reference data, including `saved_seeds`, MUST preserve `id`, `farm_id`, and `deleted_at` so optimistic local IDs, backup restores, and persisted DB rows remain aligned.

### farm_id Rule
`farm_id` is a relational partition key. Inserts and restore payloads MUST include the current
`farm_id`. Update operations MUST use `farm_id` only in `.eq('farm_id', farm_id)` filter clauses;
strip `farm_id` out of `.update()` payloads after mapping. Service-layer update helpers should
inject the authoritative current `farmId` before mapper validation, then omit it from the update
payload.

### Soft Delete
`.update({ deleted_at: new Date().toISOString() }).in('id', ids).eq('farm_id', farm_id)`
Never use Supabase `.delete()` on user records.

---

## 6. Component Patterns

### Icon Shadowing Prevention (Critical)
**NEVER** import a Lucide icon with a name that conflicts with a global browser object (e.g., `Map`, `History`).
- **Always alias**: `import { Map as MapIcon, History as HistoryIcon } from 'lucide-react'`.
- This prevents `TypeError: Illegal constructor` errors in production bundles.

### useMemo Rules
Wrap in `useMemo` any value derived from large arrays. Do **not** compute these inline in JSX.

### fieldMap Pattern
Never call `fields.find(f => f.id === r.fieldId)` per row inside a `.map()`. Build once via `useMemo` with `new Map()`.

### Module-Level Pure Helpers
Functions that don't depend on component state or props belong **outside** the component at
module level.

### Universal Spray Log Export
The `generateSprayPDF` utility (`@/lib/sprayExport.ts`) provides a production-grade, state-neutral
PDF export for spray records. It handles both single-record and multi-record exports.

### Field Dashboard (Mobile-First)
The `FieldDetailScreen` follows a "Daily Status Board" pattern. It prioritizes real-time
signals over static data.

### FieldNotes Component (Auto-Save)
Persistent scratchpad for field-specific notes. Uses a **2000ms debounce** on the `onChange`
event to automatically sync content to Supabase.

### PWA & Bundling
- **Vite Configuration**: `manualChunks` should be avoided for UI libraries (Lucide, Radix, Framer Motion) to prevent initialization order artifacts. Use Vite's default strategy for these.
- **Service Worker**: `sw.js` handles navigation routing to `index.html`.

---

## 11. Error Handling Standards

### Detailed Error Logging
`useXRecords` hooks MUST log the full error object from Supabase (Message, Details, Hint) to the console to assist in remote debugging.

### Content Security Policy (CSP)
The `index.html` MUST include a meta CSP tag that allows `unsafe-eval` (required by UI libraries and PWA tools) while restricting origins to `self`, Supabase, Visual Crossing, Vercel, and Windy.com.
Windy.com must be allowed through both `child-src` and `frame-src` because the weather radar is an external iframe.

---

## 12. Coding Rules & Conventions

- **Icon Shadowing**: Use `MapIcon`, `HistoryIcon` aliasing.
- **No `upsert` for updates**: Use `.update().eq('id').eq('farm_id')`.
- **Radix Modals**: Always include `DialogDescription`.
- **Form Inputs**: Always include `id`, `name`, and linked `Label`.
- **Data Safety**: Optional fields default to `null` in mappers.
- **Zero vs Falsy**: `0` is a valid farm value. Use `value != null ? value : '—'`.

### Verification
See [TESTING.md](./TESTING.md) for detailed verification protocols and bot credentials.
