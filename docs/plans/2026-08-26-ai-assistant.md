# Ask the Book — Implemented Plan

**Status:** Implemented locally; OpenRouter key, Supabase migration, deployment, and authenticated live verification remain operational steps.

**Architecture:** `api/ai-assistant.ts` is a Vercel Function that validates the caller’s Supabase bearer token, resolves the caller’s current farm, applies a database-backed daily quota, and runs a bounded named-tool loop through OpenRouter Chat Completions. Every database read uses the caller’s JWT, so existing farm RLS remains the authorization boundary.

**Default model:** `openai/gpt-oss-120b:free`, configurable through server-only `AI_MODEL`.

> **Intentional product decision — preserve in future reviews:** Ask the Book does not show a persistent AI disclaimer, compliance warning, verification reminder, or retention footer beneath its answers. This omission is deliberate. Do not reintroduce recurring disclaimer copy unless the product owner explicitly reverses this decision. Keep factual vendor and local data-handling details in README and the privacy policy.

## Security invariants

- `OPENROUTER_API_KEY` is server-only. Never use a `VITE_*` key for it and never log it.
- The model receives named read tools only. It never receives SQL access, a service-role key, or mutation tools.
- Supabase clients use `SUPABASE_ANON_KEY` plus the authenticated user’s bearer token.
- All farm reads remain protected by existing RLS and exclude soft-deleted records.
- The caller’s profile determines authoritative `farm_id`; request input cannot override it.
- The requested viewing season is clamped through the same allowed window used by the client.
- Questions are limited to 500 characters. History is limited to three complete user/assistant pairs.
- Answers are plain text, capped at 2,000 characters, and rendered without HTML interpretation.
- Browser/native origins must match the exact `ALLOWED_ORIGINS` allowlist.

## OpenRouter request contract

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Authorization: `Bearer ${OPENROUTER_API_KEY}`
- Model: `AI_MODEL` or `openai/gpt-oss-120b:free`
- Output budget: `max_tokens: 2048`
- Provider controls: `data_collection: "deny"` and `require_parameters: true`
- Tool schemas use `{ type: "function", function: { name, description, parameters } }`.
- Assistant messages containing `tool_calls` are replayed before paired `role: "tool"` results.
- Returned `reasoning_details` or string `reasoning` fields are replayed unchanged during the same request’s tool loop.
- OpenRouter account-level prompt logging must remain disabled.

Free-model availability and account-wide rate limits are controlled by OpenRouter. Upstream failures return the existing generic unavailable message so provider details are not leaked to clients.

## Named read tools

1. `earliest_planting`: current-season dated plantings by crop, with an optional field filter; prevented planting is excluded.
2. `planted_acres_by_crop`: current-season planting-record acreage grouped by normalized crop; not FSA cropland acreage.
3. `sprays_for_season`: current-season application dates, field names, and products; notes and attachments are omitted.
4. `bin_inventory`: all-season physical inventory; outbound movements subtract and negative corrections stay negative.
5. `seed_library`: active farm-owned seed reference records.

Tool arguments are validated again in application code. Unknown tools, malformed JSON, unexpected keys, and overlong filters fail closed without querying Supabase. LIKE wildcard characters are escaped before partial-match filters.

## Query and response budgets

| Limit | Value | Behavior |
|---|---:|---|
| Tool-capable rounds | 4 | A fifth request may synthesize an answer but receives no tools. |
| Tool executions | 8 | Excess calls receive `tool budget exceeded` without a database query. |
| Database page size | 1,000 | Aggregate reads page in stable primary-key order. |
| Maximum pages | 10 | Larger result sets fail closed instead of producing partial totals. |
| Tool JSON | 12,000 characters | Listings may truncate explicitly; aggregates fail closed. |
| Whole-handler timeout | 45 seconds | One abort controller covers every provider round. |
| Vercel duration | 60 seconds | Configured in `vercel.json`. |

When the execution budget or fourth tool round is reached, paired tool results are sent through one final answer-only request. This prevents outputs from being silently discarded while guaranteeing no additional database queries.

## Quota and audit storage

Migration: `supabase/migrations/20260827002849_ai_assistant_quota.sql`

- Private schema: `ai_assistant_private`
- Public authenticated RPCs: `consume_ai_assistant_request(text)` and `finalize_ai_assistant_turn(uuid, text, jsonb)`
- Identity comes exclusively from `auth.uid()`.
- `SECURITY DEFINER` functions use an empty `search_path` and revoke `PUBLIC`/`anon` execution.
- Daily quota state is atomic and cross-instance.
- Operational question/answer rows are retained for 30 days.
- Nightly `pg_cron` deletion is primary; consume-time deletion is backup cleanup.
- Quota RPC failures return 503 and fail closed.

The quota/audit schema is operational infrastructure and is intentionally excluded from farm backup and restore.

## Client behavior

- The drawer is available from the sidebar and mobile dashboard.
- It is disabled offline and does not query stale local records.
- Conversations are in-memory and reset when the drawer closes.
- Only three complete prior exchanges are sent to the server.
- A failed request removes its optimistic user message and restores the question, preventing malformed history on retry.
- Successful responses expose a collapsible plain-text “How I looked it up” list.
- The assistant cannot add, edit, or delete records.

## Environment variables

| Variable | Scope |
|---|---|
| `OPENROUTER_API_KEY` | Vercel server-only; Production and desired Preview environments |
| `AI_MODEL` | Optional server-only override |
| `SUPABASE_URL` | Vercel server runtime |
| `SUPABASE_ANON_KEY` | Vercel server runtime; never replace with service role |
| `ALLOWED_ORIGINS` | Exact web/native origin allowlist |
| `VITE_AI_ASSISTANT_URL` | Public deployed base URL for Capacitor builds |

Environment changes require a new deployment. CodeMagic must receive `VITE_AI_ASSISTANT_URL` for native builds; it must never receive the OpenRouter secret through a `VITE_*` variable.

## Verification gates

- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:api`
- `npm test`
- `npm run build`
- Apply the quota migration and confirm both RPC grants plus the `ai-assistant-turns-retention` cron job.
- Deploy a preview with the required environment variables.
- Smoke-test earliest planting, crop acreage, sprays, bin inventory, seed library, write refusal, and a follow-up question.

## Deferred work

- Audio input and speech-to-text.
- Write tools or record mutations.
- Offline answers.
- Cross-device conversation persistence.
