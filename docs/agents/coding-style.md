# Coding style

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: no single enforcer; naming checked against src/ layout. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
<!-- contents:end -->

## Coding Style

- TypeScript strict mode is expected.
- Prefer explicit types for exported functions and public helpers.
- Keep logic local and boring unless a shared helper already exists.
- Do not introduce new libraries without a strong reason.
- Reuse existing shadcn/ui, Tailwind, Lucide, Sonner, Zod, mapper, and utility patterns.
- Use existing naming conventions rather than inventing new ones.

## File Naming

- **Components**: PascalCase — e.g. `FieldCard.tsx`, `SprayModal.tsx`.
- **Pages**: PascalCase — e.g. `Index.tsx`, `Settings.tsx`, `FieldDetailScreen.tsx`.
- **Hooks**: camelCase with `use` prefix — e.g. `usePlantRecords.ts`, `useAuth.ts`.
- **Services and utilities**: camelCase — e.g. `binService.ts`, `sprayExport.ts`, `dates.ts`.
- **Type definitions**: camelCase — e.g. `farm.ts`, `database.ts`, `weather.ts`.
- **shadcn/ui primitives**: kebab-case in `src/components/ui/` — e.g. `alert-dialog.tsx`, `input-otp.tsx`.
- **Tests**: colocated, appended `.test` — e.g. `mappers.test.ts`, `WeatherService.test.ts`.

## Import Order

Group imports in this order, separated by blank lines:

1. React and React addons (e.g. `react`, `react-router-dom`).
2. External libraries (e.g. `@supabase/supabase-js`, `sonner`, `lucide-react`, `framer-motion`).
3. Internal `@/` imports — components, store, types, services, utils.
4. Relative imports (`../lib/`, `./`).

Within each group, order alphabetically by module path. This matches the existing codebase and keeps diffs clean.
