import { createClient } from '@supabase/supabase-js';

import {
  executeNamedTool,
  INVALID_ARGS_ERROR,
  TOO_MANY_ROWS_ERROR,
  TOOL_DEFINITIONS,
  UNKNOWN_TOOL_ERROR,
  type ToolResult,
} from './ai-assistant-tools';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): ApiResponse;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  end(): void;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_ITEM_LENGTH = 500;
const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_EXECUTIONS = 8;
const MAX_OUTPUT_TOKENS = 2048;
const MAX_ANSWER_CHARS = 2000;
const HANDLER_TIMEOUT_MS = 45_000;
const FALLBACK_ANSWER = "I couldn't look that up from your records just now. Try asking again.";
const WRITE_REFUSAL_RE =
  /\b(can(?:not|'t)|will not|won't|unable to|do not|don't)\b[\s\S]{0,80}\b(delete|update|insert|change|modify|remove|write)\b/i;

// Must stay in sync with src/lib/seasonYears.ts clampViewingSeason.
const MIN_SEASON_YEAR = 2000;

function getMaxActiveSeason(currentYear = new Date().getFullYear()): number {
  return currentYear + 1;
}

function getMaxViewingSeason(activeSeason: number, currentYear = new Date().getFullYear()): number {
  return Math.min(activeSeason + 1, getMaxActiveSeason(currentYear));
}

function isValidViewingSeason(
  year: number,
  activeSeason: number,
  currentYear = new Date().getFullYear(),
): boolean {
  return Number.isInteger(year)
    && year >= activeSeason - 10
    && year <= getMaxViewingSeason(activeSeason, currentYear)
    && year >= MIN_SEASON_YEAR;
}

function clampViewingSeason(
  year: number,
  activeSeason: number,
  currentYear = new Date().getFullYear(),
): number {
  return isValidViewingSeason(year, activeSeason, currentYear) ? year : activeSeason;
}

function getAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return new Set();
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseBody(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  return raw;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateHistory(value: unknown): HistoryTurn[] | { error: string } {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return { error: 'Invalid history' };
  if (value.length === 0) return [];
  if (value.length > MAX_HISTORY_MESSAGES || value.length % 2 !== 0) {
    return { error: 'Invalid history' };
  }

  const turns: HistoryTurn[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isPlainObject(item)) return { error: 'Invalid history' };
    const expected: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant';
    if (item.role !== expected || typeof item.content !== 'string') {
      return { error: 'Invalid history' };
    }
    const trimmed = item.content.trim();
    if (trimmed.length < 1 || trimmed.length > MAX_HISTORY_ITEM_LENGTH) {
      return { error: 'Invalid history' };
    }
    turns.push({ role: expected, content: trimmed });
  }

  if (turns[0]?.role !== 'user' || turns[turns.length - 1]?.role !== 'assistant') {
    return { error: 'Invalid history' };
  }
  return turns;
}

function truncateAnswer(answer: string): string {
  if (answer.length <= MAX_ANSWER_CHARS) return answer;
  const slice = answer.slice(0, MAX_ANSWER_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > MAX_ANSWER_CHARS * 0.6) {
    return slice.slice(0, lastSpace).trimEnd();
  }
  return slice;
}

function buildSystemPrompt(seasonYear: number): string {
  return `You are the AcreLedger farm-data assistant. Answer only from tool results. Current viewing season year: ${seasonYear}. Call tools to look up records. If results are empty, say so plainly — never invent dates, varieties, acres, or products. Answer in 1–4 plain sentences. You cannot change records. If asked to delete, update, or insert, refuse. Bin contents are physical inventory across every season. Follow-up questions refer to the same farm and season unless the user says otherwise; still call tools rather than reusing stale numbers.`;
}

interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: unknown;
  };
}

interface OpenRouterChoice {
  finishReason: string | null;
  content: string | null;
  toolCalls: OpenRouterToolCall[];
  assistantMessage: Record<string, unknown>;
}

function parseOpenRouterChoice(resp: Record<string, unknown>): OpenRouterChoice | null {
  const choices = resp.choices;
  if (!Array.isArray(choices) || !isPlainObject(choices[0])) return null;

  const choice = choices[0];
  if (!isPlainObject(choice.message)) return null;
  const rawMessage = choice.message;
  const content = typeof rawMessage.content === 'string' ? rawMessage.content : null;
  const toolCalls: OpenRouterToolCall[] = [];

  if (Array.isArray(rawMessage.tool_calls)) {
    for (const rawCall of rawMessage.tool_calls) {
      if (!isPlainObject(rawCall) || typeof rawCall.id !== 'string' || !isPlainObject(rawCall.function)) {
        continue;
      }
      if (typeof rawCall.function.name !== 'string') continue;
      toolCalls.push({
        id: rawCall.id,
        type: 'function',
        function: {
          name: rawCall.function.name,
          arguments: rawCall.function.arguments,
        },
      });
    }
  }

  const assistantMessage: Record<string, unknown> = {
    role: 'assistant',
    content,
  };
  if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
  if (Array.isArray(rawMessage.reasoning_details)) {
    assistantMessage.reasoning_details = rawMessage.reasoning_details;
  } else if (typeof rawMessage.reasoning === 'string') {
    assistantMessage.reasoning = rawMessage.reasoning;
  }

  return {
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    content,
    toolCalls,
    assistantMessage,
  };
}

const OPENROUTER_TOOLS = TOOL_DEFINITIONS.map(({ name, description, parameters }) => ({
  type: 'function',
  function: { name, description, parameters },
}));

function looksLikeWriteRefusal(answer: string): boolean {
  return WRITE_REFUSAL_RE.test(answer);
}

function toolOutputForModel(result: ToolResult): ToolResult {
  if (!result.error) return result;
  if (
    result.error === INVALID_ARGS_ERROR
    || result.error === UNKNOWN_TOOL_ERROR
    || result.error === 'tool budget exceeded'
    || result.error === TOO_MANY_ROWS_ERROR
  ) {
    return { error: result.error };
  }
  console.error('AI assistant tool lookup failed:', result.error);
  return { error: 'lookup failed' };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const origin = headerValue(req.headers.origin);
  const allowedOrigins = getAllowedOrigins();

  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (!allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorizationHeader = headerValue(req.headers.authorization);
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authorizationHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server configuration error: missing Supabase credentials' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  let userId: string;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    userId = user.id;
  } catch {
    return res.status(500).json({ error: 'Authentication service error' });
  }

  const parsedBody = parseBody(req.body);
  if (!isPlainObject(parsedBody)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const questionRaw = parsedBody.question;
  if (typeof questionRaw !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }
  const question = questionRaw.trim();
  if (question.length < 1 || question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: 'Question must be between 1 and 500 characters' });
  }

  const historyResult = validateHistory(parsedBody.history);
  if ('error' in historyResult) {
    return res.status(400).json({ error: historyResult.error });
  }
  const history = historyResult;

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Assistant is unavailable.' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('farm_id, active_season')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('AI assistant profile error:', profileError);
    return res.status(500).json({ error: 'Assistant is unavailable.' });
  }

  const farmId = typeof profile?.farm_id === 'string' ? profile.farm_id : '';
  if (!farmId) {
    return res.status(400).json({ error: 'No farm selected.' });
  }

  const activeSeason = typeof profile?.active_season === 'number' && Number.isInteger(profile.active_season)
    ? profile.active_season
    : new Date().getFullYear();
  const requestedSeason = typeof parsedBody.viewingSeason === 'number'
    ? parsedBody.viewingSeason
    : Number.NaN;
  const seasonYear = clampViewingSeason(requestedSeason, activeSeason);

  const { data: consumeData, error: consumeError } = await supabase.rpc(
    'consume_ai_assistant_request',
    { p_question: question },
  );
  if (consumeError) {
    console.error('AI assistant quota error:', consumeError);
    return res.status(503).json({ error: 'Assistant is temporarily unavailable.' });
  }

  const consumePayload: Record<string, unknown> = isPlainObject(consumeData)
    ? consumeData
    : { allowed: consumeData };
  if (consumePayload.allowed !== true) {
    return res.status(429).json({ error: 'Daily question limit reached.' });
  }
  const turnId = typeof consumePayload.turn_id === 'string' ? consumePayload.turn_id : null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HANDLER_TIMEOUT_MS);
  const model = process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free';
  const lookups: string[] = [];

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: buildSystemPrompt(seasonYear) },
    ...history.map(turn => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: question },
  ];

  const finalizeBestEffort = async (finalAnswer: string, finalLookups: string[]) => {
    if (!turnId) return;
    try {
      const { error } = await supabase.rpc('finalize_ai_assistant_turn', {
        p_turn_id: turnId,
        p_answer: finalAnswer,
        p_lookups: finalLookups,
      });
      if (error) console.error('AI assistant finalize error:', error);
    } catch (err) {
      console.error('AI assistant finalize error:', err);
    }
  };

  try {
    let executed = 0;
    let answer: string | null = null;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const allowTools = round < MAX_TOOL_ROUNDS && executed < MAX_TOOL_EXECUTIONS;
      const requestBody: Record<string, unknown> = {
        model,
        messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        provider: {
          data_collection: 'deny',
          require_parameters: true,
        },
      };
      if (allowTools) {
        requestBody.tools = OPENROUTER_TOOLS;
        requestBody.tool_choice = 'auto';
      }

      const openRouterRes = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'X-OpenRouter-Title': 'AcreLedger',
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      let resp: unknown;
      try {
        const text = await openRouterRes.text();
        resp = JSON.parse(text) as unknown;
      } catch {
        await finalizeBestEffort(FALLBACK_ANSWER, lookups);
        return res.status(502).json({ error: 'Assistant is unavailable.' });
      }

      if (!openRouterRes.ok || !isPlainObject(resp)) {
        console.error('AI assistant OpenRouter error:', openRouterRes.status);
        await finalizeBestEffort(FALLBACK_ANSWER, lookups);
        return res.status(502).json({ error: 'Assistant is unavailable.' });
      }

      const parsedChoice = parseOpenRouterChoice(resp);
      if (!parsedChoice) {
        await finalizeBestEffort(FALLBACK_ANSWER, lookups);
        return res.status(502).json({ error: 'Assistant is unavailable.' });
      }

      if (parsedChoice.finishReason === 'length') {
        answer = FALLBACK_ANSWER;
        break;
      }

      if (parsedChoice.toolCalls.length === 0) {
        answer = parsedChoice.content;
        break;
      }

      if (!allowTools) break;
      messages.push(parsedChoice.assistantMessage);

      for (const call of parsedChoice.toolCalls) {
        let result: ToolResult;
        if (executed < MAX_TOOL_EXECUTIONS) {
          try {
            result = await executeNamedTool(call.function.name, call.function.arguments, {
              supabase,
              seasonYear,
              farmId,
            });
          } catch (err) {
            console.error('AI assistant tool error:', err);
            result = { error: 'lookup failed' };
          }
          executed += 1;
          if (result.lookup && !result.error) {
            lookups.push(result.lookup);
          }
          result = toolOutputForModel(result);
        } else {
          result = { error: 'tool budget exceeded' };
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!answer) answer = FALLBACK_ANSWER;
    if (lookups.length === 0 && !looksLikeWriteRefusal(answer)) {
      answer = FALLBACK_ANSWER;
    }
    answer = truncateAnswer(answer);

    await finalizeBestEffort(answer, lookups);
    return res.status(200).json({ answer, lookups });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      await finalizeBestEffort(FALLBACK_ANSWER, lookups);
      return res.status(504).json({ error: 'Assistant request timed out' });
    }
    console.error('AI assistant error:', err);
    await finalizeBestEffort(FALLBACK_ANSWER, lookups);
    return res.status(502).json({ error: 'Assistant is unavailable.' });
  } finally {
    clearTimeout(timeoutId);
  }
}
