import { createClient } from '@supabase/supabase-js';

type QueryValue = string | string[] | undefined;

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, QueryValue>;
}

interface ApiResponse {
  setHeader(name: string, value: string): ApiResponse;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  end(): void;
}

const VC_BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

// Only these query parameters are forwarded to Visual Crossing (location/endpoint are path-based).
const ALLOWED_QUERY_PARAMS = new Set(['unitGroup', 'contentType', 'include', 'elements']);

const MAX_LOCATION_LENGTH = 1000;
const MAX_ENDPOINT_LENGTH = 200;
const VC_TIMEOUT_MS = 10_000;
const ENDPOINT_RE = /^[a-zA-Z0-9\-/]+$/;

function getAllowedOrigins(): Set<string> {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return new Set();
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // ---------- CORS ----------
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const allowedOrigins = getAllowedOrigins();

  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (!allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

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
  const authorizationHeader = req.headers.authorization;
  const authHeader = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.slice(7).trim();
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

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch {
    return res.status(500).json({ error: 'Authentication service error' });
  }

  // ---------- Validate query params ----------
  const { location, endpoint, ...restParams } = req.query;

  if (typeof location !== 'string' || location.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid location parameter' });
  }
  if (location.length > MAX_LOCATION_LENGTH) {
    return res.status(400).json({ error: 'Location parameter too long' });
  }

  if (endpoint !== undefined) {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      return res.status(400).json({ error: 'Invalid endpoint parameter' });
    }
    if (endpoint.length > MAX_ENDPOINT_LENGTH) {
      return res.status(400).json({ error: 'Endpoint parameter too long' });
    }
    if (!ENDPOINT_RE.test(endpoint)) {
      return res.status(400).json({ error: 'Invalid endpoint parameter format' });
    }
  }

  const unknownParams = Object.keys(restParams).filter(k => !ALLOWED_QUERY_PARAMS.has(k));
  if (unknownParams.length > 0) {
    return res.status(400).json({ error: `Unknown query parameters: ${unknownParams.join(', ')}` });
  }

  const invalidParams = Object.entries(restParams)
    .filter(([, value]) => typeof value !== 'string')
    .map(([key]) => key);
  if (invalidParams.length > 0) {
    return res.status(400).json({ error: `Invalid query parameters: ${invalidParams.join(', ')}` });
  }

  // ---------- Durable per-user quota ----------
  const { data: rateLimitAllowed, error: rateLimitError } = await supabase
    .rpc('consume_weather_proxy_request');
  if (rateLimitError) {
    console.error('Weather proxy rate-limit error:', rateLimitError);
    return res.status(503).json({ error: 'Weather service temporarily unavailable' });
  }
  if (rateLimitAllowed !== true) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Weather request limit exceeded' });
  }

  // ---------- Build target URL ----------
  const VC_KEY = process.env.VISUALCROSSING_API_KEY;
  if (!VC_KEY) {
    return res.status(500).json({ error: 'Server configuration error: missing Visual Crossing API key' });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(restParams)) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }
  params.set('key', VC_KEY);

  // Encode each path segment individually so forward slashes in the endpoint remain path separators.
  const pathLocation = encodeURIComponent(location);
  const pathEndpoint = endpoint && typeof endpoint === 'string'
    ? '/' + endpoint.split('/').filter(Boolean).map(s => encodeURIComponent(s)).join('/')
    : '';
  const targetUrl = `${VC_BASE_URL}/${pathLocation}${pathEndpoint}?${params.toString()}`;

  // ---------- Fetch with timeout ----------
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VC_TIMEOUT_MS);

  try {
    const fetchRes = await fetch(targetUrl, { signal: controller.signal });
    const data = await fetchRes.json();
    return res.status(fetchRes.status).json(data);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return res.status(504).json({ error: 'Weather API request timed out' });
    }
    console.error('Weather Proxy Error:', err);
    return res.status(502).json({ error: 'Weather API request failed' });
  } finally {
    clearTimeout(timeoutId);
  }
}
