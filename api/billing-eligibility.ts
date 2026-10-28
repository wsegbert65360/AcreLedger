import { createClient } from '@supabase/supabase-js';
import { getBillingCapabilities, isBillingAllowlisted } from '../server/billing.js';

type QueryValue = string | string[] | undefined;

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, QueryValue>;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): ApiResponse;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  end(): void;
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? null;
}

function getAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return new Set();
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

/**
 * Mirror of the client's cleanEnvValue (src/lib/supabase.ts): Vercel env
 * values pasted with surrounding quotes or whitespace otherwise break the
 * Supabase client bootstrap (a quoted anon key fails every getUser call).
 */
function cleanEnvValue(value: string | undefined): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Compact JWT shape: exactly three non-empty base64url segments.
 * Checked before Supabase config so a missing or garbage bearer value
 * cannot turn into a configuration 500. Real access tokens stay far
 * below the length cap.
 */
const MAX_BEARER_TOKEN_LENGTH = 8192;
const JWT_COMPACT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function isJwtShapedBearerToken(token: string): boolean {
  if (token.length === 0 || token.length > MAX_BEARER_TOKEN_LENGTH) return false;
  return JWT_COMPACT_SHAPE.test(token);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // ---------- CORS ----------
  const origin = getHeader(req.headers, 'origin');
  const allowedOrigins = getAllowedOrigins();

  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (!allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ---------- Auth ----------
  const authHeader = getHeader(req.headers, 'authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.slice(7).trim();
  if (!isJwtShapedBearerToken(token)) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const supabaseUrl = cleanEnvValue(process.env.SUPABASE_URL);
  const supabaseAnonKey = cleanEnvValue(process.env.SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      if (authError) {
        console.error(authError.message);
      }
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Identity comes only from the verified token. Query/body claims are ignored.
    const email = typeof user.email === 'string' ? user.email : null;
    const allowlisted = isBillingAllowlisted(
      { email, userId: user.id },
      process.env.BILLING_ALLOWLIST,
    );
    return res.status(200).json(getBillingCapabilities(allowlisted, process.env));
  } catch (err: unknown) {
    console.error('Billing eligibility error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
