import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertTestModeBilling,
  buildSubscriptionUpsert,
  isUniqueViolation,
  readSubscriptionMetadata,
  shouldApplySubscriptionSnapshot,
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

type ProcessingResult = { applied: true } | { applied: false; reason: string };

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? null;
}

function cleanEnvValue(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export async function readRawBody(req: WebhookRequest): Promise<Buffer> {
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
 * Throws on database write failures so the handler responds 500 and Stripe
 * retries; returns false when the payload cannot be attributed to a farm
 * (a permanent condition the handler acknowledges as ignored).
 */
export async function upsertFarmSubscriptionEntitlement(
  supabase: SupabaseClient,
  subscription: StripeSubscriptionLike,
  metadata: Record<string, string> | null | undefined,
  options: { checkoutCompleted?: boolean; failureAt?: string | null } = {},
): Promise<ProcessingResult> {
  const { farmId, userId } = readSubscriptionMetadata(
    metadata ?? subscription.metadata ?? null,
  );
  if (!farmId) {
    console.error('Stripe subscription without farm_id metadata; skipping upsert.');
    return { applied: false, reason: 'missing_farm_metadata' };
  }

  const { data: existing, error: selectError } = await supabase
    .from('farm_subscriptions')
    .select('id, owner_user_id, status, stripe_subscription_id, stripe_subscription_created_at, past_due_since, updated_at')
    .eq('farm_id', farmId)
    .is('deleted_at', null)
    .maybeSingle();
  if (selectError) {
    throw new Error(`Failed to read farm subscription: ${selectError.message}`);
  }

  const isReplacement = Boolean(
    existing?.stripe_subscription_id && existing.stripe_subscription_id !== subscription.id,
  );
  if ((!existing || isReplacement) && options.checkoutCompleted !== true) {
    console.warn(
      `Ignoring Stripe subscription ${subscription.id} for farm ${farmId} without completed Checkout evidence.`,
    );
    return { applied: false, reason: 'missing_checkout_evidence' };
  }

  if (!shouldApplySubscriptionSnapshot(existing, subscription, options.checkoutCompleted === true)) {
    console.warn(
      `Ignoring stale Stripe subscription ${subscription.id} for farm ${farmId}; current subscription is ${existing?.stripe_subscription_id}.`,
    );
    return {
      applied: false,
      reason: existing?.status && ['trialing', 'active', 'past_due', 'unpaid'].includes(existing.status)
        ? 'parallel_live_subscription'
        : 'stale_subscription',
    };
  }

  if (userId && options.checkoutCompleted === true) {
    const { data: member, error: memberError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .eq('farm_id', farmId)
      .maybeSingle();
    if (memberError) {
      throw new Error(`Failed to verify checkout owner: ${memberError.message}`);
    }
    if (!member) {
      console.error(`Checkout owner ${userId} is not a member of farm ${farmId}; skipping upsert.`);
      return { applied: false, reason: 'checkout_owner_not_member' };
    }
  }

  const ownerId = existing?.owner_user_id ?? userId ?? null;
  if (!ownerId) {
    console.error(`No owner resolvable for farm ${farmId}; skipping subscription upsert.`);
    return { applied: false, reason: 'missing_owner' };
  }

  const payload = {
    ...buildSubscriptionUpsert(subscription),
    past_due_since:
      subscription.status === 'past_due'
        ? existing?.past_due_since ?? options.failureAt ?? new Date().toISOString()
        : null,
    updated_at: new Date().toISOString(),
  };

  let writeResult;
  if (existing && isReplacement) {
    writeResult = await supabase.rpc('replace_farm_subscription', {
      p_farm_id: farmId,
      p_current_id: existing.id,
      p_expected_subscription_id: existing.stripe_subscription_id,
      p_expected_updated_at: existing.updated_at,
      p_owner_user_id: ownerId,
      p_subscription: payload,
    });
  } else if (existing) {
    let update = supabase
      .from('farm_subscriptions')
      .update(payload, { count: 'exact' })
      .eq('id', existing.id)
      .eq('farm_id', farmId);
    update = existing.stripe_subscription_id == null
      ? update.is('stripe_subscription_id', null)
      : update.eq('stripe_subscription_id', existing.stripe_subscription_id);
    update = existing.stripe_subscription_created_at == null
      ? update.is('stripe_subscription_created_at', null)
      : update.eq('stripe_subscription_created_at', existing.stripe_subscription_created_at);
    update = existing.updated_at == null
      ? update.is('updated_at', null)
      : update.eq('updated_at', existing.updated_at);
    writeResult = await update;
  } else {
    writeResult = await supabase
        .from('farm_subscriptions')
        .insert({ ...payload, farm_id: farmId, owner_user_id: ownerId });
  }
  const { error, count } = writeResult;
  if (error) {
    throw new Error(`Failed to upsert farm subscription: ${error.message}`);
  }
  if (existing && !isReplacement && count !== 1) {
    throw new Error(`Failed to upsert farm subscription: expected 1 row, updated ${count ?? 0}`);
  }
  return { applied: true };
}

async function retrieveAndUpsertSubscription(
  stripe: Stripe,
  supabase: SupabaseClient,
  subscriptionId: string,
  metadata: Record<string, string> | null | undefined,
  options: { checkoutCompleted?: boolean; failureAt?: string | null } = {},
): Promise<ProcessingResult> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return upsertFarmSubscriptionEntitlement(supabase, subscription, metadata, options);
  } catch (error: unknown) {
    const code = error != null && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : null;
    if (code === 'resource_missing') {
      return { applied: false, reason: 'stripe_resource_missing' };
    }
    throw error;
  }
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
  const legacy = (invoice as Stripe.Invoice & {
    subscription?: string | { id?: string | null } | null;
  }).subscription;
  if (typeof legacy === 'string' && legacy) return legacy;
  if (legacy && typeof legacy === 'object' && legacy.id) return legacy.id;
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

  const webhookSecret = cleanEnvValue(process.env.STRIPE_WEBHOOK_SECRET);
  if (!webhookSecret) {
    return res.status(500).json({ error: 'Server configuration error: missing webhook secret' });
  }

  const supabaseUrl = cleanEnvValue(process.env.SUPABASE_URL);
  const supabaseServiceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
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

  if (event.livemode === true) {
    return res.status(403).json({ error: 'Live-mode webhook events are disabled' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // ---------- Idempotency ledger: completed events are skipped; failed claims retry ----------
  const claimedAt = new Date().toISOString();
  const { error: ledgerError } = await supabase
    .from('billing_webhook_events')
    .insert({ stripe_event_id: event.id, type: event.type, claimed_at: claimedAt });
  if (ledgerError) {
    if (isUniqueViolation(ledgerError)) {
      const { data: ledger, error: readLedgerError } = await supabase
        .from('billing_webhook_events')
        .select('processed_at, claimed_at')
        .eq('stripe_event_id', event.id)
        .maybeSingle();
      if (readLedgerError) {
        console.error('Failed to read billing webhook event:', readLedgerError.message);
        return res.status(500).json({ error: 'Failed to read webhook event' });
      }
      if (ledger?.processed_at) {
        return res.status(200).json({ received: true, duplicate: true });
      }
      const leaseMs = Date.parse(ledger?.claimed_at ?? '');
      if (Number.isFinite(leaseMs) && Date.now() - leaseMs < 5 * 60 * 1000) {
        return res.status(409).json({ error: 'Webhook event is already being processed' });
      }
      let reclaim = supabase
        .from('billing_webhook_events')
        .update({ claimed_at: claimedAt }, { count: 'exact' })
        .eq('stripe_event_id', event.id)
        .is('processed_at', null);
      reclaim = ledger?.claimed_at
        ? reclaim.eq('claimed_at', ledger.claimed_at)
        : reclaim.is('claimed_at', null);
      const { error: reclaimError, count: reclaimCount } = await reclaim;
      if (reclaimError || reclaimCount !== 1) {
        return res.status(409).json({ error: 'Webhook event is already being processed' });
      }
    }
    if (!isUniqueViolation(ledgerError)) {
      console.error('Failed to record billing webhook event:', ledgerError.message);
      return res.status(500).json({ error: 'Failed to record webhook event' });
    }
  }

  let outcome = 'unhandled';
  let reason: string | null = 'event_type_not_handled';
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const { farmId } = readSubscriptionMetadata(session.metadata);
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (
          subscriptionId &&
          farmId &&
          session.mode === 'subscription' &&
          session.client_reference_id === farmId
        ) {
          // Fetch the full subscription so the entitlement row lands complete
          // even if the paired customer.subscription.created event was missed.
          const result = await retrieveAndUpsertSubscription(
            stripe,
            supabase,
            subscriptionId,
            session.metadata ?? null,
            { checkoutCompleted: true },
          );
          outcome = result.applied ? 'applied' : 'ignored';
          reason = result.applied ? null : result.reason;
        } else {
          console.warn('Ignoring completed Checkout session without matching AcreLedger farm evidence.');
          outcome = 'ignored';
          reason = 'invalid_checkout_evidence';
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // Deleted subscriptions map to status "canceled"; the row is kept as
        // history (soft state) and access is denied by status, not by deletion.
        const subscription = event.data.object as Stripe.Subscription;
        const result = await retrieveAndUpsertSubscription(
          stripe,
          supabase,
          subscription.id,
          subscription.metadata,
        );
        outcome = result.applied ? 'applied' : 'ignored';
        reason = result.applied ? null : result.reason;
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // Renewals and dunning also emit customer.subscription.updated; this
        // re-sync guarantees the mirror stays correct if that event was missed.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = readInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const failureAt = event.type === 'invoice.payment_failed'
            ? new Date(event.created * 1000).toISOString()
            : null;
          const result = await retrieveAndUpsertSubscription(
            stripe,
            supabase,
            subscriptionId,
            null,
            { failureAt },
          );
          outcome = result.applied ? 'applied' : 'ignored';
          reason = result.applied ? null : result.reason;
        } else {
          outcome = 'ignored';
          reason = 'invoice_without_subscription';
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

  const { error: processedError, count: processedCount } = await supabase
    .from('billing_webhook_events')
    .update({ processed_at: new Date().toISOString(), outcome, reason }, { count: 'exact' })
    .eq('stripe_event_id', event.id);
  if (processedError || processedCount !== 1) {
    console.error(
      'Failed to finalize billing webhook event:',
      processedError?.message ?? `expected 1 row, updated ${processedCount ?? 0}`,
    );
    return res.status(500).json({ error: 'Failed to finalize webhook event' });
  }

  return res.status(200).json({ received: true });
}
