import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BillingManager from '@/components/settings/BillingManager';
import type { FarmSubscription } from '@/types/farm';

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMocks,
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn() },
  },
}));

const farmState = {
  session: {
    access_token: 'token-1',
    user: { id: 'user-1', email: 'owner@example.com' },
  },
  farm_id: 'farm-1',
};

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmState,
}));

type SubscriptionResult = { data: FarmSubscription | null; error: { message: string } | null };
let subscriptionResult: SubscriptionResult = { data: null, error: null };
const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

function makeSubscription(overrides: Partial<FarmSubscription> = {}): FarmSubscription {
  return {
    id: 'sub-1',
    farm_id: 'farm-1',
    owner_user_id: 'user-1',
    status: 'active',
    trial_ends_at: '2027-01-08T00:00:00.000Z',
    current_period_end: '2027-01-08T00:00:00.000Z',
    cancel_at_period_end: false,
    stripe_customer_id: 'cus_test_1',
    stripe_subscription_id: 'sub_stripe_1',
    stripe_subscription_created_at: '2026-09-09T00:00:00.000Z',
    stripe_price_id: 'price_test_1',
    created_at: '2026-09-08T00:00:00.000Z',
    updated_at: '2026-09-08T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function renderBilling() {
  return render(
    <MemoryRouter>
      <BillingManager />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_BILLING_UI_ENABLED', 'true');
  vi.stubEnv('VITE_BILLING_ALLOWLIST', 'owner@example.com');
  subscriptionResult = { data: null, error: null };
  fromMock.mockImplementation((table: string) => {
    expect(table).toBe('farm_subscriptions');
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(subscriptionResult),
        }),
      }),
    };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('BillingManager', () => {
  it('renders nothing when the billing UI flag is disabled', () => {
    vi.stubEnv('VITE_BILLING_UI_ENABLED', 'false');
    const { container } = renderBilling();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing under Capacitor (billing is web only for v1)', async () => {
    const capacitor = await import('@capacitor/core');
    vi.spyOn(capacitor.Capacitor, 'isNativePlatform').mockReturnValue(true);
    try {
      const { container } = renderBilling();
      expect(container).toBeEmptyDOMElement();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('shows "coming soon" without any checkout action for non-allowlisted users', async () => {
    vi.stubEnv('VITE_BILLING_ALLOWLIST', 'someoneelse@example.com');
    renderBilling();

    expect(await screen.findByText(/Billing is coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /manage billing/i })).toBeNull();
  });

  it('offers the trial checkout to an allowlisted farm without a subscription', async () => {
    renderBilling();

    expect(await screen.findByRole('button', { name: /start 4-month free trial/i })).toBeInTheDocument();
    expect(screen.getByText(/\$299\/year after the trial/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage billing/i })).toBeNull();
  });

  it('posts to the checkout endpoint with the bearer token when starting the trial', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/test' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderBilling();
    const button = await screen.findByRole('button', { name: /start 4-month free trial/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/create-checkout-session',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
        }),
      );
    });
  });

  it('shows a read-only status without actions for a non-owner member', async () => {
    subscriptionResult = { data: makeSubscription({ owner_user_id: 'owner-2' }), error: null };
    renderBilling();

    expect(await screen.findByText(/Ask the farm owner to manage billing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /manage billing/i })).toBeNull();
  });

  it('shows the portal action for the owner of an active subscription', async () => {
    subscriptionResult = { data: makeSubscription({ status: 'active' }), error: null };
    renderBilling();

    expect(await screen.findByRole('button', { name: /manage billing/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    expect(screen.getByText(/Active\. Renews yearly/i)).toBeInTheDocument();
  });

  it('surfaces a failed billing request as a toast instead of navigating', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Billing is coming soon.' }), { status: 403 }),
      ),
    );

    renderBilling();
    const button = await screen.findByRole('button', { name: /start 4-month free trial/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith('Billing is coming soon.');
    });
  });
});
