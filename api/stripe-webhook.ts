import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertTestModeBilling,
  buildSubscriptionUpsert,
  isUniqueViolation,
  readSubscriptionMetadata,
  type StripeSubscriptionLike,
} from '../server/billing.js';

// Stripe signs the raw request body, so Vercel's JSON body parser must stay off.
export const config = { api: { bodyParser: false } };

interface WebhookRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator](): AsyncIterableIterator<unknown>;
}

interface ApiResponse {
  setHeader(name: string, value: string): ApiResponse;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  end(): void;
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? null;
}

async function readRawBody(req: WebhookRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/**
 * Upsert the entitlement row for `farmId` from a Stripe subscription.
 * Creates the row (stamping the farm owner from checkout metadata) or updates
 * the single active row; soft-deleted history is never touched or hard-deleted.
 * Returns false when the payload cannot be attributed to a farm.
 */
export async function upsertFarmSubscriptionEntitlement(
  supabase: SupabaseClient,
  subscription: StripeSubscriptionLike,
  metadata: Record<string, string> | null | undefined,
): Promise<boolean> {
  const { farmId, userId } = readSubscriptionMetadata(
    metadata ?? subscription.metadata ?? null,
  );
  if (!farmId) {
    console.error('Stripe subscription without farm_id metadata; skipping upsert.');
    return false;
  }

  const { data: existing } = await supabase
    .from('farm_subscriptions')
    .select('id, owner_user_id')
    .eq('farm_id', farmId)
    .is('deleted_at', null)
    .maybeSingle();

  const ownerId = userId ?? existing?.owner_user_id ?? null;
  if (!ownerId) {
    console.error(`No owner resolvable for farm ${farmId}; skipping subscription upsert.`);
    return false;
  }

  const payload = {
    ...buildSubscriptionUpsert(subscription),
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase
        .from('farm_subscriptions')
        .update(payload)
        .eq('id', existing.id)
        .eq('farm_id', farmId)
    : await supabase
        .from('farm_subscriptions')
        .insert({ ...payload, farm_id: farmId, owner_user_id: ownerId });
  if (error) {
    console.error('Failed to upsert farm subscription:', error.message);
    return false;
  }
  return true;
}

async function retrieveAndUpsertSubscription(
  stripe: Stripe,
  supabase: SupabaseClient,
  subscriptionId: string,
  metadata: Record<string, string> | null | undefined,
): Promise<boolean> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return upsertFarmSubscriptionEntitlement(supabase, subscription, metadata);
}

/**
 * Stripe v18 (basil) moved the invoice's subscription under
 * `parent.subscription_details.subscription`; older payloads exposed it as a
 * top-level `subscription` string. Accept both shapes defensively.
 */
function readInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const nested = invoice.parent?.subscription_details?.subscription;
  if (typeof nested === 'string' && nested) return nested;
  if (nested && typeof nested === 'object' && nested.id) return nested.id;
  return null;
}

export default async function handler(req: WebhookRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const billingCheck = assertTestModeBilling(process.env);
  if (!billingCheck.ok) {
    return res.status(403).json({ error: billingCheck.reason });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ error: 'Server configuration error: missing webhook secret' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error: missing Supabase credentials' });
  }

  const stripe = new Stripe(billingCheck.config.secretKey);

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    const signature = getHeader(req.headers, 'stripe-signature');
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return res.status(400).json({ error: 'Invalid webhook signature or payload' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // ---------- Idempotency ledger: the first insert wins, replays are duplicates ----------
  const { error: ledgerError } = await supabase
    .from('billing_webhook_events')
    .insert({ stripe_event_id: event.id, type: event.type });
  if (ledgerError) {
    if (isUniqueViolation(ledgerError)) {
      return res.status(200).json({ received: true, duplicate: true });
    }
    console.error('Failed to record billing webhook event:', ledgerError.message);
    return res.status(500).json({ error: 'Failed to record webhook event' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          // Fetch the full subscription so the entitlement row lands complete
          // even if the paired customer.subscription.created event was missed.
          await retrieveAndUpsertSubscription(stripe, supabase, subscriptionId, session.metadata ?? null);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // Deleted subscriptions map to status "canceled"; the row is kept as
        // history (soft state) and access is denied by status, not by deletion.
        const subscription = event.data.object as Stripe.Subscription;
        await upsertFarmSubscriptionEntitlement(supabase, subscription, subscription.metadata);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // Renewals and dunning also emit customer.subscription.updated; this
        // re-sync guarantees the mirror stays correct if that event was missed.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = readInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          await retrieveAndUpsertSubscription(stripe, supabase, subscriptionId, null);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err: unknown) {
    console.error('Billing webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  return res.status(200).json({ received: true });
}
