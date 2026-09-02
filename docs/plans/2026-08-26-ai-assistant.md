# Ask the Book — Implemented Plan

**Status:** Core assistant is deployed. The full read-only farm-data expansion is implemented locally and requires verification plus deployment.

**Architecture:** `api/ai-assistant.ts` is a Vercel Function that validates the caller’s Supabase bearer token, resolves the caller’s current farm, applies a database-backed daily quota, and runs a bounded named-tool loop through OpenRouter Chat Completions. Every database read uses the caller’s JWT, so existing farm RLS remains the authorization boundary.

**Default model:** MiniMax M3 Free (`minimax/minimax-m3:free`), with OpenRouter `models` fallback to OpenRouter Free Tool Call (`openrouter/free`) on unavailable/rate-limit. `AI_MODEL` overrides the primary only.

> **Intentional product decision — preserve in future reviews:** Ask the Book does not show a persistent AI disclaimer, compliance warning, verification reminder, or retention footer beneath its answers. This omission is deliberate. Do not reintroduce recurring disclaimer copy unless the product owner explicitly reverses this decision. Keep factual vendor and local data-handling details in README and the privacy policy.

## Security invariants

- `OPENROUTER_API_KEY` is server-only. Never use a `VITE_*` key for it and never log it.
- The model receives named read tools only. It never receives SQL access, a service-role key, or mutation tools.
- Supabase clients use `SUPABASE_ANON_KEY` plus the authenticated user’s bearer token.
- All farm reads remain protected by existing RLS, add an explicit authoritative `farm_id` filter as defense in depth, and exclude soft-deleted records.
- The caller’s profile determines authoritative `farm_id`; request input cannot override it.
- The requested viewing season is clamped through the same allowed window used by the client.
- Questions are limited to 500 characters. History is limited to three complete user/assistant pairs.
- Answers are plain text, capped at 2,000 characters, and rendered without HTML interpretation.
- Browser/native origins must match the exact `ALLOWED_ORIGINS` allowlist.

## OpenRouter request contract

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Authorization: `Bearer ${OPENROUTER_API_KEY}`
- Model: `AI_MODEL` or `minimax/minimax-m3:free`
- Fallback models: `["openrouter/free"]` unless the primary is already `openrouter/free`
- Output budget: `max_tokens: 2048`
- Provider controls: `data_collection: "deny"` and `require_parameters: true`
- Tool schemas use `{ type: "function", function: { name, description, parameters } }`.
- Assistant messages containing `tool_calls` are replayed before paired `role: "tool"` results.
- Returned `reasoning_details` or string `reasoning` fields are replayed unchanged during the same request’s tool loop.
- OpenRouter account-level prompt logging must remain disabled.

Free-model availability and account-wide rate limits are controlled by OpenRouter. If the primary model is unavailable or rate-limited (HTTP 429, 502, 503, or matching error text), that tool round retries once with `openrouter/free` and no `models` array, without consuming a second quota token. Upstream failures return the existing generic unavailable message so provider details are not leaked to clients.

## Named read tools

Flexible full-farm tools:

1. `farm_overview`: current farm/profile context, every active field and bin, and the readable record catalog.
2. `query_farm_records`: complete active rows for one allowlisted record type, with season, field, date, ID, limit, and ID-cursor filters.
3. `get_record_details`: one complete active row by record type and ID.
4. `search_farm_records`: case-insensitive text and nested-JSON search across up to six chosen record types.
5. `aggregate_farm_records`: exact count/sum/average/minimum/maximum with allowlisted numeric and grouping fields.
6. `activity_timeline`: newest-first combined planting, spray, fertilizer, tillage, harvest, hay, and grain history.

Optimized domain tools remain for common questions: `earliest_planting`, `planted_acres_by_crop`, `sprays_for_season`, `bin_inventory`, and `seed_library`.

The centralized registry covers farm/profile context, fields, bins, every activity record, grain movements, seeds and recipes, FSA tract imports and CLU assignments, work requests, and stored hourly/coverage/daily rainfall. Season filters may address any valid historical crop year; omission means all seasons for the generic query/search/aggregate tools. `activity_timeline` defaults to the current viewing season. Soft-deleted rows, other farms, `auth`, private quota/audit state, and infrastructure schemas are never catalog entities.

Tool arguments are validated again in application code. Table names, numeric fields, grouping fields, filters, and search targets come from hardcoded allowlists; unknown tools, malformed JSON, unexpected keys, unsupported filters, and overlong values fail closed without querying Supabase. LIKE wildcard characters are escaped before partial-match filters. The server removes embedded base64 image bytes and replaces raw geometry coordinates with compact metadata before model exposure; ordinary notes, products, JSON details, and scalar columns remain readable.

## Query and response budgets

| Limit | Value | Behavior |
|---|---:|---|
| Tool-capable rounds | 4 | A fifth request may synthesize an answer but receives no tools. |
| Tool executions | 8 | Excess calls receive `tool budget exceeded` without a database query. |
| Database page size | 1,000 | Aggregate/search reads page in stable primary-key order. |
| Maximum pages | 10 | Larger result sets fail closed instead of producing partial totals. |
| Tool JSON | 12,000 characters | Listings truncate explicitly and expose a safe cursor where possible; aggregates fail closed. |
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
- Tap-to-start/tap-to-stop microphone with live transcript, auto-send on stop, and a 30-second safety cap; typed questions stay silent unless the answer is replayed, and speech stops on typing, sending, or drawer close.
- It is disabled offline and does not query stale local records.
- Conversations are in-memory and reset when the drawer closes.
- Only three complete prior exchanges are sent to the server.
- A failed request removes its optimistic user message and restores the question, preventing malformed history on retry.
- Successful responses expose a collapsible plain-text “How I looked it up” list.
- Voice ask-and-answer is implemented (previously deferred) with on-device/OS speech: `src/lib/speech.ts` adapts the Capacitor community plugins on iOS and the browser Web Speech API on the web, `src/hooks/useAskVoice.ts` drives the drawer mic, the transcribed text question flows through the same endpoint/quota/farm scope, only voice-originated answers are spoken, and the assistant cannot add, edit, or delete records. Audio never leaves the device.

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
- Smoke-test every catalog entity, cross-farm isolation, notes/products search, multi-season queries, grouped totals, activity timeline, bin inventory, write refusal, and a follow-up question.

## Deferred work

- Write tools or record mutations.
- Offline answers.
- Cross-device conversation persistence.
