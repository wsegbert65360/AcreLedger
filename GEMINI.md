# GEMINI.md — AcreLedger Gemini CLI Instructions

## Primary Rule

Follow `AGENTS.md` first. It is the canonical shared instruction file for this repo across Codex, Gemini CLI, Pi/local agents, and other AI coding assistants.

This file only adds Gemini CLI workflow guidance. Do not let this file override project safety rules in `AGENTS.md` or architecture rules in `BLUEPRINT.md`.

## Context Strategy

Use focused context loading.

1. Read `AGENTS.md` first.
2. Identify the task area.
3. Read the directly relevant source files.
4. Read only the relevant section of `BLUEPRINT.md` if architectural context is needed.
5. Use `TESTING.md` only for verification flows, credentials, or testing instructions.
6. Do not load the full repo or the full blueprint unless the task genuinely spans multiple systems.

Good examples:

- UI modal work: read `AGENTS.md`, the target component, related shadcn/ui patterns, and the UI/accessibility sections of `BLUEPRINT.md`.
- Supabase mutation work: read `AGENTS.md`, `farmStore.tsx` or the relevant hook, `@/lib/mappers.ts`, `@/types/farm.ts`, and the state/database sections of `BLUEPRINT.md`.
- Spray record work: read `AGENTS.md`, spray types, spray mappers, spray UI, export/report code if relevant, and the spray sections of `BLUEPRINT.md`.
- Weather or rainfall work: read `AGENTS.md`, the relevant service/component files, weather/rainfall types, and the weather/rainfall sections of `BLUEPRINT.md`.

## Gemini CLI Operating Style

Before making changes:

- Briefly identify the files and systems likely involved.
- Inspect existing patterns before writing new code.
- Prefer search and targeted file reads over broad context dumps.
- Check types and mapper behavior before changing entity shapes.

During changes:

- Keep edits narrow and task-focused.
- Do not rewrite unrelated code.
- Do not introduce new abstractions unless the existing pattern clearly requires it.
- Preserve AcreLedger's mobile-first UI style.
- Preserve Supabase RLS, farm scoping, soft delete, mapper, and optimistic update rules.

After changes:

- Run the most relevant available package script.
- Prefer build/type checks when full tests are unavailable.
- Report changed files, what changed, verification results, and any remaining risk.

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
- New records are stamped with `viewingSeason` (from `useFarm()`), not `activeSeason`.
- Backup restore uses the current selected `farm_id` as authoritative.

## Blueprint Usage

`BLUEPRINT.md` is the full architecture reference. Treat it as a library, not a prompt to paste wholesale into every task.

Use it when the task touches:

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

When completing a coding task, summarize:

1. What changed.
2. Which files changed.
3. What checks were run.
4. Anything that still needs manual verification.
