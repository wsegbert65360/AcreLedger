# CLAUDE.md — AcreLedger Claude Instructions

## Primary Rule

Follow `AGENTS.md` first. It is the canonical shared instruction file for AcreLedger across Claude, Codex, Gemini CLI, Pi/local agents, and other AI coding assistants.

This file is intentionally short. It only gives Claude-specific workflow guidance and should not duplicate or override the project rules in `AGENTS.md` or the detailed architecture reference in `BLUEPRINT.md`.

## Context Strategy

Use progressive context loading.

1. Read `AGENTS.md` first.
2. Identify the task area before editing.
3. Inspect the directly relevant source files.
4. Read only the relevant section of `BLUEPRINT.md` when architecture, domain rules, or project conventions are needed.
5. Use `TESTING.md` only for verification protocols, credentials, or test flows.
6. Do not load the full blueprint or unrelated files for narrow tasks.

Good examples:

- UI/modal work: read `AGENTS.md`, the target component, nearby shadcn/ui patterns, and the UI/accessibility sections of `BLUEPRINT.md`.
- Supabase mutation work: read `AGENTS.md`, the relevant hook or `farmStore.tsx`, `@/lib/mappers.ts`, `@/types/farm.ts`, and the state/database sections of `BLUEPRINT.md`.
- Spray/compliance work: read `AGENTS.md`, spray types, spray mappers, spray UI, report/export code if relevant, and the spray sections of `BLUEPRINT.md`.
- Weather/rainfall work: read `AGENTS.md`, the relevant services/components, weather/rainfall types, and the weather/rainfall sections of `BLUEPRINT.md`.

## Claude Operating Style

Before changing code:

- Briefly identify the files and systems likely involved.
- Inspect existing patterns before writing new code.
- Prefer targeted reads and searches over broad context dumps.
- Check types, mappers, and store actions before changing entity behavior.

While changing code:

- Keep edits narrow and task-scoped.
- Preserve existing behavior unless the task explicitly asks to change it.
- Do not rewrite unrelated code.
- Do not introduce new libraries or abstractions unless the existing architecture clearly calls for it.
- Preserve mobile-first UI, Supabase RLS, farm scoping, soft delete, mapper, and optimistic update rules.

After changing code:

- Run the most relevant available package script.
- Prefer TypeScript/build checks when full tests are unavailable.
- Summarize changed files, behavior changes, verification results, and any remaining risks.

## High-Priority Project Rules

Always preserve these rules from `AGENTS.md`:

- Never hard-delete user farm records.
- Every Supabase write is scoped by `farm_id`.
- Mutation functions return `Promise<boolean>`.
- Mappers run before optimistic state updates.
- Optional database fields use `null`, not `undefined`.
- Do not use `upsert` for updates.
- Radix dialogs include `DialogDescription`.
- Inputs have `id`, `name`, and linked labels.
- Lucide icons that conflict with browser globals are aliased.
- Negative grain movement bushels are valid correction values.
- Backup restore uses the current selected `farm_id` as authoritative.

## Blueprint Usage

`BLUEPRINT.md` is the full architecture reference. Treat it as a reference library, not as context to paste wholesale into every task.

Use targeted sections when the task touches:

- Data architecture
- Supabase or RLS
- State mutations
- Backup and restore
- Spray compliance
- Weather or rainfall
- FSA/compliance reports
- Visual design system
- Accessibility patterns

For small local changes, rely on `AGENTS.md` plus source inspection.

## Output Expectations

When completing a coding task, report:

1. What changed.
2. Which files changed.
3. What checks were run.
4. Anything that still needs manual verification.
