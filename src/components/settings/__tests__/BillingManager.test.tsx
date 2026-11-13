import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const control = vi.hoisted(() => ({ allowlisted: false }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => ({ farm_id: 'farm-1', session: { user: { id: 'user-1', email: 'test@example.com' } } }) }));
vi.mock('@/lib/billing', () => ({
  isBillingUiAvailable: () => true,
  getCachedBillingEligibility: () => undefined,
  clearBillingEligibilityCache: vi.fn(),
  fetchBillingEligibility: vi.fn(async () => ({ allowlisted: control.allowlisted, checkoutEnabled: false, liveCharges: false })),
  requestBillingSession: vi.fn(),
}));
vi.mock('@/lib/freshAccessToken', () => ({
  freshAccessToken: vi.fn(async () => 'token-1'),
  SignInAgainError: class SignInAgainError extends Error {},
}));
const mock = createSupabaseMock();
vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));
let BillingManager: typeof import('../BillingManager').default;
beforeAll(async () => { BillingManager = (await import('../BillingManager')).default; });
function mount() { render(<MemoryRouter><BillingManager /></MemoryRouter>); }
describe('BillingManager status', () => {
  beforeEach(() => { mock.reset(); mock.setTableHandler('farms', { data: null, error: null }); control.allowlisted = false; });
  it('shows Free beside the free record book copy for non-allowlisted users', async () => {
    mount();
    expect(await screen.findByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Free record book. No card needed. Pro is $299 per farm per year.')).toBeInTheDocument();
    expect(screen.queryByText('Not subscribed')).toBeNull();
  });
  it('shows a legacy trialing Stripe row as Free, never Active', async () => {
    control.allowlisted = true;
    mock.setResult({ data: { status: 'trialing', deleted_at: null, current_period_end: '2026-12-01', owner_user_id: 'user-1' }, error: null });
    mount();
    expect(await screen.findByText('Free')).toBeInTheDocument();
    expect(screen.getByText('This farm is on the free plan. Pro starts when checkout is completed.')).toBeInTheDocument();
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.queryByText(/Renews yearly/)).toBeNull();
    expect(screen.queryByText('Free trial')).toBeNull();
  });
  it('shows an active Stripe row as Active', async () => {
    control.allowlisted = true;
    mock.setResult({ data: { status: 'active', deleted_at: null, current_period_end: '2026-12-01', cancel_at_period_end: false, owner_user_id: 'user-1' }, error: null });
    mount();
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/Renews yearly/)).toBeInTheDocument();
  });
  it('shows Not subscribed after loading no row', async () => {
    control.allowlisted = true;
    mock.setResult({ data: null, error: null });
    mount();
    expect(await screen.findByText('Not subscribed')).toBeInTheDocument();
    expect(screen.getByText('No billing subscription for this farm yet.')).toBeInTheDocument();
  });
  it('does not show Not subscribed while the query is pending', () => {
    control.allowlisted = true;
    mock.setTablePages('farm_subscriptions', [new Promise(() => {})]);
    mount();
    expect(screen.queryByText('Not subscribed')).toBeNull();
  });
});

describe('complimentary farm display', () => {
  beforeEach(() => { mock.reset(); control.allowlisted = false; });
  it.each([null, '2099-12-01T12:00:00Z'])('shows complimentary access for a live comp (%s)', async expires_at => {
    mock.setRpcResult({ data: [{ is_comped: true, expires_at }], error: null });
    mount();
    expect(await screen.findByText(expires_at ? 'Complimentary access until Dec 1, 2099' : 'Complimentary access')).toBeInTheDocument();
  });
  it.each(['expired', 'error'])('shows no complimentary line when comp is %s', async mode => {
    mock.setRpcResult(mode === 'error' ? { data: null, error: { message: 'offline' } } : { data: [{ is_comped: true, expires_at: '2000-01-01T12:00:00Z' }], error: null });
    mount();
    await screen.findByText('Free');
    expect(screen.queryByText(/Complimentary access/)).toBeNull();
  });
});