import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertTestModeBilling,
  buildSubscriptionUpsert,
  isUniqueViolation,
  readSubscriptionMetadata,
  resolvePastDueSince,
  shouldApplySubscriptionSnapshot,
  type PastDueSignal,
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
 * Throws on database write failures so the handler responds 500 and Stripe
 * retries; returns false when the payload cannot be attributed to a farm
 * (a permanent condition the handler acknowledges as ignored).
 */
export interface EntitlementUpsertOptions {
  checkoutCompleted?: boolean;
  /** Defaults to a subscription snapshot when the caller does not say. */
  pastDueSignal?: PastDueSignal;
  /** Stripe event or invoice timestamp (unix seconds). Omitted → processing time. */
  eventEpochSeconds?: number | null;
}

export async function upsertFarmSubscriptionEntitlement(
  supabase: SupabaseClient,
  subscription: StripeSubscriptionLike,
  metadata: Record<string, string> | null | undefined,
  options: EntitlementUpsertOptions = {},
): Promise<boolean> {
  const { farmId, userId } = readSubscriptionMetadata(
    metadata ?? subscription.metadata ?? null,
  );
  if (!farmId) {
    console.error('Stripe subscription without farm_id metadata; skipping upsert.');
    return false;
  }

  const { data: existing, error: selectError } = await supabase
    .from('farm_subscriptions')
    .select('id, owner_user_id, stripe_subscription_id, stripe_subscription_created_at, updated_at, past_due_since')
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
    return false;
  }

  if (!shouldApplySubscriptionSnapshot(existing, subscription, options.checkoutCompleted === true)) {
    console.warn(
      `Ignoring stale Stripe subscription ${subscription.id} for farm ${farmId}; current subscription is ${existing?.stripe_subscription_id}.`,
    );
    return false;
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
      return false;
    }
  }

  const ownerId = existing?.owner_user_id ?? userId ?? null;
  if (!ownerId) {
    console.error(`No owner resolvable for farm ${farmId}; skipping subscription upsert.`);
    return false;
  }

  const mapped = buildSubscriptionUpsert(subscription);
  const payload = {
    ...mapped,
    past_due_since: resolvePastDueSince({
      existingPastDueSince: existing?.past_due_since ?? null,
      status: mapped.status,
      signal: options.pastDueSignal ?? 'subscription',
      eventEpochSeconds: options.eventEpochSeconds,
    }),
    updated_at: new Date().toISOString(),
  };

  let writeResult;
  if (existing) {
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
  if (existing && count !== 1) {
    throw new Error(`Failed to upsert farm subscription: expected 1 row, updated ${count ?? 0}`);
  }
  return true;
}

async function retrieveAndUpsertSubscription(
  stripe: Stripe,
  supabase: SupabaseClient,
  subscriptionId: string,
  metadata: Record<string, string> | null | undefined,
  options: EntitlementUpsertOptions = {},
): Promise<boolean> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return upsertFarmSubscriptionEntitlement(supabase, subscription, metadata, options);
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

/** Prefer the Stripe event time, then the invoice's paid or created time. */
function readBillingEventEpoch(
  event: { created?: number | null },
  invoice?: {
    created?: number | null;
    status_transitions?: { paid_at?: number | null } | null;
  } | null,
): number | null {
  if (typeof event.created === 'number' && Number.isFinite(event.created)) return event.created;
  const paidAt = invoice?.status_transitions?.paid_at;
  if (typeof paidAt === 'number' && Number.isFinite(paidAt)) return paidAt;
  if (invoice && typeof invoice.created === 'number' && Number.isFinite(invoice.created)) {
    return invoice.created;
  }
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

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // ---------- Idempotency ledger: completed events are skipped; failed claims retry ----------
  const { error: ledgerError } = await supabase
    .from('billing_webhook_events')
    .insert({ stripe_event_id: event.id, type: event.type });
  if (ledgerError) {
    if (isUniqueViolation(ledgerError)) {
      const { data: ledger, error: readLedgerError } = await supabase
        .from('billing_webhook_events')
        .select('processed_at')
        .eq('stripe_event_id', event.id)
        .maybeSingle();
      if (readLedgerError) {
        console.error('Failed to read billing webhook event:', readLedgerError.message);
        return res.status(500).json({ error: 'Failed to read webhook event' });
      }
      if (ledger?.processed_at) {
        return res.status(200).json({ received: true, duplicate: true });
      }
    }
    if (!isUniqueViolation(ledgerError)) {
      console.error('Failed to record billing webhook event:', ledgerError.message);
      return res.status(500).json({ error: 'Failed to record webhook event' });
    }
  }

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
          await retrieveAndUpsertSubscription(
            stripe,
            supabase,
            subscriptionId,
            session.metadata ?? null,
            {
              checkoutCompleted: true,
              pastDueSignal: 'subscription',
              eventEpochSeconds: event.created,
            },
          );
        } else {
          console.warn('Ignoring completed Checkout session without matching AcreLedger farm evidence.');
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // Deleted subscriptions map to status "canceled"; the row is kept.
        // A normal cancel leaves past_due_since null (Pro through the paid
        // period). A cancel after a failed payment keeps the failure anchor.
        const subscription = event.data.object as Stripe.Subscription;
        await retrieveAndUpsertSubscription(
          stripe,
          supabase,
          subscription.id,
          subscription.metadata,
          { pastDueSignal: 'subscription', eventEpochSeconds: event.created },
        );
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        // Renewals and dunning also emit customer.subscription.updated; this
        // re-sync guarantees the mirror stays correct if that event was missed.
        // The invoice event itself arms or clears past_due_since.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = readInvoiceSubscriptionId(invoice);
        if (subscriptionId) {
          await retrieveAndUpsertSubscription(stripe, supabase, subscriptionId, null, {
            pastDueSignal: event.type === 'invoice.payment_failed' ? 'payment_failed' : 'payment_succeeded',
            eventEpochSeconds: readBillingEventEpoch(event, invoice),
          });
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
    .update({ processed_at: new Date().toISOString() }, { count: 'exact' })
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
