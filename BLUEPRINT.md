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
| Weather | Visual Crossing API | Current wind/temp conditions |
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

### Accessibility (Mandatory Standards)
- **Modal Descriptions**: Every `DialogContent` MUST include a `DialogDescription` (can be `sr-only` for visual cleanliness) to satisfy Radix UI accessibility requirements.
- **Label Association**: Every form input MUST have a unique `id` and `name`. The corresponding `Label` MUST use the `htmlFor` attribute to link to that ID.
- **Touch Targets**: Buttons and interactive elements follow a 44px minimum height standard for mobile usability.

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

### Bin
Grain storage bin. Tracks capacity and identity.
```ts
{ id, farm_id, name, capacity, deleted_at }
```

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
- **End Time Estimation**: Application duration is auto-calculated at a default rate of **60.6 acres/hour** (representing a 100' wide sprayer at 5 mph).
- **Total Product Auto-summing**: System automatically calculates `totalProductAmount` based on rate and treated acreage.
- **Weather Recovery**: "Recover Past Weather" feature pulls historical conditions from Visual Crossing based on field location and start time.
- **Advanced Compliance**: Includes Nozzle type/size, Pressure (PSI), and Sensitive Area Check for high-tier regulatory audits.

### HarvestRecord / HayHarvestRecord / TillageRecord / FertilizerApplication / GrainMovement
Standard farm activities, all scoped to `farm_id` and `seasonYear`. 

---

## 4. State Management Rules

### farmStore (React Context)
Single global store in `farmStore.tsx`. Exposes all entity arrays, their setters, and CRUD actions. Accessed via `useFarm()`.

### Optimistic Update Pattern
Every mutation follows this exact sequence:
1. Guard: `if (!farm_id)`
2. Validate inputs.
3. Call mapper (`mapXToDb`) — **BEFORE** touching state. Ensuring all optional fields default to `null` (not `undefined`).
4. Apply optimistic state update.
5. Await Supabase operation.
6. Success: toast.success | Error: Roll back state, toast.error (with detailed Postgres message).

---

## 5. Database Conventions

### Migration Strategy (Mandatory)
- **Unique Timestamps**: Every migration filename MUST start with a unique **14-digit timestamp** (`YYYYMMDDHHMMSS_name.sql`). This prevents collisions in the Supabase CLI when multiple developers create migrations on the same day.
- **Naming**: `20260514100000_fix_security.sql`.

### Security Hardening & RLS
- **Explicit Grants**: Every table MUST have explicit `GRANT` statements for `authenticated`, `anon`, and `service_role`.
- **Tenant Isolation**: Every table MUST have Row Level Security (RLS) enabled with a policy that restricts access to the user's `farm_id`.
  ```sql
  CREATE POLICY "Users can access their farm data" ON public.your_table
    FOR ALL TO authenticated
    USING (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid()));
  ```
- **Search Path**: Every function MUST set a secure `search_path = public, extensions`.

### Mapper Pattern
Mappers in `@/lib/mappers.ts` handle `camelCase` (app) ↔ `snake_case` (DB) translation.
- **Defense**: Mappers MUST ensure optional fields are sent as `null` to the DB to prevent serialization issues.
- **Safety**: Use `safeNum` and `safeStr` helpers to prevent type errors.

---

## 6. Component Patterns

### Icon Shadowing Prevention
**NEVER** import a Lucide icon with a name that conflicts with a global browser object (e.g., `Map`, `History`). 
- **Always alias**: `import { Map as MapIcon, History as HistoryIcon } from 'lucide-react'`.
- This prevents `TypeError: Illegal constructor` errors in production bundles.

### PWA & Bundling
- **Vite Configuration**: `manualChunks` should be avoided for UI libraries (Lucide, Radix, Framer Motion) to prevent initialization order artifacts. Use Vite's default strategy for these.
- **Service Worker**: `sw.js` handles navigation routing to `index.html` to support client-side SPA routing while offline.

---

## 11. Error Handling Standards

### Detailed Error Logging
`useXRecords` hooks MUST log the full error object from Supabase (Message, Details, Hint) to the console to assist in remote debugging of production issues.

### Content Security Policy (CSP)
The `index.html` MUST include a meta CSP tag that allows `unsafe-eval` (required by UI libraries and PWA tools) while restricting origins to `self`, Supabase, Visual Crossing, and Vercel.

---

## 12. Coding Rules & Conventions

- **Icon Shadowing**: Use `MapIcon`, `HistoryIcon` aliasing.
- **No `upsert` for updates**: Use `.update().eq('id').eq('farm_id')`.
- **Radix Modals**: Always include `DialogDescription`.
- **Form Inputs**: Always include `id`, `name`, and linked `Label`.
- **Data Safety**: Optional fields default to `null` in mappers.

### Verification
See [TESTING.md](./TESTING.md) for detailed verification protocols and bot credentials.
