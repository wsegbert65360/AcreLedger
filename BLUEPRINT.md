# BLUEPRINT.md — AcreLedger

> **Purpose:** Single authoritative reference for AcreLedger's architecture, patterns, and rules.
> Read this file before making any change or addition. A capable AI agent must be able to
> reconstruct a functionally equivalent application from this document alone.

---

### External Resources
- **Testing & Credentials**: [TESTING.md](./TESTING.md)
- **Owner Disaster Recovery Plan**: [docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md](./docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md) — implemented tooling; deployment and live drills pending
- **iOS Release Runbook**: [IOS_RELEASE.md](./IOS_RELEASE.md)

---

## 1. Application Overview

AcreLedger is a mobile-first, PWA-ready agricultural record-keeping and compliance reporting
application for row-crop farmers and licensed commercial applicators. It solves the problem of
tracking complex, multi-year farm operations — planting, spraying, fertilizing, harvesting, and
grain movement — while generating strict regulatory compliance logs including FSA 578 Acreage
Reports and MDA/state private applicator audit trails. Data is stored per-farm in Supabase with
optimistic UI, offline-capable client-side backup/restore, and printable FSA-compliant reports.
The target user is an individual farmer or small operation, not an enterprise.

The repository includes owner disaster-recovery tooling for a
nightly encrypted whole-project archive in the project owner's personal Google Drive, with full
database/Auth/Storage recovery and an isolated, tenant-aware single-farm extraction workflow.
This operational archive is separate from the signed-in farmer's Settings JSON backup. It must not
be described as operationally proven until deployment verification and both recovery drills pass.

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
| Weather | Visual Crossing API via authenticated Vercel Function | Current conditions, extended data (gusts, dew point, feels-like), 10-day forecast |
| Rainfall | IEM Stage IV + Supabase RPC | Dual-source precipitation tracking (Radar + DB) |
| Utilities | `@/utils/dates`, `@/utils/numbers`, `@/utils/text` | Pure formatting helpers |
| Mappers | `@/lib/mappers` | Entity ↔ DB row transformation |
| Reports | `@/lib/complianceReports` | CSV & PDF export generators (FSA, spray log, etc.) |
| Native security | Capacitor secure storage + iOS Keychain | Credential/encryption-material storage on native devices |
| Billing | Stripe test mode + Vercel Functions | Web-only Checkout/Portal and signed webhook entitlement mirror; live charges disabled |
| Owner DR tooling | Cloud Run Job + Cloud Scheduler + Google Drive + age | Nightly encrypted whole-project off-site backup and isolated recovery; deployment/drills pending |

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

### Color Mode Palette
Color mode (`html.color`) is a bright rainbow/neon theme, not a dark variant and not a pink theme. Do not apply `.dark` when it is active.
```
--background:  48 55% 96%
--foreground:  222 47% 11%
--primary:     142 90% 34%
--secondary:   188 100% 36%
--accent:      38 100% 46%
--plant:       142 100% 36%
--spray:       210 100% 44%
--harvest:     32 100% 48%
--hue-lime / cyan / sky / violet / gold / orange
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

### Field Card Status Pills
Field cards render a **high-contrast inline labeled pill** next to the field name — not an absolute-positioned corner dot (the old dot pattern was retired because it overlapped thumbnails and failed contrast). The pill maps the field's seasonal activity summary to a label and theme color via `ACTIVITY_TEXT_COLORS`:
- **Planted** (`bg-plant/10 text-plant border-plant/20`): field has a planting record.
- **Activity logged** (`bg-spray/10 text-spray border-spray/20`): field has spray/fertilizer activity but no planting record.
- **No activity** (`bg-muted text-muted-foreground border-border`): no activity this season.

To the right of the card, seasonal activity icons show count-badged sprays (`x<count>`) plus plant/fertilizer markers, colored through the centralized `activityIcons` maps rather than inline classes.

### Bin Capacity Bar Colors
Bin fill bars change color by percentage:
- `bg-harvest` (gold): ≤ 60%
- `bg-amber-500`: > 60%
- `bg-destructive` (red): > 85%

### Bottom Navigation
- Active tab: `text-primary`, bold label, `strokeWidth={2.5}`, an absolute-positioned `bg-primary/10 border-primary/20` pill behind the icon (`-z-10`, `animate-in fade-in`), and a small dot indicator below the label.
- Inactive tab: `text-muted-foreground`, normal weight, `strokeWidth={1.5}`.
- Bar uses `bg-card/90 backdrop-blur-lg`. The activity and reports tabs carry stable coachmark `id`s (`coachmark-activity-tab`, `coachmark-reports-tab`).

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
{ id, name, acreage, boundaryAcreage?, lat, lng, intendedUse, fsaFarmNumber, fsaTractNumber,
  fsaFieldNumber, producerShare, landlordName, irrigationPractice, cluNumbers,
  notes, deleted_at, boundary: { type, coordinates } }
```
`acreage` is the field's stored acreage. When CLU assignments exist, display/report code derives the FSA cropland total via `getDisplayFieldAcres` rather than reading this directly.
`boundaryAcreage` (optional, stored in the legacy `fields.operational_acreage` column) is the stable boundary/manual measurement, never overwritten by CLU assignment sync. `getBoundaryFieldAcres` resolves it from this value, else the `boundary` geometry, else (only when no CLU assignments exist) `acreage`. `getDisplayFieldAcres` prefers cropland CLU sum, then boundary, then `acreage` as the final fallback. Unknown boundary acreage is omitted from ordinary updates rather than written as zero; legacy backup restore preserves the existing database value before considering geometry or an unassigned raw-acreage fallback.
`notes` is a TEXT field used for informal scratchpad entries, persisted with auto-save.
`lat`/`lng` may be null if geocoding was skipped — always guard before calling `.toFixed()`.
`boundary` is a GeoJSON Polygon for field geometry.
`producerShare` (0–100%) is the farmer/producer's own share; the harvest modal uses it to pre-suggest the landlord split as `100 - producerShare`.
`landlordName` is the field-level owner/landlord used by the Landlord Summary report; new harvest records prefill it from the field.

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
  producerShare, fsaFarmNumber, fsaTractNumber, fsaFieldNumber,
  cropStatus, cropSequence, plantingPattern, deleted_at }
```
`cropStatus` supports `Planted`, `Prevented Planting`, `Failed`, `Volunteer`, and
`Cover Crop`. `cropSequence` distinguishes first and second crop. `plantingPattern`
stores optional FSA practice/pattern notes.
- **Acreage default**: `PlantModal`'s "Planted Acres" new-record default and its edit/duplicate fallback use `getDisplayFieldAcres(field, cluAssignments)` — the FSA crop acreage — never a raw `field.acreage` read, mirroring the spray treated-area default below. An edited-ref + CLU-hydration refresh effect preserves manual edits and stored values on edit/duplicate. Historical records were backfilled by migration `20260715130000_backfill_plant_acreage_to_fsa_acreage.sql`. Note the FSA-578 worksheet derives its acreage column from CLU assignments (`buildFsa578Rows`), not this stored `acreage`, so the stored value reconciles on-screen/record totals with what reports already show.

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
- **Treated Area Default**: the "Treated Area Size" pre-fill and every report/export fallback (`useSprayForm`, `Reports.tsx` spray rows, `generateMissouriLog`, `sprayExport.ts`) resolve to the FSA crop acreage shown on the field, never a raw `field.acreage` read. Read-time resolution goes through the shared `getEffectiveSprayTreatedAcres(record, field, cluAssignments)` helper: stored `treatedAreaSize` when present and positive, else `getDisplayFieldAcres(field, cluAssignments)` (CLU cropland wins, then boundary, then `field.acreage`). Current form edits preserve an explicitly stored `treatedAreaSize` (e.g. a partial-field spot-spray). The one-time migration `20260713120000_backfill_spray_treated_area_to_fsa_acreage.sql` intentionally normalized every active historical treated-area value because legacy automatic defaults could not be distinguished from manual entries. It changes only `treated_area_size` and leaves products, stored totals, weather, wind, temperature, humidity, application times, and notes untouched. Report/export product totals are calculated at read time from rate and normalized acreage when possible, without mutating stored records.
- **Total Product Auto-summing**: The system automatically calculates and persists `totalProductAmount` and `totalProductUnit` for **all** products in the tank mix based on their application rate and the field's treated acreage.
- **Wind Alert**: `WIND_ALERT_MPH = 10` (named constant).
- **Non-Compliant / Review Status**: Triggered if any product is missing an `epaRegNumber` or lacks a positive application rate and rate unit. Legacy records derive this review status in the UI without a database rewrite. Per-product totals are canonical and are recalculated synchronously from rate × treated acres before saving; the top-level `totalAmountApplied` remains only a legacy first-product numeric compatibility value and must never sum unlike units.
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
`landlordSplitPercent` is the landlord's crop-share % for this load (pre-suggested from the field's `producerShare` as `100 - producerShare`). `landlordName` here is a harvest-time override of the field-level `Field.landlordName`; new harvests prefill it from the field but the value is editable per record.

### HayHarvestRecord
Hay cutting event. Tracked by cutting number per field per season.
```ts
{ id, farm_id, fieldId, fieldName, baleCount, baleType, cuttingNumber,
  timestamp, seasonYear, deleted_at }
```

### CustomSprayRecord
Lightweight log of a spray application performed by an **outside applicator** (co-op / custom
sprayer). Modeled on the hay record — NOT a compliance `SprayRecord` — so the universal spray-log
PDF and the non-compliant review queue stay driven by full `SprayRecord`s. Reached from the Spray
button via `SprayTypeChooser`, not a top-level activity button.
```ts
{ id, farm_id, fieldId, fieldName, date, applicationTime, applicator, recipe?,
  windSpeed?, windDirection?, temperature?, notes?,
  seasonYear, timestamp, deleted_at }
```
- **Required**: `applicator`, `date`, and `applicationTime` (`HH:mm`, local application time).
- **Optional**: `recipe` (free text), weather (`windSpeed`/`windDirection`/`temperature`), and
  `notes`. Weather remains manually editable, but the user can explicitly tap **Pull historical
  weather** after selecting the application date/time. `CustomSprayModal` calls
  `WeatherService.fetchHistoricalConditions` with the field coordinates and does not auto-fetch or
  overwrite manual values when the lookup fails or returns no data.
- **`customSpray`** is a member of `ActivityType` and the `ActivityRecord` union (reuses the spray
  icon/colors). Records render in the Spray tab via `CustomSprayTab` (under the regular `SprayTab`)
  and in All / field history, but are excluded from `sprayExport.ts` and the non-compliant review
  queue.
- **Persistence**: `custom_spray_records` table, CRUD via `useCustomSprayRecords.ts` following the
  same farm-scope, season-stamp, soft-delete, and optimistic-update rules as the other activity
  hooks. In the sync queue `ALLOWED_TABLES` set and in the backup/restore payload +
  `restore_farm_backup` RPC. Mappers: `mapCustomSprayFromDb` / `mapCustomSprayToDb`.

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
- **Acres default**: `FertilizerModal`'s "Acres Applied" new-record default uses `getDisplayFieldAcres(field, cluAssignments)` — the FSA crop acreage — never a raw `field.acreage` read, mirroring the spray treated-area and plant acreage defaults. An edited-ref + CLU-hydration refresh effect preserves manual edits and stored values on edit/duplicate. Historical records were backfilled by migration `20260715120000_backfill_fertilizer_acres_to_fsa_acreage.sql`.

### GrainMovement
Grain in/out of a bin, including sales and contracts.
```ts
{ id, farm_id, binId, binName, type: 'in' | 'out', bushels, moisturePercent,
  price?, destination?, sourceFieldName?, harvestRecordId?, timestamp, seasonYear,
  version, deleted_at }
```
**`bushels` may be negative.** Negative values represent an estimate-vs-actual correction
(more grain removed than estimated). This is intentional business logic — do not block or clamp.
Display with an amber `AlertTriangle` warning only.

#### The "Ghost Row" Prevention Rule
To prevent inventory drift if two sessions edit the same bin simultaneously, all Grain Movement edits must include a **Concurrency Guard**:
- `grain_movements.version` is database-managed and increments on every update. Capture the expected version from the render closure and include it in online and replayed update/delete predicates; never use the activity timestamp as the concurrency token.
- If the count of updated rows is 0, reconcile an already-applied operation, otherwise retain the mutation and notify the user that the record has changed.
- Reconciliation compares strictly validated ISO timestamp strings by their parsed instant, so PostgreSQL `+00:00` serialization matches an equivalent queued `.000Z` value. Other payload values retain recursive exact comparison.

#### Linked Harvest Lifecycle
A bin-destination harvest and its incoming grain movement form one logical operation. Online creation uses `create_harvest_with_grain` with retry-stable IDs. Offline creation stores one harvest queue envelope containing the mapped grain payload; replay sends that envelope, and legacy two-row pairs, through the same atomic RPC. Harvest soft deletion uses `soft_delete_harvests_with_grain`, and a database trigger cascades the same `deleted_at` value to the linked active movement so generic offline replay cannot leave inventory behind. Client optimistic updates and rollback always cover both records.

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

### FsaTractImport
Imported FSA tract/CLU boundary data owned by a farm and stored canonically as GeoJSON. Not season-scoped.
```ts
{ id, farmId, tractKey, filename, featureCount, geojson, importedAt, deletedAt }
```
- **DB table**: `fsa_tract_imports` stores `farm_id`, `tract_key`, `filename`, `feature_count`, `geojson`, `imported_at`, and `deleted_at`.
- **Conflict key**: One active/restoreable import per farm/tract key. Inserts and backup restore replays use upsert conflict `farm_id,tract_key` so a re-import restores a soft-deleted tract instead of violating the unique constraint.
- **Mappers**: Use `mapFsaTractFromDb` and `mapFsaTractToDb` from `@/lib/mappers.ts`.
- **Input formats**: `parseCluFile` is the shared entry point for GeoJSON (`.json`/`.geojson`)
  and ESRI shapefile ZIP (`.zip`). ZIP conversion runs locally through `shpjs`; a complete
  shapefile needs usable geometry/DBF attributes and identifiable projection information.
- **Tract grouping**: A single source file may yield multiple farm/tract collections. Farm and
  tract attributes take priority; a filename such as `4251-9747.zip` is the fallback when the
  features lack those identifiers. Generic unidentified files fail with corrective guidance.
- **Office request workflow**: `FsaRequestSheetDialog.tsx` uses `fsaOfficeRequestSheet.ts` to
  generate a worksheet requesting digital CLU boundaries from FSA. The user guidance links to
  farmers.gov and the service-center locator and states that both GeoJSON and shapefile ZIPs load
  directly. The worksheet is a data request, not an official USDA form.

### FieldCluAssignment
Farm-owned assignment from one CLU inside a tract to one AcreLedger field. Not season-scoped.
```ts
{ id, farmId, fieldId, tractKey, cluNumber, acres,
  landUse: 'cropland' | 'non_cropland', assignedAt, deletedAt }
```
- **DB table**: `field_clu_assignments` stores `farm_id`, `field_id`, `tract_key`, `clu_number`, `acres`, `land_use`, `assigned_at`, and `deleted_at`.
- **Conflict key**: One active/restoreable assignment per farm/tract/CLU. Inserts and backup restore replays use upsert conflict `farm_id,tract_key,clu_number` so reassignment restores soft-deleted rows safely.
- **Mappers**: Use `mapFieldCluAssignmentFromDb` and `mapFieldCluAssignmentToDb` from `@/lib/mappers.ts`.
- **Counts**: Assigned/unassigned totals must compare assignments against the same CLU universe being displayed, and must exclude soft-deleted assignments.
- **Acreage**: Persisted field acreage may be rounded for display/state, but the source CLU feature acres must not be mutated.

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

Weather rainfall fallbacks use completed calendar days in the provider location's timezone (Yesterday / Last 3 days / Last 7 days), excluding today's mixed observation/forecast total. `rainfallBasis` switches labels to rolling hours only after a successful radar lookup. Missing fallback days and failed historical range lookups remain unavailable (`null`), not zero; range failures include `dataWarning`. WeatherBar uses the weather response's resolved coordinates for radar rainfall, never an unrelated first field. Explicit saved ZIP/coordinates take priority over field defaults on the weather page.

### Weather Proxy (`api/weather-proxy.ts`)
Production web and configured Capacitor weather traffic uses an authenticated Vercel Function so the Visual Crossing key never reaches the client. `WeatherService` sends the current Supabase access token; the function validates it with `auth.getUser`, validates the requested timeline endpoint, location, and query allowlist, then safely builds the upstream request. Only `GET` and `OPTIONS` are supported, and the upstream request times out after 10 seconds.

The function requires the server-only Vercel variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VISUALCROSSING_API_KEY`, and `ALLOWED_ORIGINS`. CORS uses exact comma-separated origins and fails closed for requests carrying an unknown origin; deployed web aliases and `capacitor://localhost` must be listed explicitly. Environment changes require a new Vercel deployment.

Per-user quotas are enforced by `consume_weather_proxy_request()` from migration `20260721211903_add_weather_proxy_rate_limit.sql`: 30 calls per authenticated user per fixed one-minute window. The counter table is isolated in the non-exposed `weather_proxy_private` schema. The public wrapper is `SECURITY DEFINER`, has an empty `search_path`, derives the user from `auth.uid()`, and is executable only by `authenticated` and `service_role`. Quota exhaustion returns `429`; database/RPC failure fails closed with `503`.

### Weather Page (`/weather`)
Full-page weather dashboard accessible by tapping the WeatherBar on the Index page. Provides agricultural weather intelligence beyond the summary bar.

#### Route & Navigation
- **Path**: `/weather` — registered in `App.tsx` alongside other page routes.
- **Entry**: WeatherBar (Index page) is wrapped as a clickable element with `useNavigate('/weather')`. The zip-code form inside uses `stopPropagation` so editing still works.
- **Location sharing**: Reads from the same `localStorage` key (`${userId}_al_zip`) as WeatherBar. Uses saved coordinate strings or first field coordinates before requesting browser GPS; saved zip codes are used directly for weather without prompting for GPS.

#### Data Flow
- `WeatherService.fetchExtendedWeather(location)` - single Visual Crossing call requesting `/last7days/next10days` with elements: `datetime`, `tempmax`, `tempmin`, `temp`, `feelslike`, `humidity`, `dew`, `windspeed`, `windgusts`, `winddir`, `precip`, `precipprob`, `cloudcover`. Returns current conditions, 7-day rainfall history, and 10-day forecast.
- Auto-refreshes every 5 minutes (matches WeatherBar polling interval).
- Uses its own `extendedCache` promise cache, separate from the WeatherBar's `promiseCache`.
- Aborts in-flight weather requests on unmount so leaving `/weather` does not update state after navigation.

#### Weather Types (`@/types/weather.ts`)
- **`ForecastDay`**: `{ date, tempHighF, tempLowF, rainChance, precipIn }` — one row in the 10-day forecast.
- **`ExtendedWeatherData`**: Current conditions plus forecast array, rainfall history (24h/72h/168h), `isRainingNow`, `gusts`, `dewPoint`, `feelsLike`. Radar coordinates are resolved separately from saved coordinates, field coordinates, or browser GPS.

#### Weather Components (`@/components/weather/`)
- **`RadarEmbed`**: Windy.com radar iframe with fullscreen expand via `createPortal` to document body. Includes loading spinner (15s timeout), error fallback, body scroll lock when expanded, restoration of the prior body overflow value on close, and a single AcreLedger close bar above the interactive map.
- **CSP requirement**: Windy radar embeds require `https://www.windy.com` in both `child-src` and `frame-src` in `index.html`. Without this, the browser blocks the iframe even though the React component renders correctly.
- **`ForecastGrid`**: 2×5 grid of `ForecastDay` cells with weather emojis, rain-chance progress bars, high/low temps. Today cell highlighted with blue border.
- **`SprayDecisionMatrix`**: Renders a GO / CAUTION / WAIT verdict from `evaluateSprayConditions` in `@/lib/weatherHelpers.ts` using current temp, humidity, wind, wind direction, and precip probability. Rendered on `/weather` alongside the radar and forecast.

#### Future Expansion (Planned)
Additional agricultural decision-support cards are planned, ported from FarmCMD's feature set:
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
4. **Capture the rollback snapshot from the render closure *before* the optimistic setter.** Each hook receives its current entity array as an argument and resolves `previous = collection.find(item => item.id === id)` before calling `setState`. Do not mutate an outer variable inside the state updater to capture the snapshot — that depends on React's eager-update timing and is the pattern the grain hook was refactored away from. See `useGrainMovements` / `useFieldsAndBins` for the reference form.
5. Apply optimistic state update via functional setter
6. Await Supabase operation
7a. Success: toast.success, return true
7b. Error: roll back state to the closure-captured snapshot, toast.error (with detailed Postgres message), return false

Offline bulk/cascade operations use `syncQueue.enqueueMutations`. Web persists the whole batch in one encrypted localStorage update; native uses transactional SQLite `executeSet`. This is required for bulk activity deletes and offline field/tract deletion cascades so local rollback cannot disagree with a partially persisted queue. Field-delete batches place assignments before the field, and the `fields_cascade_soft_delete_to_clu_assignments` trigger makes direct field replay transactionally cascade any remaining assignments. Online field deletion uses the `SECURITY INVOKER` `soft_delete_field_with_clu_assignments` RPC. Sign-out fails closed unless cache cleanup removes the current farm's pending queue before ending the auth session.

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
  into every restored farm entity record.
- FSA tract imports and CLU assignments use camelCase `farmId` in app state, so merge
  `{ ...record, farmId: farm_id }` before calling `mapFsaTractToDb` or
  `mapFieldCluAssignmentToDb`.
- Backup files must preserve CLU setup with `fsaTracts` and `cluAssignments`; the schema also
  accepts the Settings export metadata field `backupDate`. New exports carry `backupVersion`;
  unversioned legacy exports are normalized before strict validation.
- Settings and pre-rollover exports explicitly include every supported collection, including empty
  arrays, and must pass `backupSchema` before the file is downloaded. A schema-validation failure
  stops season rollover before `profiles.active_season` or local season state changes.
- The Supabase `restore_farm_backup` RPC payload must send normalized database rows, including
  `fsa_tract_imports` and `field_clu_assignments`, using the same current `farm_id`.
- Restore SQL must replay `fsa_tract_imports` by `farm_id,tract_key` and
  `field_clu_assignments` by `farm_id,tract_key,clu_number`, while rejecting conflicting row IDs
  that already belong to another farm.
- Generic restore helpers operate one payload row at a time and include only JSON-present
  columns in each insert/update. Missing legacy properties therefore use database defaults on
  new rows and preserve existing values on matching rows instead of becoming `NULL`.
- Known legacy zero acreage is repaired only from matching backup field/CLU/tract data. Negative
  or unrecoverable acreage remains a validation error. Spray recipe crop/site is preserved as
  `cropOrSiteTreated` / `crop_or_site_treated`.
- Never hydrate React state directly from raw backup arrays after a restore. Normalize records
  first so localStorage, in-memory state, and Supabase stay aligned.
- Restore must fail without mutating state if the RPC returns an error.
- Season rollover requires a completed cloud load, no pending sync mutations, and exactly one
  farm-scoped profile update before local active/viewing seasons change.
- Manual rollover advances exactly one year from the active season, up to the allowed
  `currentYear + 1` ceiling. The store rejects no-op and backwards requests before backup creation.
- `profiles.active_season` is constrained in Postgres to `[2000, currentYear + 1]`, and the
  `restore_farm_backup` RPC validates the same range before replaying any entity rows.
- Active-season changes propagate across devices through a user-filtered Supabase Realtime
  subscription on `profiles`; focus, visibility, and online refreshes recover after socket suspension.
  A device viewing the previous active season advances to the new active season; an intentionally
  different historical selection is preserved when valid and otherwise clamped.

### Owner Whole-Project Disaster Recovery (Implemented Tooling; Deployment/Drills Pending)

The customer-facing JSON backup above is a portable active-record snapshot for one signed-in farm.
It is not the system disaster-recovery archive. The authoritative implementation plan is
`docs/plans/2026-09-10-owner-disaster-recovery-google-drive.md`; operational procedures live in
`docs/runbooks/full-project-recovery.md` and `docs/runbooks/single-farm-recovery.md`.

Implemented design:

- One owner-controlled personal Google Drive connection, not one connection per farm.
- A containerized Google Cloud Run Job runs nightly at 02:00 `America/Chicago` through Cloud
  Scheduler. Retention is 30 successful daily archives plus 12 successful monthly archives.
- The package covers roles, schema, all application and private data (including soft-deleted
  rows), Supabase Auth, Storage metadata, actual Storage object bytes, and a non-secret project
  configuration inventory. Database backups alone do not contain Storage object bytes.
- Current spray image attachments live as base64 tokens in database rows and must remain intact in
  the owner archive; AI-boundary data minimization does not apply to disaster recovery.
- The complete package is checksummed, compressed, and public-key encrypted before Drive upload.
  Runtime credentials stay in Google Secret Manager; the worker receives only the encryption
  public key, while the owner keeps the private recovery key offline in two locations.
- A run succeeds only after dump, Storage export, manifest/checksum generation, encryption, Drive
  upload, and remote size/integrity verification. Monitoring must alert on a failed run, revoked
  Drive authorization, or the absence of a verified archive for 30 hours.
- Drive retention runs only after the current archive is verified. It may delete expired verified
  app-created archives and fully identified same-folder encrypted archives left unverified by an
  interrupted worker. It must never delete unrelated or merely malformed files or the last
  known-good archive.

Single-farm recovery is deliberately indirect. Restore the whole encrypted archive into a
temporary isolated Supabase project, disable Cron/webhooks/email/`pg_net` and other outbound side
effects, verify the source manifest, and then extract exactly one `farm_id` through a checked-in
tenant ownership registry. The registry classifies direct `farm_id` tables, user-owned rows,
indirect relationships, global infrastructure, and derived data; an `information_schema` test must
fail when a new farm-owned table is unclassified.

Storage ownership remains deliberately fail-closed during selective recovery. The current extractor
attributes no object automatically and places every Storage key from the restored project—including
other farms' keys—into `manualReview`. An operator may copy only a key that can be tied to the selected
farm with certainty.

The owner recovery CLI must dry-run first, create a fresh verified pre-recovery backup, reject
cross-farm rows/ID collisions, and scope all production writes to the selected farm and exact user
IDs. Default merge mode inserts missing data and reports conflicts. Snapshot mode may upsert the
selected snapshot and soft-delete target-farm rows absent from it, but it never hard-deletes farm
records or changes another farm. Existing Auth users are preserved; selectively deleted users are
recreated through `scripts/recovery/recreate-auth-user.ts`, which invites through the Auth Admin API,
accepts only an empty trigger-created farm for reassignment, atomically remounts a surviving old
profile onto the new Auth ID, compensates a failed attach by deleting the new Auth user, and remaps
only registry-declared user columns in a newly checksummed bundle. They receive fresh sessions rather
than copied historical sessions. Full-project and isolated SQL restores must use
`npm run restore-isolated --prefix scripts/recovery -- --plaintext-dir <verified-decrypted-directory>`;
do not replace it with a hand-written `psql` sequence. `restore-isolated.ts` is authoritative for the
declared order, including `auth-schema.sql`, `storage-schema.sql`, and optional migration schema/data
files. It fails on missing required artifacts, then executes `RECOVERY_SIDE_EFFECT_DISABLE_SQL` after
schema load to unschedule Cron jobs, disable outbound webhook triggers, and remove application
Realtime publications. It verifies they are neutralized before enabling replica mode and loading
data. A complete-project disaster uses
the full Auth restore path.

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
Every table MUST have Row Level Security enabled with a policy that restricts access to the user's `farm_id`.
```sql
CREATE POLICY "Users can access their farm data" ON public.your_table
  FOR ALL TO authenticated
  USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
```
**Soft-delete enforcement:** farm record tables grant `SELECT, INSERT, UPDATE` to `authenticated`
and do not grant `DELETE`, since the app never hard-deletes. Core activity tables rely on the
client `deleted_at IS NULL` filter for reads. Newer tables such as `custom_spray_records` also add
`AND deleted_at IS NULL` at the SELECT-policy level so soft-deleted rows stay unreadable even if a
client query forgets the filter. Restore still works through the authenticated
`restore_farm_backup` `SECURITY DEFINER` wrapper; its internal restore helpers must not be granted
to `anon` or `authenticated`. Match this stricter table pattern for new farm records.

### Profile Membership Protection
`public.profiles` is the farm-membership security boundary used by RLS. Authenticated clients may select only their own profile and directly update only `active_season` and `onboarding_complete`. They must not be granted direct authority to change `id` or `farm_id`, insert a profile, or delete one; trusted farm assignment remains behind the `ensure_user_farm` security-definer flow. Migration `20260720165352_protect_profile_farm_membership.sql` owns these column grants and policies.

The live auth integration suite verifies forbidden operations by asserting PostgreSQL code `42501`. Its probes must be harmless: same-value protected-column updates, duplicate-ID insert attempts, and delete queries with contradictory filters. Successful preference checks also use same-value writes so verification cannot alter the QA account.

### Stripe Billing (Test Mode, Web Only)

Billing is implemented but intentionally restricted to Stripe test mode. The Settings card is
web-only, requires `VITE_BILLING_UI_ENABLED === 'true'`, and remains hidden in Capacitor. Internal
rollout requires a matching client and server allowlist entry; an empty allowlist means billing is
unavailable. `BILLING_LIVE_CHARGES` must remain absent or exactly `false`, and the server accepts
only `sk_test_` keys until the owner explicitly approves a production/legal rollout.

Product access enforcement is off by default. A missing or soft-deleted subscription row is
`unmanaged` and retains full access unless a future owner-approved enforcement path explicitly
passes `enforce: true`; absence of billing data must not accidentally become a production paywall.

The locked product terms are a 122-day trial and a three-day `past_due` grace period.
`farm_subscriptions` is the authoritative local entitlement mirror. Farm members may select their
farm's active row, but only service-role server paths write it. The checkout and portal endpoints
authenticate the caller's Supabase bearer token, resolve the authoritative profile/farm, apply the
subscription-owner gate, and accept only HTTPS Stripe URLs. Checkout uses a state-derived
idempotency key.

`api/stripe-webhook.ts` verifies the Stripe raw-body signature, claims `billing_webhook_events` as
an idempotency ledger, fetches complete subscription state when needed, ignores stale replacement
subscriptions, and mirrors handled events into `farm_subscriptions`. `billing_webhook_events` has
RLS enabled with no client policies or grants. Billing infrastructure is excluded from the
customer JSON backup/`restore_farm_backup`, but included and classified in owner disaster recovery.

### Account Lifecycle and Native Credential Safety

Account deletion is request-based. `AccountManager` requires the exact `DELETE` confirmation,
refuses while the selected farm has pending offline mutations, inserts a pending
`account_deletion_requests` row, treats the per-user unique conflict as already pending, and signs
out after success. Authenticated clients may only select their own request and insert a constrained
pending request for the farm resolved by their profile. Completion/cancellation remains an
operator/service-role action; the client never directly deletes Auth or farm data.

`src/lib/secureStorage.ts` centralizes credentials and encryption material. Native builds use the
secure-storage plugin backed by iOS Keychain/Android Keystore, migrate legacy Capacitor Preferences
values on first read, and remove the Preferences copy after a successful secure write. Browser
builds continue to use Preferences because they have no OS keychain surface.

Password recovery uses `src/lib/authDeepLinks.ts`. Web callbacks use `/auth?mode=recovery`; native
callbacks must match the exact `com.wsegbert.acreledger://auth/recovery` scheme/host/path. The native
listener handles an authorization code or the legacy access/refresh-token fragment, establishes the
Supabase session, deduplicates repeated launch/open events, and only then opens the reset UI. Keep
the Supabase redirect allowlist, `Info.plist` URL registration, app listener, and tests synchronized.

### Ask the Book Read Registry
`server/ai-assistant-tools.ts` is the only database read catalog exposed to the AI assistant. It uses the authenticated caller's JWT and publishable/anon key, keeps RLS as the primary tenant boundary, and adds the authoritative current `farm_id` to every direct or joined query. It must never use a service-role/secret key, raw SQL, caller-provided table names, or mutation methods.

The registry covers all active user-facing farm records across every season: farm/profile context, fields, bins, planting, spray/custom spray, fertilizer, tillage, harvest, hay, grain movements, saved seeds, spray/fertilizer recipes, FSA tracts, CLU assignments, work requests, and stored rainfall. Soft-deleted records, other farms, `auth`, and private operational schemas are excluded. Binary image payloads and raw geometry coordinate arrays are summarized before model exposure; the rest of each permitted record remains readable.

Whenever a new user-facing farm table is added, update the assistant registry and its catalog-isolation test in the same change, or document why the table is intentionally excluded. Generic query filters, aggregate fields, and grouping fields remain hardcoded per entity and fail closed when unsupported.

The public tool surface consists of flexible full-farm tools (`farm_overview`, `query_farm_records`, `get_record_details`, `search_farm_records`, `aggregate_farm_records`, and `activity_timeline`) plus optimized helpers for common planting, spray, bin, and seed questions. The flexible tools may read any valid historical season; omitting a season means all seasons where that operation supports it. All arguments are validated again before a Supabase query runs, LIKE wildcards are escaped, and unsupported entities, fields, filters, or unexpected keys fail closed.

The assistant remains read-only at every layer. It has no mutation tool, no restore path, no arbitrary RPC execution, and no client capable of bypassing RLS. `api/ai-assistant.ts` runs a bounded named-tool loop through OpenRouter: at most four tool-capable rounds, eight tool executions, 1,000 rows per database page, ten pages, 12,000 serialized tool-result characters, a 45-second handler abort, and one answer-only synthesis round after tool access ends. These limits prevent open-ended model-driven queries and partial aggregate answers.

Ask the Book uses the database-backed `ai_assistant_private` quota/audit flow. The public wrappers derive identity from `auth.uid()`, use an empty `search_path`, and deny `PUBLIC`/`anon`; private operational data is not part of the farm read catalog or backup/restore. OpenRouter requests must keep `data_collection: "deny"` and `require_parameters: true`, and account-level prompt logging must stay disabled.

Ask the Book defaults to MiniMax M3 Free (`minimax/minimax-m3:free`) and sends OpenRouter's `models` fallback list of `openrouter/free` so one request can continue on OpenRouter Free Tool Call when MiniMax is unavailable or rate-limited. If that response is still unavailable or rate-limited (HTTP 429, 502, 503, or matching error text), the same tool round retries once with `openrouter/free` and no `models` array, without consuming another quota token. `AI_MODEL` overrides the primary model only.

The web client calls the same-origin `/api/ai-assistant` endpoint. Capacitor builds cannot rely on that relative Vercel route and require the public HTTPS deployment base in `VITE_AI_ASSISTANT_URL`; CodeMagic validates that the production bundle contains the configured endpoint. `OPENROUTER_API_KEY` remains server-only and must never appear in a `VITE_*` variable or compiled client asset.

Voice ask-and-answer is on-device/OS speech: `src/lib/speech.ts` adapts the Capacitor community speech-recognition/text-to-speech plugins on iOS and the browser Web Speech API on the web, and `src/hooks/useAskVoice.ts` drives the drawer mic. The phone or browser transcribes speech into text; only that text is sent through the same read-only endpoint, quota, farm scope, and 500-character limit as a typed question, and audio bytes are never uploaded. Tap-to-start/tap-to-stop auto-sends on stop with a 30-second safety cap, spoken answers play only for voice-originated questions, and any answer can be replayed or stopped from its bubble. Typing, sending another question, or closing the drawer interrupts listening/speech, and the assistant remains read-only.

**Intentional product decision:** the Ask the Book interface does not display a persistent AI disclaimer, compliance warning, verification reminder, or retention footer beneath its answers. Do not reintroduce recurring disclaimer text during future reviews unless the product owner explicitly reverses this decision. Keep factual provider and data-handling disclosures in the privacy policy and project documentation. This decision applies to Ask the Book only and does not remove required wording from compliance reports or work-request exports.

### Mapper Pattern
Every entity has a dedicated mapper in `@/lib/mappers.ts`.
- **CamelCase to SnakeCase**: Mappers handle all translation.
- **Payload Sanitization**: Mappers MUST ensure optional fields are sent as `null` to the DB to prevent serialization issues.
- **Safety**: Use `safeNum` and `safeStr` helpers to prevent type errors.
- **Identity Preservation**: Mappers for user-managed reference data, including `saved_seeds`, `fsa_tract_imports`, and `field_clu_assignments`, MUST preserve `id`, `farm_id`, and `deleted_at` so optimistic local IDs, backup restores, and persisted DB rows remain aligned.
- **CLU mappers**: Use `mapFsaTractFromDb`, `mapFsaTractToDb`, `mapFieldCluAssignmentFromDb`, and `mapFieldCluAssignmentToDb` for every FSA tract import and CLU assignment read/write/restore path.
- **Boundary acreage safety**: `Field.boundaryAcreage` is the stable boundary/manual measurement stored in the legacy `fields.operational_acreage` column. CLU assignment toggles synchronize `cluNumbers` only and must never replace boundary acreage with a CLU sum. Display/report acreage still comes from `getDisplayFieldAcres`: active cropland CLUs win, then boundary acreage, then the legacy `field.acreage` fallback.

### farm_id Rule
`farm_id` is a relational partition key. Inserts and restore payloads MUST include the current
`farm_id`. Update operations MUST use `farm_id` only in `.eq('farm_id', farm_id)` filter clauses;
strip `farm_id` out of `.update()` payloads after mapping. Service-layer update helpers should
inject the authoritative current `farmId` before mapper validation, then omit it from the update
payload.

### FSA / CLU Upsert Exception
The default rule remains no `upsert` for updates. The only farm-owned exception is insert/replay
for `fsa_tract_imports` and `field_clu_assignments`:
- `fsa_tract_imports`: upsert on `farm_id,tract_key`.
- `field_clu_assignments`: upsert on `farm_id,tract_key,clu_number`.
- Normal update and soft-delete paths still use `.update().eq('id', id).eq('farm_id', farm_id)`.
- Offline sync and `restore_farm_backup` must preserve these conflict keys so soft-deleted rows can be restored safely.

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
PDF export for spray records. It handles both single-record and multi-record exports. It is driven
exclusively by full `SprayRecord`s — `CustomSprayRecord`s are intentionally excluded.

### Spray Entry Chooser (`SprayTypeChooser.tsx`)
Tapping **Spray** does not open `SprayModal` directly. It opens `SprayTypeChooser`
(`src/components/SprayTypeChooser.tsx`), a two-option prompt: full compliance spray entry vs. a
lightweight custom (outside-party) spray. It remembers the last choice in per-user localStorage
(`al_spray_entry_choice_<userId>`, scoped via `userPrefix = session?.user?.id`) so the common path
stays a single tap. The chooser intercepts the spray click in **both** entry points:
`FieldDetailScreen.tsx` (`FIELD_ACTIONS`) and `QuickAddDialog.tsx` — keep both interception points
in sync when changing spray entry wiring. The chosen type flows into `App.tsx`'s `ModalMap`, which
must keep `customSpray: CustomSprayModal` registered so the Quick Add → custom spray path renders.

### Field Dashboard (Mobile-First)
The `FieldDetailScreen` follows a "Daily Status Board" pattern ordered by farmer usage
frequency. Canonical section order:

1. Field header (name, acres, crop pill, FSA numbers)
2. Boundary map (kept near top for field orientation)
3. Quick Actions (six log buttons + View Full History shortcut)
4. Today at a Glance (4 status cards: rainfall, spray, latest activity, crop)
5. Latest Spray (conditional — compliance detail)
6. Field History (ActivityFeed, last 8 records)
7. Rainfall Summary (detailed rain grid with refresh)
8. CLU Summary (compact one-liner: count + cropland/non-cropland totals + Manage/Assign button)
9. Field Details & Notes (reference metadata + auto-saving notes)

Action-oriented sections (3–6) come first because logging and status checks are the
daily-use flows. Reference info (rainfall detail, CLU, field meta) sits at the bottom.
The CLU section is intentionally compressed to a single row — the full per-CLU list
(with tract keys, per-CLU acres, and land-use badges) lives in the management dialog
opened via the Manage/Assign button, not on the page. Do not re-expand the CLU section
inline; that pattern was retired because it pushed actionable content below the fold.

### Dashboard Crop-Filter Bar (`Index.tsx`)
The operation-total summary and per-crop filter pills live in a static `rounded-2xl`
container in the scrollable dashboard body, directly below the `WeatherBar`. They are
**not** a floating/sticky footer — an earlier floating footer overlapped field cards and
the OS home indicator and was removed.

### Season Selector (`SeasonSelect.tsx`)
The viewing-season dropdown is centralized in `src/components/SeasonSelect.tsx` and consumed by
the Sidebar, Index, Activity, and Reports pages. It reads `activeSeason`, `viewingSeason`,
`setViewingSeason`, and `seasonOptions` directly from `useFarm()` — **do not** redeclare a local
`Select` + `seasonOptions.map` inline. It exposes a `variant="sidebar"` mode (full-width, sidebar
theme) and accepts a `className`/`contentClassName` for per-page sizing. Callers must not hardcode
season options; they come from the `seasonOptions` computed in `farmStore.tsx`.
Season arithmetic is centralized in `src/lib/seasonYears.ts`. The viewing window is
`[activeSeason - 10, min(activeSeason + 1, currentYear + 1)]`; `seasonOptions` seeds that allowed
next season so farmers can enter pre-season plans before rollover, while never exposing a year
beyond `currentYear + 1`.

### Bottom Padding & FAB Visibility
Page container bottom padding must clear the fixed `BottomNav` (`.touch-target` ≈ `4rem` +
`pb-[env(safe-area-inset-bottom)]`). The exact value depends on whether the global Quick Add FAB is
shown on that page (`App.tsx` → `hideQuickAddFab`):
- **FAB shown** (Index, Reports, Settings, Weather, and other root pages): the FAB floats at
  `bottom-[calc(4.5rem+...)]`, so the page container uses
  `pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8` so the last card clears both the nav
  and the FAB.
- **FAB hidden** (`/activity`, `/logistics`, `/onboarding`, `/privacy`, and `/field/*`): use
  `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8` (nav only). `FieldDetailScreen` uses
  `6rem` because it renders its own in-flow Quick Actions grid and needs a little extra clearance.

Never set page-container bottom padding below the nav height, or the last cards scroll under the
tab bar. When adding a new top-level route, pick the value that matches whether the FAB renders on
that route.

### ReportTable (Responsive Preview Fallback)
`ReportTable` (`src/components/ReportTable.tsx`) wraps every report table and applies the
`mobile-cards` class. On screens ≤ 768px a CSS block in `src/index.css` (`@layer utilities`)
restructures the `<table>` into stacked cards:
- the `<thead>` is hidden off-screen; each `<tr>` becomes a bordered, rounded card;
- each data `<td>` shows its column header as a left-side label via
  `td::before { content: attr(data-label) }`;
- `<td colSpan>` rows (banners, readiness checks, empty states) are reset to full-width by
  the `td[colspan]` rules and render no label.

Consequently every data `<td>` passed to `ReportTable` must include a `data-label` attribute
matching its header (enforced in `AGENTS.md` → Responsive Tables). On the Reports page, the
full FSA, spray, fertilizer, hay, and landlord previews are wrapped in
`hidden lg:block print:block`; mobile users receive the export-first workspace described below.
The card transformation remains available for other `ReportTable` consumers that are rendered
below the desktop breakpoint. The Landlord desktop/print preview keeps both its Fields and
Activity Timeline cells `data-label`-attributed.

### Report Readiness and Mobile Export Workspace

Reports are designed around two different use cases:

- **Mobile (`< lg`)** — validate the selected season, review exceptions, and generate a PDF or
  CSV for sharing/office use. `MobileReportExportPanel` presents report identity, readiness,
  grouped issues, large export actions, and last-export/change status. It intentionally does not
  render the full report document or table.
- **Desktop and print (`lg` / print)** — show the complete existing report preview and export
  actions. Printing always includes the full preview, never the mobile workspace.

Shared readiness modeling lives in `src/lib/reportReadiness.ts`. `ReportReadinessPanel` displays
`ready`, `review`, or `empty` status plus progress and severity counts. `ReportIssueList` groups
issues by category. Readiness is advisory and exports remain available even when errors exist.
FSA adapters consume `validateFsa578Rows` and `validateFsaFallProductionRows` so the presentation
layer cannot drift from the authoritative worksheet validation. Spray readiness counts one item
per application even when a tank mix produces multiple product issues. Fertilizer, hay, and
landlord adapters describe record completeness rather than inventing new legal requirements.

Issue actions are actionable rather than passive. Field-level issues navigate to
`/field/:fieldId`; record-level issues navigate to `/activity` with `tab`, `record`, and `type`
query parameters. `Activity.tsx` reads those parameters, selects the correct tab, and opens the
matching editor once. `Reports.tsx` also reads `?tab=` so report deep links select the requested
report.

Successful exports are fingerprinted by `src/lib/reportExportHistory.ts`. The local-storage key
is scoped to user, farm, viewing season, and report type. The fingerprint is deterministic and
uses normalized report source data (not generated timestamps), allowing the mobile panel to show
"Never exported," the last export date, or "data changed since last export." Export-history
storage is best-effort local metadata: a storage failure must not fail or block the actual export,
and the status is device-local rather than cross-device state.

### FSA-578 Acreage Reporting Worksheet

The FSA-578 export is a supporting worksheet intended to be handed to an FSA employee for
crop-acreage entry and reconciliation. It is not an official USDA form. Row construction and
validation live in `src/lib/complianceReports/fsaReports.ts`; the dedicated PDF layout lives in
`src/lib/complianceReports/fsa578PdfExport.ts` and is invoked from `Reports.tsx` through
`exportFsa578WorksheetPdf`. Do not route this export back through the generic `exportToPdf`
footer flow.

The PDF has four canonical sections:

1. **Cropland reporting rows** — the primary FSA entry table. Columns are farm, tract, CLU,
   field, crop, status, acres, planting date, intended use, irrigation, producer share, crop
   sequence, and practice/notes. Non-cropland rows do not appear here.
2. **Reconciliation totals** — totals by crop/intended use and by farm/tract, plus total
   cropland reported. Hay and pasture without planting events are acreage/use, not “planted
   acreage.”
3. **Items to review** — all readiness errors/warnings followed by FSA office correction lines,
   reviewer/date fields, and producer initials. Export remains non-blocking.
4. **All CLU Reference** — cropland and non-cropland boundary reconciliation. Non-cropland is
   explicitly marked reference-only and must never appear as a planted crop. This is a text
   reference, not a map appendix.

Every page repeats farm name, crop year, producer and county/state values or writable blanks,
the current section, and `Page X of Y`. Continuation tables use explicit widths so identifiers
cannot clip. Visually render the complete PDF after layout changes; checking only extracted text
does not catch continuation-page clipping.

Status presentation rules are reporting-specific: a dated crop row without an explicit status
may display as `Planted`; undated hay/pasture cropland may display as `Existing stand`; all other
undated cropland requires an explicit FSA status and produces a readiness error. Type/variety is
intentionally omitted from the PDF unless requested, while preview and CSV retain it for farmer
review. CSV and PDF may differ in layout and sectioning, but must describe the same underlying
farm/tract/CLU acreage and reporting facts.

### Landlord Summary Report

The **Landlord** tab in Reports (`src/components/reports/LandlordSummaryReport.tsx`) is a
per-landlord overview driven by the field-level `Field.landlordName` (not the legacy
harvest-only `HarvestRecord.landlordName`). Selecting a landlord shows:

- **Fields overview** — one row per field with acres (CLU-aware via `getDisplayFieldAcres`),
  crop, total bushels, bu/acre, total bales, and landlord crop-share bushels. Grain and bale
  production remain separate units; the totals row uses a weighted average for overall bu/acre.
- **Activity Timeline** — all season-scoped activity (plant, spray, custom spray, fertilizer,
  tillage, grain harvest, hay harvest) across the landlord's fields, sorted by date, with colored
  activity pills. Hay entries show bale count/type and cutting number.
- **Exports** — CSV (per-field summary + totals) and a **Detailed PDF** (landscape, fields
  table + activity timeline in the footer).

Generation lives in `src/lib/complianceReports/generateLandlordSummary.ts` (pure data builder,
no React). A landlord appears in the selector only if they own at least one non-deleted field
(`getFieldLandlordNames` filters on `deleted_at`). The older `LandlordStatementReport` /
`generateLandlordStatement` (harvest-only crop-share math) is retained for its tests but no
longer rendered.

**Scope note — grain delivered vs owed:** the **owed** side (landlord crop-share bushels from
harvest records) is computed and shown. The **delivered** side is **not** modeled because
`GrainMovement` carries no `fieldId` or landlord link (only an optional `harvestRecordId` that
`SellModal` doesn't populate). Adding delivered reconciliation would require a schema change to
grain movements.

### FieldNotes Component (Auto-Save)
Persistent scratchpad for field-specific notes. Uses a **2000ms debounce** on the `onChange`
event to automatically sync content to Supabase.

### PWA & Bundling
- **Vite Configuration**: `manualChunks` should be avoided for UI libraries (Lucide, Radix, Framer Motion) to prevent initialization order artifacts. Use Vite's default strategy for these.
- **Service Worker**: `sw.js` handles navigation routing to `index.html`.
- **Weather deployment order**: Apply `20260721211903_add_weather_proxy_rate_limit.sql`, configure the four server-only proxy variables in Vercel, then create a new deployment. Updating Vercel variables alone does not modify an existing deployment.

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
- **No `upsert` for updates**: Use `.update().eq('id').eq('farm_id')`; only FSA tract/CLU insert and restore replay paths use the documented conflict-key upserts.
- **Radix Modals**: Always include `DialogDescription`.
- **Form Inputs**: Always include `id`, `name`, and linked `Label`.
- **Data Safety**: Optional fields default to `null` in mappers.
- **Zero vs Falsy**: `0` is a valid farm value. Use `value != null ? value : '—'`.

### Verification

- The default Vitest suite is offline-only; live Rain API and authentication checks are isolated in `*.integration.test.*` and run through `vitest.integration.config.ts`.
- Supabase service/store unit tests use the shared `src/test/supabaseMock.ts` factory. It provides reset-safe Vitest spies, thenable query builders, independent table/RPC results, and a separate table-bound builder for every `from(table)` call so concurrent `Promise.all` queries remain isolated.
- The required consumer lifecycle is one mock per suite, `vi.doMock('@/lib/supabase', ...)`, a dynamic import of the system under test, and `mock.reset()` before each test. The factory must not be constructed through `vi.hoisted`.
- Query-contract coverage exists for fields, bins, FSA tract imports, and CLU assignments. The tests lock farm/id scoping, exact-count update shapes, soft deletes without returning selects, and the two sanctioned conflict-key upserts. Raw-result interpretation and optimistic rollback are tested at the hook layer rather than duplicated in these thin services.
- Hook suites use `src/test/hookTestHarness.tsx` so functional setters run against real React state. Coverage includes fields/bins, grain movements, FSA tract/CLU cascades, all activity-hook rollback/bulk-delete contracts, auth season synchronization, and composed sign-out cleanup.
- Weather-proxy tests live in `src/test/weatherProxy.test.ts`; no test file belongs under `api/` because Vercel deploys TypeScript files there as functions. Proxy changes require both the unit suite and `npm run typecheck:api`.
- Live auth security checks use non-mutating probes and require exact `42501` failures for forbidden profile membership writes.

See [TESTING.md](./TESTING.md) for commands, current coverage measurements, detailed verification protocols, and bot credentials.
