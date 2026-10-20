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
  fetchBillingEligibility: vi.fn(async () => control.allowlisted),
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
  beforeEach(() => { mock.reset(); control.allowlisted = false; });
  it('shows Free beside the free copy for non-allowlisted users', async () => {
    mount();
    expect(await screen.findByText('Free')).toBeInTheDocument();
    expect(screen.getByText(/free for your farm/)).toBeInTheDocument();
    expect(screen.queryByText('Not subscribed')).toBeNull();
  });
  it('shows the loaded trial badge and trial copy', async () => {
    control.allowlisted = true;
    mock.setResult({ data: { status: 'trialing', deleted_at: null, trial_ends_at: '2026-12-01', owner_user_id: 'user-1' }, error: null });
    mount();
    expect(await screen.findByText('Free trial')).toBeInTheDocument();
    expect(screen.getByText(/Full access on your free trial/)).toBeInTheDocument();
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
