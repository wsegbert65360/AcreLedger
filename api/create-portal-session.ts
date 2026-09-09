import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  assertTestModeBilling,
  canOpenPortal,
  isBillingAllowlisted,
} from '../server/billing.js';

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

  // ---------- Test-mode billing gate (fails closed) ----------
  const billing = assertTestModeBilling(process.env);
  if (!billing.ok) {
    return res.status(403).json({ error: billing.reason });
  }

  // ---------- Auth ----------
  const authHeader = getHeader(req.headers, 'authorization');
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

    // ---------- Farm scope from the caller's own profile (RLS applies) ----------
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, farm_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.farm_id) {
      return res.status(400).json({ error: 'No farm selected.' });
    }
    const farmId = profile.farm_id;

    // ---------- Internal rollout allowlist ----------
    const email = typeof user.email === 'string' ? user.email : null;
    if (!isBillingAllowlisted({ email, userId: user.id }, process.env.BILLING_ALLOWLIST)) {
      return res.status(403).json({ error: 'Billing is coming soon.' });
    }

    // ---------- Owner + subscription gate ----------
    const { data: existing } = await supabase
      .from('farm_subscriptions')
      .select('owner_user_id, stripe_customer_id, deleted_at')
      .eq('farm_id', farmId)
      .maybeSingle();

    const portalGate = canOpenPortal(existing, user.id);
    if (!portalGate.ok) {
      if (portalGate.reason === 'no_subscription') {
        return res.status(400).json({ error: 'No billing subscription found for this farm.' });
      }
      if (portalGate.reason === 'not_owner') {
        return res.status(403).json({ error: 'Only the farm owner can manage billing.' });
      }
      return res.status(400).json({ error: 'Billing is not configured for this subscription yet.' });
    }

    if (!origin) {
      return res.status(400).json({ error: 'Missing origin header' });
    }

    // ---------- Hosted Customer Portal ----------
    const stripe = new Stripe(billing.config.secretKey);
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: existing!.stripe_customer_id!,
        return_url: `${origin}/settings?billing=portal`,
      });
      if (!portal.url) {
        return res.status(502).json({ error: 'Stripe did not return a portal URL' });
      }
      return res.status(200).json({ url: portal.url });
    } catch (err: unknown) {
      console.error('Stripe portal session error:', err);
      return res.status(502).json({ error: 'Failed to open billing portal' });
    }
  } catch (err: unknown) {
    console.error('Create portal session error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
