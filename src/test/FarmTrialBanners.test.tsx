import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FarmTrialBanners from '@/components/FarmTrialBanners';

const control = vi.hoisted(() => ({ checkout: false, live: false, native: false, available: true, allowed: true, eligibilityError: false, paymentReads: vi.fn(), days: 14 as number | null }));
vi.mock('@/lib/native', () => ({ isNativePlatform: () => control.native }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => ({ farm_id: 'farm-1', session: { user: { id: 'user-1' } } }) }));
vi.mock('@/hooks/useFarmTrial', () => ({
  useTrialClock: () => Date.parse('2026-10-25T12:00:00Z'),
  useFarmTrial: () => ({ trial_ends_at: control.days === null ? null : new Date(Date.parse('2026-10-25T12:00:00Z') + control.days * 86400000).toISOString() }),
}));
vi.mock('@/lib/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing')>();
  return { ...actual, isBillingUiAvailable: () => control.available, getCachedBillingEligibility: () => control.eligibilityError ? undefined : ({ allowlisted: control.allowed, checkoutEnabled: control.checkout, liveCharges: control.live }), fetchBillingEligibility: vi.fn(async () => { throw new Error('eligibility unavailable'); }) };
});
vi.mock('@/lib/freshAccessToken', () => ({ freshAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  control.paymentReads();
  return { select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { status: 'past_due', current_period_end: '2026-10-25T12:00:00Z', deleted_at: null }, error: null }) }) }) }) };
} } }));
function mount(search = '') { return render(<MemoryRouter initialEntries={[`/${search}`]}><FarmTrialBanners /></MemoryRouter>); }
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => { Object.assign(control, { checkout: false, live: false, native: false, available: true, allowed: true, eligibilityError: false, days: 14 }); control.paymentReads.mockClear(); });
describe('farm trial banners', () => {
  it('overrides the preview countdown without enabling billing', () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'preview');
    control.days = null;
    mount('?trialDaysLeft=7');
    expect(screen.getByText('7 days left in your free trial.')).toBeInTheDocument();
    expect(screen.queryByText('Subscribe')).toBeNull();
  });
  it('uses zero to hide the preview reminder', () => {
    vi.stubEnv('VITE_VERCEL_ENV', 'preview');
    mount('?trialDaysLeft=0');
    expect(screen.queryByRole('status')).toBeNull();
  });
  it.each([['production', '7'], ['preview', '-1']])('preserves the real countdown for %s with override %s', (env, value) => {
    vi.stubEnv('VITE_VERCEL_ENV', env);
    mount(`?trialDaysLeft=${value}`);
    expect(screen.getByText('14 days left in your free trial.')).toBeInTheDocument();
  });
  it.each([14, 7, 1])('shows exact approved reminder at %s days', days => {
    control.days = days; mount();
    expect(screen.getByText(`${days} days left in your free trial.`)).toBeInTheDocument();
  });
  it.each([null, 15, 0, -1])('hides without a reminder window (%s)', days => {
    control.days = days; mount(); expect(screen.queryByRole('status')).toBeNull();
  });
  it('dismisses the reminder', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Dismiss trial reminder' })); expect(screen.queryByRole('status')).toBeNull();
  });
  it('hides Subscribe and payment failures when server capabilities are off, even allowlisted/past_due', () => {
    mount(); expect(screen.queryByText('Subscribe')).toBeNull(); expect(screen.queryByText(/Your payment didn't/)).toBeNull();
  });
  it('shows Subscribe for allowlisted test-mode checkout without live payment warnings', async () => {
    control.checkout = true; mount(); expect(await screen.findByRole('link', { name: 'Subscribe' })).toHaveAttribute('href', '/settings?section=billing');
    expect(screen.queryByText(/Your payment didn't/)).toBeNull();
  });
  it('hides Subscribe and never fetches payment failures when not allowlisted, even with live charges', async () => {
    control.checkout = true; control.live = true; control.allowed = false;
    await act(async () => { mount(); });
    expect(screen.queryByText('Subscribe')).toBeNull();
    expect(screen.queryByText(/Your payment didn't/)).toBeNull();
    expect(control.paymentReads).not.toHaveBeenCalled();
  });
  it('fails closed on eligibility errors without fetching payment failures', async () => {
    control.eligibilityError = true; control.checkout = true; control.live = true;
    await act(async () => { mount(); });
    expect(screen.queryByText('Subscribe')).toBeNull();
    expect(screen.queryByText(/Your payment didn't/)).toBeNull();
    expect(control.paymentReads).not.toHaveBeenCalled();
  });
  it.each(['native', 'available'])('blocks purchases with %s gate closed', gate => {
    control.checkout = true; control.live = true; if (gate === 'native') control.native = true; else control.available = false;
    mount(); expect(screen.queryByText('Subscribe')).toBeNull(); expect(screen.queryByText(/Your payment didn't/)).toBeNull();
    expect(screen.getByText('14 days left in your free trial.')).toBeInTheDocument();
  });
  it('hides checkout for a live key while server live billing is off', () => {
    control.checkout = false; control.live = false; mount();
    expect(screen.queryByText('Subscribe')).toBeNull();
  });
  it('shows exact payment message only when live charges are enabled', async () => {
    control.live = true; mount();
    expect(await screen.findByText("Your payment didn't go through. Update your card in the next 14 days to keep adding records. Your records stay safe either way.")).toBeInTheDocument();
  });

});
