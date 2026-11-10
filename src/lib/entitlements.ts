// Free tier entitlements. Display-only on the client: the server (farm_entitlement /
// assert_premium) is the source of truth. FREE_LIMITS mirrors entitlement_free_limits()
// in supabase/migrations/20261107000000_entitlements_core.sql; src/test/entitlementsConstants.test.ts
// fails if they drift. null = unlimited.

export type EntitlementPlan = 'free' | 'paid' | 'complimentary';

export interface Entitlement {
  plan: EntitlementPlan;
  premiumUntil: string | null;
  fieldCap: number | null;
  rainfallSlotCap: number | null;
  photoCap: number | null;
  historySeasons: number | null;
  deviceCap: number | null;
  /** True only when the server is in enforce mode. Never lock features unless this is true. */
  enforced: boolean;
}

export const FREE_LIMITS = {
  fieldCap: 50,
  rainfallSlotCap: 2,
  photoCap: 20,
  historySeasons: 2,
  deviceCap: 1,
} as const;

export const PREMIUM_REQUIRED_ERRCODE = 'P0402';

/** Feature names exactly as the server raises them (premium_required:<feature>). */
export type PremiumFeature =
  | 'reports' | 'grain' | 'equipment' | 'landlord_split' | 'fsa_tract'
  | 'backup_restore' | 'field_cap' | 'photo_cap' | 'rainfall';

/**
 * Report types that need Pro (FSA-578, season spray log, fertilizer, landlord
 * statements). Fall FSA and the hay summary stay free. The app also asks the server before export
 * (authorizeReportExport). Reports are still built on the device.
 */
const PAID_REPORT_TYPES: ReadonlySet<string> = new Set([
  'fsa-plant', 'spray-audit', 'fertilizer-summary', 'landlord-statement', 'farm-owner-summary',
]);

export function isPaidReport(reportType: string): boolean {
  return PAID_REPORT_TYPES.has(reportType);
}

export function isPremiumPlan(plan: EntitlementPlan): boolean {
  return plan !== 'free';
}

export function freeEntitlement(enforced = false): Entitlement {
  return { plan: 'free', premiumUntil: null, ...FREE_LIMITS, enforced };
}

/** The single display rule: a feature is locked only for a free farm while the server enforces. */
export function isFreeTierLocked(e: Entitlement | null | undefined): boolean {
  return !!e && e.enforced && e.plan === 'free';
}

/** Normalize a farm_entitlement row (snake_case) into the client shape. Unknown plans fail to free. */
export function parseEntitlementRow(row: unknown): Entitlement | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const plan = r.plan;
  if (plan !== 'free' && plan !== 'paid' && plan !== 'complimentary') return null;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    plan,
    premiumUntil: typeof r.premium_until === 'string' ? r.premium_until : null,
    fieldCap: num(r.field_cap),
    rainfallSlotCap: num(r.rainfall_slot_cap),
    photoCap: num(r.photo_cap),
    historySeasons: num(r.history_seasons),
    deviceCap: num(r.device_cap),
    enforced: r.enforced === true,
  };
}

/** Validate a previously cached (client-shape) entitlement; anything malformed is dropped. */
export function parseCachedEntitlement(value: unknown): Entitlement | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return parseEntitlementRow({
    plan: v.plan, premium_until: v.premiumUntil, field_cap: v.fieldCap, rainfall_slot_cap: v.rainfallSlotCap,
    photo_cap: v.photoCap, history_seasons: v.historySeasons, device_cap: v.deviceCap,
    enforced: v.enforced,
  });
}

/** A cached premium entitlement stops counting once its premiumUntil has passed. */
export function isEntitlementStale(e: Entitlement, now = Date.now()): boolean {
  if (!isPremiumPlan(e.plan) || !e.premiumUntil) return false;
  const until = Date.parse(e.premiumUntil);
  return Number.isFinite(until) && until <= now;
}

export function isPremiumRequiredError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!error && (error.code === PREMIUM_REQUIRED_ERRCODE || /premium_required:/.test(error.message ?? ''));
}

export function premiumRequiredFeature(error: { message?: string | null } | null | undefined): string | null {
  return /premium_required:([a-z_]+)/.exec(error?.message ?? '')?.[1] ?? null;
}
