# Ask the Book

Moved from AGENTS.md. This file is the agent rule. Architecture detail stays in [BLUEPRINT.md](../../BLUEPRINT.md).

> **Verified against code:** 2026-11-15, `4831fed`. Files opened: src/lib/askBookAccess.ts, api/ai-assistant.ts, server/ai-assistant-tools.ts. Rules below were kept because that code still depends on them. This is not a line-by-line audit of every historical date.

<!-- contents:start -->
- [AI Assistant / Ask the Book](#ai-assistant--ask-the-book)
<!-- contents:end -->

## AI Assistant / Ask the Book

**Status (owner, 2026-10-31, PR #81):** Ask the Book stays in the repo. It is on only for the owner's own farm. `isAskBookEnabled` in [src/lib/askBookAccess.ts](../../src/lib/askBookAccess.ts) is the allowlist (one farm id). The same check gates the drawer in `src/App.tsx`, `src/components/Sidebar.tsx`, `src/pages/Index.tsx`, and `src/context/AskAcreLedgerContext.tsx`. `api/ai-assistant.ts` returns 403 for every other farm. Do not add farms, do not remove the gate, and do not name that farm or its id in docs or marketing. It is not a marketed feature: do not add it to Landing, the product description, or store listing copy. The privacy policy still discloses it, because the allowlisted farm can still send a question. Do not delete this code unless the owner says to remove it.

A full removal would touch the files, tables, env vars, and doc sections listed under [BLUEPRINT → Ask the Book Read Registry](../../BLUEPRINT.md#ask-the-book-read-registry). Owner decision (2026-11-15): keep this one-farm gate. Do not remove Ask the Book.

Canonical detail: [BLUEPRINT → Ask the Book Read Registry](../../BLUEPRINT.md#ask-the-book-read-registry).

- The assistant is **read-only**: no add, edit, delete, restore, arbitrary RPC, or other mutation path.
- `server/ai-assistant-tools.ts` is the single allowlisted read registry. The model gets named tools only — never raw SQL, caller-chosen table names, a service-role/secret key, or a generic database client. Filters, aggregates, grouping, and search targets stay hardcoded and fail closed.
- Every read uses the caller's JWT with the publishable/anon key (RLS stays on) **and** applies the authoritative `farm_id` resolved from the caller's profile. Request input never selects a farm.
- Adding or renaming a user-facing farm table requires updating the registry and its catalog-isolation tests in the same change, or documenting why the table is excluded.
- `OPENROUTER_API_KEY` is server-only. Native builds require `VITE_AI_ASSISTANT_URL`, validated in `codemagic.yaml`.
- Model routing (primary, fallback, one retry, `AI_MODEL` override) is described in BLUEPRINT. The current model IDs are the `DEFAULT_PRIMARY_MODEL` and `FALLBACK_MODEL` constants in `api/ai-assistant.ts`; do not copy IDs into the docs.
- Voice uses on-device/OS speech through `src/lib/speech.ts` and `src/hooks/useAskVoice.ts`; only text reaches the server.
- **Intentional product decision:** no persistent AI disclaimer beneath answers. Do not reintroduce one unless the product owner reverses the decision (canonical statement in BLUEPRINT).
- Keep function tests outside `api/`. When the registry or endpoint changes, run the assistant unit tests, live RLS integration coverage when credentials exist, `npm run typecheck:api`, and a Vercel build.
- Ask the Book conversation history is loaded server-side from `ai_assistant_private.turns` for the current user and farm. The handler ignores any `history` the client sends. `finalize_ai_assistant_turn` is executable only by `service_role`.
- Weather proxy and Ask the Book also share a global UTC daily spend cap (`usage_private.provider_daily_usage`, env `WEATHER_DAILY_CAP` / `AI_DAILY_CAP`, defaults 2000 / 500). Exhaustion or RPC failure returns HTTP 503. Per-user quotas still return 429.
