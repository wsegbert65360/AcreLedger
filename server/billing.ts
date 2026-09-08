/**
 * Shared pure billing helpers for the Stripe test-mode checkout endpoints
 * (api/create-checkout-session.ts, api/create-portal-session.ts,
 * api/stripe-webhook.ts). Kept dependency-free so `npm run typecheck:api`
 * and unit tests can exercise the rules without a Stripe client or network.
 *
 * Test mode only: every gate here fails closed. Live charges stay disabled
 * until Will approves legal copy (BILLING_LIVE_CHARGES must stay false).
 */

/** Locked product decision (Manager GO 2026-09-07): 4-month full-product trial. */
export const TRIAL_PERIOD_DAYS = 122;

/** Locked product decision: past_due farms keep access for a 3-day grace window. */
export const PAST_DUE_GRACE_DAYS = 3;

export type BillingStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete';

export interface TestModeBillingConfig {
  secretKey: string;
  priceId: string;
}

export type TestModeBillingCheck =
  | { ok: true; config: TestModeBillingConfig }
  | { ok: false; reason: string };

/**
 * Refuse unless the server is explicitly configured for Stripe TEST mode:
 * BILLING_LIVE_CHARGES must be absent or exactly "false", the secret key must
 * be a `sk_test_` key, and a yearly `price_...` ID must be present.
 */
export function assertTestModeBilling(
  env: Record<string, string | undefined>,
): TestModeBillingCheck {
  const liveCharges = env.BILLING_LIVE_CHARGES;
  if (liveCharges !== undefined && liveCharges.trim().toLowerCase() !== 'false') {
    return { ok: false, reason: 'Billing is not enabled: live charges are disallowed.' };
  }

  const secretKey = (env.STRIPE_SECRET_KEY ?? '').trim();
  if (!secretKey) {
    return { ok: false, reason: 'Billing is not configured: missing Stripe secret key.' };
  }
  if (!secretKey.startsWith('sk_test_')) {
    return { ok: false, reason: 'Billing is restricted to Stripe test mode keys.' };
  }

  const priceId = (env.STRIPE_PRICE_ID ?? '').trim();
  if (!priceId.startsWith('price_')) {
    return { ok: false, reason: 'Billing is not configured: missing Stripe price ID.' };
  }

  return { ok: true, config: { secretKey, priceId } };
}

/**
 * Internal rollout allowlist (comma-separated emails or user IDs). Empty or
 * missing allowlist means nobody passes: "coming soon" for everyone.
 */
export function parseBillingAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

/** A user passes if either their email or their user ID is on the allowlist. */
export function isBillingAllowlisted(
  identity: { email?: string | null; userId?: string | null } | null | undefined,
  raw: string | undefined,
): boolean {
  if (!identity) return false;
  const allowlist = parseBillingAllowlist(raw);
  if (allowlist.length === 0) return false;
  const email = identity.email?.trim().toLowerCase();
  const userId = identity.userId?.trim().toLowerCase();
  return (
    (email !== undefined && email !== null && email !== '' && allowlist.includes(email)) ||
    (userId !== undefined && userId !== null && userId !== '' && allowlist.includes(userId))
  );
}

export interface ExistingSubscriptionRow {
  owner_user_id: string;
  status: string;
  deleted_at: string | null;
}

export type CheckoutGate =
  | { ok: true }
  | { ok: false; reason: 'not_owner' | 'already_subscribed' };

/**
 * Owner gate for starting Checkout. With no active row the caller becomes the
 * recorded farm owner; an active row owned by someone else refuses; the owner
 * of an already trialing/active subscription is pointed at the portal instead.
 */
export function canStartCheckout(
  existing: ExistingSubscriptionRow | null | undefined,
  callerUserId: string,
): CheckoutGate {
  if (existing && !existing.deleted_at && existing.owner_user_id !== callerUserId) {
    return { ok: false, reason: 'not_owner' };
  }
  if (
    existing &&
    !existing.deleted_at &&
    existing.owner_user_id === callerUserId &&
    (existing.status === 'trialing' || existing.status === 'active')
  ) {
    return { ok: false, reason: 'already_subscribed' };
  }
  return { ok: true };
}

export interface PortalSubscriptionRow {
  owner_user_id: string;
  stripe_customer_id: string | null;
  deleted_at: string | null;
}

export type PortalGate =
  | { ok: true }
  | { ok: false; reason: 'no_subscription' | 'not_owner' | 'not_configured' };

/** Owner gate for the Customer Portal: needs an active row the caller owns. */
export function canOpenPortal(
  row: PortalSubscriptionRow | null | undefined,
  callerUserId: string,
): PortalGate {
  if (!row || row.deleted_at) return { ok: false, reason: 'no_subscription' };
  if (row.owner_user_id !== callerUserId) return { ok: false, reason: 'not_owner' };
  if (!row.stripe_customer_id) return { ok: false, reason: 'not_configured' };
  return { ok: true };
}

/** Map the Stripe subscription lifecycle onto the farm_subscriptions status set. */
export function mapStripeStatusToBillingStatus(status: string): BillingStatus {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
      return status;
    // Checkout abandoned without a payment method: no entitlement either way.
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

/** Minimal structural shape of a Stripe Subscription object (no SDK import). */
export interface StripeSubscriptionLike {
  id: string;
  status: string;
  customer?: string | { id?: string | null } | null;
  trial_end?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  metadata?: Record<string, string> | null;
  items?: {
    data?: Array<{ price?: { id?: string | null } | null } | undefined> | null;
  } | null;
}

function stripeEpochToIso(epochSeconds: number | null | undefined): string | null {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * Pure webhook mapper: Stripe subscription -> farm_subscriptions column
 * values. Optional fields are emitted as null, never undefined.
 */
export function buildSubscriptionUpsert(subscription: StripeSubscriptionLike): {
  status: BillingStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
} {
  const customer = subscription.customer;
  return {
    status: mapStripeStatusToBillingStatus(subscription.status),
    trial_ends_at: stripeEpochToIso(subscription.trial_end),
    current_period_end: stripeEpochToIso(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end === true,
    stripe_customer_id:
      typeof customer === 'string' ? customer : customer?.id != null ? customer.id : null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id ?? null,
  };
}

/** Checkout metadata is the only trusted source for the target farm/owner. */
export function readSubscriptionMetadata(
  metadata: Record<string, string> | null | undefined,
): { farmId: string | null; userId: string | null } {
  const farmId = metadata?.farm_id?.trim() || null;
  const userId = metadata?.user_id?.trim() || null;
  return { farmId, userId };
}

/** Webhook event types this handler upserts entitlements for. */
export const HANDLED_WEBHOOK_EVENT_TYPES: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

/** Postgres unique-violation SQLSTATE: signals an already-processed event. */
export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23505';
}
