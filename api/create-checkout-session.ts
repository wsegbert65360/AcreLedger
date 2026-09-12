import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  TRIAL_PERIOD_DAYS,
  assertTestModeBilling,
  buildCheckoutIdempotencyKey,
  canStartCheckout,
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
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, farm_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      console.error('Failed to resolve billing profile:', profileError.message);
      return res.status(500).json({ error: 'Could not resolve billing account' });
    }
    if (!profile?.farm_id) {
      return res.status(400).json({ error: 'No farm selected.' });
    }
    const farmId = profile.farm_id;

    // ---------- Internal rollout allowlist ----------
    const email = typeof user.email === 'string' ? user.email : null;
    if (!isBillingAllowlisted({ email, userId: user.id }, process.env.BILLING_ALLOWLIST)) {
      return res.status(403).json({ error: 'Billing is coming soon.' });
    }

    // ---------- Owner gate ----------
    const { data: existing, error: subscriptionError } = await supabase
      .from('farm_subscriptions')
      .select('owner_user_id, status, deleted_at, stripe_subscription_id')
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .maybeSingle();
    if (subscriptionError) {
      console.error('Failed to read farm subscription:', subscriptionError.message);
      return res.status(500).json({ error: 'Could not verify billing status' });
    }

    const checkoutGate = canStartCheckout(existing, user.id);
    if (!checkoutGate.ok) {
      if (checkoutGate.reason === 'not_owner') {
        return res.status(403).json({ error: 'Only the farm owner can start billing.' });
      }
      return res.status(409).json({ error: 'This farm already has an active subscription.' });
    }

    // ---------- Hosted Checkout (privacy link only; ToS is deferred) ----------
    if (!origin) {
      return res.status(400).json({ error: 'Missing origin header' });
    }

    const stripe = new Stripe(billing.config.secretKey);
    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          // Locked product answer: the card is always collected at checkout so
          // the yearly renewal just works after the 122-day trial.
          payment_method_collection: 'always',
          line_items: [{ price: billing.config.priceId, quantity: 1 }],
          subscription_data: {
            trial_period_days: TRIAL_PERIOD_DAYS,
            metadata: { farm_id: farmId, user_id: user.id },
          },
          metadata: { farm_id: farmId, user_id: user.id },
          client_reference_id: farmId,
          customer_email: email ?? undefined,
          consent_collection: { terms_of_service: 'none' },
          success_url: `${origin}/settings?billing=success`,
          cancel_url: `${origin}/settings?billing=cancelled`,
        },
        { idempotencyKey: buildCheckoutIdempotencyKey(farmId, existing) },
      );
      if (!session.url) {
        return res.status(502).json({ error: 'Stripe did not return a checkout URL' });
      }
      return res.status(200).json({ url: session.url });
    } catch (err: unknown) {
      console.error('Stripe checkout session error:', err);
      return res.status(502).json({ error: 'Failed to start checkout' });
    }
  } catch (err: unknown) {
    console.error('Create checkout session error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
