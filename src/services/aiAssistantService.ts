const ASSISTANT_PATH = '/api/ai-assistant';

function cleanEnvValue(value?: string): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

const AI_ASSISTANT_URL = cleanEnvValue(import.meta.env.VITE_AI_ASSISTANT_URL);
const IS_CAPACITOR_BUILD = import.meta.env.MODE === 'capacitor';

export type AiHistoryTurn = { role: 'user' | 'assistant'; content: string };

export interface AiAnswer {
  answer: string;
  lookups: string[];
}

export function resolveAiAssistantUrl(): string {
  if (!AI_ASSISTANT_URL) {
    if (IS_CAPACITOR_BUILD) {
      throw new Error('Capacitor Ask the book requires VITE_AI_ASSISTANT_URL.');
    }
    return ASSISTANT_PATH;
  }

  const normalized = AI_ASSISTANT_URL.replace(/\/+$/, '');
  const parsedUrl = new URL(normalized);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
    throw new Error('VITE_AI_ASSISTANT_URL must use HTTPS');
  }

  return normalized.endsWith(ASSISTANT_PATH) ? normalized : `${normalized}${ASSISTANT_PATH}`;
}

export async function askAcreLedger(
  question: string,
  accessToken: string,
  viewingSeason: number,
  history: AiHistoryTurn[] = [],
): Promise<AiAnswer> {
  const url = resolveAiAssistantUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, viewingSeason, history }),
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const message = payload
      && typeof payload === 'object'
      && 'error' in payload
      && typeof (payload as { error: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : 'The assistant is unavailable right now.';
    throw new Error(message);
  }

  if (
    !payload
    || typeof payload !== 'object'
    || typeof (payload as { answer?: unknown }).answer !== 'string'
  ) {
    throw new Error('The assistant is unavailable right now.');
  }

  const lookupsRaw = (payload as { lookups?: unknown }).lookups;
  const lookups = Array.isArray(lookupsRaw)
    ? lookupsRaw.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    answer: (payload as { answer: string }).answer,
    lookups,
  };
}
