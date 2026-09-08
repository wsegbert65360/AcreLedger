import { Capacitor } from '@capacitor/core';

import type { FarmSubscription, FarmSubscriptionStatus } from '@/types/farm';

/**
 * Client-side billing helpers for Stripe test-mode checkout (Ticket D).
 *
 * Billing is web-only for v1: the Billing settings card renders nothing under
 * Capacitor, so no Capacitor plugin is ever touched from here. Paywall
 * enforcement is OFF by default (BILLING_ENFORCE unset): a farm without a
 * subscription row keeps full access until the product owner says enforce.
 */

/** Locked product decision (Manager GO 2026-09-07): 4-month full-product trial. */
export const TRIAL_PERIOD_DAYS = 122;

/** Locked product decision: past_due farms keep access for a 3-day grace window. */
export const PAST_DUE_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingPhase = 'unmanaged' | 'trialing' | 'active' | 'grace' | 'locked';

export interface FarmBillingAccess {
  /** Whether the farm may keep using the full product. */
  hasAccess: boolean;
  /** True when access continues only through a grace window or paid period. */
  inGrace: boolean;
  phase: BillingPhase;
  status: FarmSubscriptionStatus | 'none';
}

function parseInstantMs(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export interface FarmBillingAccessOptions {
  subscription: FarmSubscription | null | undefined;
  /** Evaluation clock in ms; defaults to Date.now(). */
  nowMs?: number;
  /**
   * When false (default, BILLING_ENFORCE off) a missing or soft-deleted row
   * still grants access. When true the farm is locked without a live row.
   */
  enforce?: boolean;
  /** past_due grace window in days; defaults to the locked 3-day policy. */
  graceDays?: number;
}

/**
 * Entitlement rule for a farm's subscription row (source of truth is the
 * `farm_subscriptions` mirror, never client-reported state):
 * - `trialing` / `active`: full access.
 * - `past_due`: full access through a 3-day grace window anchored at
 *   `current_period_end` (falling back to `trial_ends_at`); fails closed when
 *   no anchor exists.
 * - `canceled` / `unpaid`: access continues until `current_period_end`.
 * - `incomplete` (checkout abandoned): locked.
 * - Soft-deleted row or missing row: access follows `enforce`.
 */
export function getFarmBillingAccess(options: FarmBillingAccessOptions): FarmBillingAccess {
  const { subscription } = options;
  const nowMs = options.nowMs ?? Date.now();
  const enforce = options.enforce ?? false;
  const graceDays = options.graceDays ?? PAST_DUE_GRACE_DAYS;

  if (!subscription || subscription.deleted_at != null) {
    return enforce
      ? { hasAccess: false, inGrace: false, phase: 'locked', status: 'none' }
      : { hasAccess: true, inGrace: false, phase: 'unmanaged', status: 'none' };
  }

  const status = subscription.status;

  if (status === 'trialing') {
    return { hasAccess: true, inGrace: false, phase: 'trialing', status };
  }
  if (status === 'active') {
    return { hasAccess: true, inGrace: false, phase: 'active', status };
  }

  if (status === 'past_due') {
    const anchorMs =
      parseInstantMs(subscription.current_period_end) ?? parseInstantMs(subscription.trial_ends_at);
    if (anchorMs === null) {
      // Unknown recovery deadline: fail closed rather than grant silently.
      return { hasAccess: false, inGrace: false, phase: 'locked', status };
    }
    const graceEndMs = anchorMs + graceDays * DAY_MS;
    if (nowMs <= graceEndMs) {
      return { hasAccess: true, inGrace: true, phase: 'grace', status };
    }
    return { hasAccess: false, inGrace: false, phase: 'locked', status };
  }

  if (status === 'canceled' || status === 'unpaid') {
    const periodEndMs = parseInstantMs(subscription.current_period_end);
    if (periodEndMs !== null && nowMs <= periodEndMs) {
      return { hasAccess: true, inGrace: true, phase: 'grace', status };
    }
    return { hasAccess: false, inGrace: false, phase: 'locked', status };
  }

  // 'incomplete': checkout never finished, no entitlement.
  return { hasAccess: false, inGrace: false, phase: 'locked', status };
}

/** Billing UI flag: strictly `VITE_BILLING_UI_ENABLED=true` enables the card. */
export function isBillingUiEnabled(env: Record<string, string | undefined> = import.meta.env): boolean {
  return env.VITE_BILLING_UI_ENABLED === 'true';
}

/**
 * Billing is web-only for v1: the Billing settings section renders nothing
 * under Capacitor, so no Capacitor plugin or Stripe surface is ever reached
 * from a native build.
 */
export function isBillingUiAvailable(env: Record<string, string | undefined> = import.meta.env): boolean {
  return isBillingUiEnabled(env) && !Capacitor.isNativePlatform();
}

/**
 * Internal rollout allowlist (comma-separated emails or user IDs) mirrored
 * from the server's BILLING_ALLOWLIST via VITE_BILLING_ALLOWLIST. Empty means
 * nobody is allowlisted and every eligible user sees "Billing coming soon".
 */
export function parseBillingAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

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

export type BillingSessionKind = 'checkout' | 'portal';

/**
 * POST to the billing Vercel Function and return the hosted Stripe URL to
 * redirect to. Only https URLs are accepted, so a compromised endpoint can
 * never navigate the app to a non-Stripe scheme.
 */
export async function requestBillingSession(
  kind: BillingSessionKind,
  options: { accessToken: string; apiBase?: string; signal?: AbortSignal },
): Promise<string> {
  const base = (options.apiBase ?? '/api').replace(/\/+$/, '');
  const endpoint = kind === 'checkout' ? 'create-checkout-session' : 'create-portal-session';
  const response = await fetch(`${base}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
    signal: options.signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body: fall through to the generic error below.
  }

  if (!response.ok) {
    const message =
      payload != null && typeof payload === 'object' && 'error' in payload &&
      typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Billing request failed';
    throw new Error(message);
  }

  const url =
    payload != null && typeof payload === 'object' && 'url' in payload &&
    typeof (payload as { url: unknown }).url === 'string'
      ? (payload as { url: string }).url
      : '';
  if (!url.startsWith('https://')) {
    throw new Error('Billing returned an unexpected response');
  }
  return url;
}
