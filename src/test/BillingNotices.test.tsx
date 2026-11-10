import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BillingNotices from '@/components/BillingNotices';

const control = vi.hoisted(() => ({
  live: false,
  native: false,
  available: true,
  allowed: true,
  eligibilityError: false,
  paymentReads: vi.fn(),
  status: 'past_due',
  pastDueSince: '2026-10-25T12:00:00Z' as string | null,
  periodEnd: '2027-10-25T12:00:00Z' as string | null,
}));
vi.mock('@/lib/native', () => ({ isNativePlatform: () => control.native }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => ({ farm_id: 'farm-1', session: { user: { id: 'user-1' } } }) }));
vi.mock('@/hooks/useFarmComp', () => ({ useNowClock: () => Date.parse('2026-10-25T12:00:00Z') }));
vi.mock('@/lib/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing')>();
  return { ...actual, isBillingUiAvailable: () => control.available, getCachedBillingEligibility: () => control.eligibilityError ? undefined : ({ allowlisted: control.allowed, checkoutEnabled: false, liveCharges: control.live }), fetchBillingEligibility: vi.fn(async () => { throw new Error('eligibility unavailable'); }) };
});
vi.mock('@/lib/freshAccessToken', () => ({ freshAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  control.paymentReads();
  return { select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { status: control.status, past_due_since: control.pastDueSince, current_period_end: control.periodEnd, deleted_at: null }, error: null }) }) }) }) };
} } }));
function mount() { return render(<MemoryRouter><BillingNotices /></MemoryRouter>); }
beforeEach(() => {
  Object.assign(control, {
    live: false,
    native: false,
    available: true,
    allowed: true,
    eligibilityError: false,
    status: 'past_due',
    pastDueSince: '2026-10-25T12:00:00Z',
    periodEnd: '2027-10-25T12:00:00Z',
  });
  control.paymentReads.mockClear();
});
describe('billing notices', () => {
  it('shows no notice when live charges are off, even for a past_due row', () => {
    mount(); expect(screen.queryByText(/Your payment didn't/)).toBeNull();
  });
  it('shows the exact payment message only when live charges are enabled', async () => {
    control.live = true; mount();
    expect(await screen.findByText("Your payment didn't go through. Update your card in the next 14 days to keep Pro. After that your farm moves to the free record book, and your records stay safe.")).toBeInTheDocument();
  });
  it('uses the singular day when one grace day remains', async () => {
    control.live = true;
    control.pastDueSince = '2026-10-12T12:00:00Z';
    mount();
    expect(await screen.findByText("Your payment didn't go through. Update your card in the next 1 day to keep Pro. After that your farm moves to the free record book, and your records stay safe.")).toBeInTheDocument();
  });
  it('shows no countdown when the failure anchor is missing, even if the period end is a year out', async () => {
    control.live = true;
    control.pastDueSince = null;
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/Your payment didn't/)).toBeNull();
  });
  it('never fetches payment failures when not allowlisted, even with live charges', async () => {
    control.live = true; control.allowed = false;
    await act(async () => { mount(); });
    expect(screen.queryByText(/Your payment didn't/)).toBeNull();
    expect(control.paymentReads).not.toHaveBeenCalled();
  });
  it('fails closed on eligibility errors without fetching payment failures', async () => {
    control.eligibilityError = true; control.live = true;
    await act(async () => { mount(); });
    expect(screen.queryByText(/Your payment didn't/)).toBeNull();
    expect(control.paymentReads).not.toHaveBeenCalled();
  });
  it('renders nothing on native', () => {
    control.live = true; control.native = true;
    mount(); expect(screen.queryByLabelText('Billing notices')).toBeNull();
  });
  it('shows nothing with the billing-availability gate closed', () => {
    control.live = true; control.available = false;
    mount(); expect(screen.queryByText(/Your payment didn't/)).toBeNull();
  });
});
