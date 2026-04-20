# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server on port 8080
npm run build      # Production build (Vite + PWA)
npm run lint       # ESLint
npm test           # Vitest (single run)
npm run test:watch # Vitest in watch mode
```

Run a single test file: `npm test src/services/__tests__/RainService.test.ts`

## Architecture

AcreLedger is a mobile-first PWA for row-crop farm record-keeping and compliance reporting (FSA 578, MP693 spray logs). React 18 + TypeScript (strict) + Vite, deployed to Vercel. Backend is Supabase (Postgres + RLS + Auth + Edge Functions).

### Key Layers

- **Pages** (`src/pages/`): Index (dashboard), Activity, Logistics, Reports, Settings, FieldDetailScreen
- **Store** (`src/store/farmStore.tsx`): Single React Context providing all entity arrays and CRUD actions. Accessed via `useFarm()`. Entity-specific logic lives in dedicated hooks (`usePlantRecords`, `useSprayRecords`, etc.)
- **Mappers** (`src/lib/mappers.ts`): camelCase ↔ snake_case transformation between app types and DB rows. One mapper per entity — never inline DB shape in hooks or components.
- **Services** (`src/services/`): RainService (dual-source precipitation with 30s promise cache), WeatherService (Visual Crossing), fieldService, binService
- **Compliance reports** (`src/lib/complianceReports.ts`, `src/lib/sprayExport.ts`): CSV and PDF generation for FSA, spray audit, harvest, landlord statements
- **Types** (`src/types/farm.ts`): All entity interfaces. Every season record has `seasonYear: number` and `deleted_at: string | null`.

### Critical Patterns (enforced by BLUEPRINT.md)

**Optimistic update sequence** — every mutation follows this exactly:
1. Guard `farm_id` → validate → call mapper → optimistic state update → await Supabase → success toast / rollback + error toast
2. All mutations return `Promise<boolean>` (OpResult convention) — never `undefined`

**Never use `.upsert()` for edits** — always `.update().eq('id').eq('farm_id')`. Upsert silently inserts ghost rows on miss.

**Never use `.delete()` on user records** — soft delete only: `.update({ deleted_at: new Date().toISOString() })`.

**`farm_id` is a filter, never a payload field** — never include in `.update({...})` body.

**Cross-await state capture** — use `previousRef`/`snapshotRef` inside `setState` callbacks, never read a `let` assigned inside a setter after `await`.

**In-flight guard** — boolean `isAdding` ref with `try/finally`, not a UUID Set.

**`session === undefined`** means hydrating (show skeleton). **`session === null`** means logged out. These are different.

**`lat`/`lng` are nullable** on Field — guard before `.toFixed()`.

**GrainMovement `bushels` may be negative** — intentional business logic, warn in UI but never reject.

### Season System

- `activeSeason` — current farming year, all new records stamp this
- `viewingSeason` — year shown in UI, controlled by dropdown, filters all lists/reports, does not affect writes

### Rainfall System

Dual-source: IEM Stage IV radar (primary) + Supabase RPC (secondary). Coordinates rounded to 4 decimal places. Promise caching prevents duplicate concurrent requests per field.

## Conventions

- Path alias: `@/*` → `./src/*`
- No default `React` import (modern JSX transform)
- `[...arr].sort()` never `arr.sort()` — sort mutates in place
- `value > 0 ? value : '—'` not `value || '—'` — zero is a valid farm value
- `parseInt(v, 10)` always with radix
- `onOpenChange` must check boolean: `(open) => { if (!open) onClose(); }`
- Named constants over magic numbers (e.g. `WIND_ALERT_MPH`)
- Module-level pure helpers outside components; all derived data in `useMemo`
- `fieldMap` pattern (Map for O(1) lookups) instead of `.find()` per row
- `safeExport` wrapper on all CSV/PDF export calls
- All exports wrapped in `try/catch` with user-facing toast, never "check the console"
- `lovable-tagger` plugin active in dev mode only
- Tailwind CSS v3 with custom plant/spray/harvest color tokens
- Icons: Lucide React only — no other icon library
- Toasts: Sonner only
- DB functions: always include `SET search_path = public, extensions`

## Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VISUALCROSSING_KEY=
```

Supabase Edge Function secrets (set in Supabase dashboard, not env):
- `NOAA_MRMS_BASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Authoritative References

- **BLUEPRINT.md** — canonical architecture and rules document. Read before making any change.
- **TESTING.md** — verification protocols, bot credentials for E2E smoke testing.
