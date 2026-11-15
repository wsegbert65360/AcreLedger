# UI, accessibility, and React

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/index.css, src/components/ErrorBoundary.tsx. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
<!-- contents:end -->

## UI and Component Rules

## Accessibility

- Every `DialogContent` must include a `DialogDescription`.
- Visually hidden descriptions are acceptable with `sr-only`.
- Every form input must have a unique `id` and `name`.
- Every `Label` must use `htmlFor` linked to the input ID.
- Interactive touch targets should be at least 44px high. Default form `Input` and `SelectTrigger` components must use `h-11` (44px) height. Custom height overrides (such as `h-9` or `h-10`) on form inputs and selectors should be avoided to prevent touch-target regressions.

## Light Mode Theme

Follow [BLUEPRINT → Light Mode Palette](../../BLUEPRINT.md#light-mode-palette).

## Color Mode Theme

Follow [BLUEPRINT → Color Mode Palette](../../BLUEPRINT.md#color-mode-palette).

## Typography

Follow [BLUEPRINT → Typography Split](../../BLUEPRINT.md#typography-split).

## Numeric Display

- Do not render raw summed floating-point values for acreage, bushels, rainfall, percentages, or report totals.
- Use `roundTo` and `formatMeasurement` from `@/utils/numbers` for displayed measurements unless a more specific formatter already exists.
- Keep stored numeric precision intact; round for display/export summaries, not by mutating source records.
- Treat `0` as a valid display value. Use `value != null ? value : '—'`, not simple truthiness.

## Date Parsing and Sorting

- Never build `Date` objects from date-only strings with `new Date(iso)` or sort with `.getTime()` on raw fields; the UTC parse shifts date-only entries one day early in western timezones and produces `NaN` keys for invalid input.
- Display formatting uses `parseLocalDate` / `formatIsoDate` from `@/utils/dates`; epoch rendering uses `toLocalIsoDate`.
- Sorting or comparing records by the work date shown to the user must go through `getWorkDateMs` / `compareWorkDateDesc` from `@/utils/dates`, which parse date-only strings as local midnight and fall back to `record.timestamp`. The Landlord Summary section carries the same rule for its own paths; this is the general rule.

## Text Case

Follow [BLUEPRINT → Text Case & Tracking](../../BLUEPRINT.md#text-case--tracking) and
[Field Card Status Pills](../../BLUEPRINT.md#field-card-status-pills).

## Layout

- Preserve mobile-first design and clearance for fixed navigation and the Quick Add button.
- Follow [Bottom Padding & FAB Visibility](../../BLUEPRINT.md#bottom-padding--fab-visibility) for the route allowlist and exact spacing; maintain those values in BLUEPRINT only.
- Follow [Page Header Pattern](../../BLUEPRINT.md#page-header-pattern), [Border Radius Standard](../../BLUEPRINT.md#border-radius-standard), and [Field Dashboard](../../BLUEPRINT.md#field-dashboard-mobile-first) for presentation and section order.
- Keep dashboard crop filters, totals, and quick actions in the scrollable body below the WeatherBar; do not add floating or sticky bottom bars.
- Horizontal tab bars on mobile use horizontal scrolling and non-shrinking, non-wrapping labels so every tab remains reachable.

## Responsive Tables

- `ReportTable` applies the `mobile-cards` class globally. On screens ≤ 768px each table renders as a stack of bordered cards instead of a horizontally-scrollable grid.
- Reports-page tables are intentionally wrapped in `hidden lg:block print:block`; mobile users receive readiness, issue review, and export controls instead of the full table. `mobile-cards` remains the fallback for `ReportTable` consumers rendered on small screens elsewhere.
- Every data `<td>` inside a `ReportTable` MUST carry a `data-label="<HEADER>"` matching its column header. Cells without `data-label` render as unlabeled, right-aligned cards on mobile.
- Full-width rows (`<td colSpan={n}>` for banners, readiness checks, and empty states) MUST NOT carry `data-label`; they are handled automatically by the `td[colspan]` CSS rules and render full-width.
- Standalone `<table>`s that bypass `ReportTable` are excluded from the card layout by design. Do not add `mobile-cards` to them unless every cell also gets `data-label`. The Landlord Summary desktop/print preview (`LandlordSummaryReport.tsx`) uses `ReportTable` for both its Fields and Activity Timeline tables, so every cell there must carry `data-label`.

## Icons

- Lucide React is the only icon library.
- Never import a Lucide icon using a name that conflicts with a browser global object.
- Always alias risky icons:

```ts
import { Map as MapIcon, History as HistoryIcon } from 'lucide-react';
```

## Leaflet Maps

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

## Activity Icons

Icon and color mapping for activity types is centralized in `src/lib/activityIcons.ts`:
- `ACTIVITY_ICONS` — Lucide icon per `ActivityType`.
- `ACTIVITY_TEXT_COLORS` — Tailwind text color class per type.
- `ACTIVITY_BG_COLORS` — Tailwind background color class per type.

Replace inline icon/color switch logic in `RecordListItem`, `FieldCard`, `DashboardStats`, and similar components with these maps. `ActivityType` covers: `plant`, `spray`, `customSpray`, `harvest`, `grain`, `hay`, `fertilizer`, `tillage`.

## Coachmarks (Onboarding Overlay)

Onboarding coachmarks use `src/hooks/useCoachmarks` and render via `src/components/CoachmarkOverlay`. Steps target DOM elements by `id` on those elements. Target IDs on key UI elements:
- Dashboard tab: `id="coachmark-activity-tab"`, `id="coachmark-reports-tab"`.

The hook is enabled only when `session && onboardingComplete && location.pathname === '/'`. New coachmark steps targeting other elements must add stable `id` attributes to those elements first.
