# AcreLedger

A mobile-first, PWA-ready farm record-keeping and compliance reporting app for row-crop farmers and small operations. Tracks fields, planting, spraying, fertilizing, harvest, hay, grain bins, grain movement, weather, rainfall, FSA tracts/CLU assignments, and compliance exports. Wraps the React/Vite PWA in a native iOS shell via Capacitor 6 and ships to TestFlight through CodeMagic.

For full architecture, data model, and project rules, read **[AGENTS.md](./AGENTS.md)** first, then **[BLUEPRINT.md](./BLUEPRINT.md)** for deep architectural reference.

## Key Features

- **Mobile-first PWA**: Responsive layout with safe-area insets, bottom navigation, sticky headers, and touch-sized targets. Installable on desktop and Android via the service worker.
- **Native iOS via Capacitor 6**: Haptics, status bar, geolocation, network, preferences, splash screen, and share sheet — all conditionally gated so the same build runs in any browser.
- **Offline-capable**: Mutations enqueue locally (`@/lib/syncQueue.ts` + `@/lib/offlineStorage.ts`) and replay on reconnect or app foreground. Network status is monitored via `@capacitor/network` with web fallback.
- **Optimistic UI with rollback**: Every add/update/delete returns `Promise<boolean>`, snapshots state, and rolls back on Supabase errors.
- **Season scoping**: Users view a `viewingSeason` independent of the farm's `activeSeason`. New records stamp the viewed season, and selectors pull dynamic options from `farmStore.tsx`.
- **Soft delete everywhere**: Records are excluded by `deleted_at` filter, never hard-deleted. RLS enforces the same exclusion server-side.
- **FSA tract + CLU assignment**: Import FSA tract GeoJSON, assign CLUs to fields, sync acreage and CLU numbers back to the field, and round-trip everything through backup/restore.
- **Compliance exports**: FSA-578 acreage summaries, fall production worksheets, spray logs (state-neutral universal format), hay summaries, fertilizer reports, and landlord statements. PDF/CSV exports driven by `@/lib/complianceReports` and `@/lib/sprayExport.ts`.
- **Spray wizard**: 5-step wizard (`src/components/spray/`) with an in-cab quick mode, multiple-product tank mix, EPA registration compliance checks, weather conditions, and review step.
- **Quick Add**: Global FAB + dialog on mobile (`QuickAddDialog.tsx`) with GPS-based nearest field detection and preselected record types.
- **Duplicate + prefill**: Every activity modal supports `'edit' | 'duplicate'` modes and pre-fills new records from the most recent prior record of the same type for that field.
- **Undo-safe delete**: Bulk-delete UIs (e.g. FieldManager) hide rows immediately and commit only after an undo window expires (`useUndoDelete.ts`).
- **Backup/restore**: Settings → Backup exports the entire farm (including FSA tracts + CLU assignments) as JSON. Restore validates against a Zod schema and replays through `restore_farm_backup` RPC with the current `farm_id` as authoritative.
- **Weather + rainfall**: Visual Crossing for current conditions/forecast, IEM Stage IV radar merged with Supabase RPC for high-resolution rainfall. `/weather` page includes a Windy radar embed and a spray-decision matrix.
- **Onboarding coachmarks**: Overlay system targeting DOM elements by stable IDs, gated on authenticated + onboarding complete + dashboard route.

## Technology Stack

- **React 18 + TypeScript (strict)** — UI, hooks, JSX.
- **Vite + Vite PWA Plugin** — bundler, dev server, service worker.
- **React Router v6** — page routing.
- **Supabase** — Auth, Postgres, RLS, RPC, Realtime (connection health).
- **React Context (`farmStore.tsx`)** — global state and CRUD actions. (No external state library — ignore any older docs that mention Zustand; it is not in use.)
- **shadcn/ui + Radix primitives + Tailwind CSS v3** — accessible UI components and theming.
- **Lucide React** — the only icon library.
- **Sonner** — toasts.
- **Zod** — backup schema validation.
- **Leaflet + react-leaflet + Turf.js** — field boundary maps, CLU assignment maps, acreage geometry.
- **jsPDF + jspdf-autotable** — PDF exports.
- **Framer Motion** — route transitions and micro-interactions.
- **Visual Crossing API** — weather.
- **Rain API (IEM Stage IV + Supabase RPC merge)** — rainfall, hosted at `https://rain-api.vercel.app`.
- **Capacitor 6** — native iOS wrapper and device plugins (`app`, `core`, `filesystem`, `geolocation`, `haptics`, `ios`, `network`, `preferences`, `share`, `splash-screen`, `status-bar`, `community/sqlite`).

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # production build (default mode)
npm run build:dev    # development-mode build
npm run lint         # ESLint
npm run test         # Vitest (one-shot)
npm run test:watch   # Vitest watch mode
npm run cap:sync     # npx cap sync ios
npm run cap:open     # npx cap open ios (opens Xcode)
npm run cap:build    # vite build --mode capacitor && npx cap sync ios
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
# Supabase
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Weather (Visual Crossing)
VITE_VISUALCROSSING_KEY=your_visual_crossing_api_key
VITE_WEATHER_PROXY_URL=https://your-app.vercel.app

# Rain API (optional — RainService falls back to https://rain-api.vercel.app)
VITE_RAIN_API_URL=https://rain-api.vercel.app
```

`VITE_RAIN_API_URL` is optional. If set, it must be a clean HTTPS URL (no quotes, no `KEY=`, no trailing `/rain`). When unset, `RainService` uses the production Rain API directly. For iOS/Capacitor weather, provide an absolute `VITE_WEATHER_PROXY_URL` or set `VITE_VISUALCROSSING_KEY`; the proxy URL is preferred when both are set, while the web app can continue using the server-side `/api/weather-proxy`.

## Deployment

### Web (Vercel)
The frontend deploys to **Vercel**. Vercel is linked to the GitLab remote and auto-deploys on pushes to `main` / `master`. `vercel.json` configures cache headers for `index.html`, `/`, and the service worker.

### iOS (CodeMagic → TestFlight)
`codemagic.yaml` defines the `acreledger-ios` workflow that runs on push to `main`: lint → unit tests → `cap:build` → `pod install` → Xcode build → IPA → App Store Connect upload. See **[CODEMAGIC.md](./CODEMAGIC.md)** for signing credentials, environment variable groups, and troubleshooting, and **[Macinstructions.md](./Macinstructions.md)** for local macOS compilation and distribution.

### GitLab CI
`.gitlab-ci.yml` runs `npm ci && npm test` on `main` / `master` pushes. It does not deploy.

### Git Remotes
`origin` is configured with multiple push URLs so a single `git push origin main` syncs **GitLab**, **GitHub**, and **Codeberg**. Verify all three remote heads after pushing CI/CD changes. `github` and `codeberg` named remotes are also available for targeted pushes.

## Project Conventions (Summary)

Read **[AGENTS.md](./AGENTS.md)** for the full rules. The non-negotiables:

- **Data safety**: never hard-delete user records. Soft delete via `deleted_at`.
- **Farm scoping**: every Supabase write is scoped to the current `farm_id`; the null guard is the first line of every mutation.
- **Season scoping**: stamp new records with `viewingSeason`, not `activeSeason`.
- **Mapper discipline**: call `mapXToDb` before state changes; optional fields are `null`, not `undefined`.
- **Optimistic updates**: snapshot → update → await → commit or roll back. Always return `Promise<boolean>`.
- **Web/native hybrid**: never call Capacitor plugins unconditionally — guard with `Capacitor.isNativePlatform()` or use `@/lib/native.ts` wrappers.
- **Touch targets**: form inputs and selectors use `h-11` (44px) minimum.
- **Accessibility**: every `DialogContent` has a `DialogDescription`; every input has `id`, `name`, and a linked `Label`.
- **Icons**: alias any Lucide icon whose name collides with a browser global (`Map as MapIcon`, `History as HistoryIcon`).
