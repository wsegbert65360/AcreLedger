import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FarmTrialBanners from '@/components/FarmTrialBanners';

const control = vi.hoisted(() => ({ checkout: false, live: false, native: false, available: true, allowed: true, days: 14 as number | null }));
vi.mock('@/lib/native', () => ({ isNativePlatform: () => control.native }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => ({ farm_id: 'farm-1', session: { user: { id: 'user-1' } } }) }));
vi.mock('@/hooks/useFarmTrial', () => ({
  useTrialClock: () => Date.parse('2026-10-25T12:00:00Z'),
  useFarmTrial: () => ({ trial_ends_at: control.days === null ? null : new Date(Date.parse('2026-10-25T12:00:00Z') + control.days * 86400000).toISOString() }),
}));
vi.mock('@/lib/billing', () => ({ isBillingUiAvailable: () => control.available, getCachedBillingEligibility: () => ({ allowlisted: control.allowed, checkoutEnabled: control.checkout, liveCharges: control.live }), fetchBillingEligibility: vi.fn() }));
vi.mock('@/lib/freshAccessToken', () => ({ freshAccessToken: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { status: 'past_due', current_period_end: '2026-10-25T12:00:00Z', deleted_at: null }, error: null }) }) }) }) }) } }));
function mount() { return render(<MemoryRouter><FarmTrialBanners /></MemoryRouter>); }
beforeEach(() => { Object.assign(control, { checkout: false, live: false, native: false, available: true, allowed: true, days: 14 }); });
describe('farm trial banners', () => {
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
  it('hides Subscribe when not allowlisted', () => {
    control.checkout = true; control.live = true; control.allowed = false; mount(); expect(screen.queryByText('Subscribe')).toBeNull();
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
