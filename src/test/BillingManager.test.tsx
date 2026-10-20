import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BillingManager from '@/components/settings/BillingManager';
import {
  clearBillingEligibilityCache,
  fetchBillingEligibility,
  getCachedBillingEligibility,
} from '@/lib/billing';
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

const defaultSession = {
  access_token: 'token-1',
  user: { id: 'user-1', email: 'owner@example.com' },
};

const farmState: {
  session: typeof defaultSession | null;
  farm_id: string | null;
} = {
  session: { ...defaultSession, user: { ...defaultSession.user } },
  farm_id: 'farm-1',
};

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmState,
}));

type SubscriptionResult = { data: FarmSubscription | null; error: { message: string } | null };
let subscriptionResult: SubscriptionResult = { data: null, error: null };
const fromMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const refreshSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    auth: { getSession: getSessionMock, refreshSession: refreshSessionMock },
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

function eligibilityResponse(allowlisted: boolean, status = 200): Response {
  return new Response(JSON.stringify({ allowlisted }), { status });
}

function stubBillingFetch(options?: {
  allowlisted?: boolean;
  eligibilityStatus?: number;
  eligibilityError?: Error;
  checkout?: Response | Error;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/billing-eligibility')) {
      if (options?.eligibilityError) throw options.eligibilityError;
      return eligibilityResponse(options?.allowlisted ?? true, options?.eligibilityStatus ?? 200);
    }
    if (options?.checkout instanceof Error) throw options.checkout;
    if (options?.checkout) return options.checkout;
    return new Response(JSON.stringify({ error: 'unexpected fetch' }), { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv('VITE_BILLING_UI_ENABLED', 'true');
  farmState.session = { ...defaultSession, user: { ...defaultSession.user } };
  farmState.farm_id = 'farm-1';
  subscriptionResult = { data: null, error: null };
  clearBillingEligibilityCache();
  getSessionMock.mockResolvedValue({
    data: {
      session: {
        access_token: 'token-1',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
    error: null,
  });
  refreshSessionMock.mockResolvedValue({ data: { session: farmState.session } });
  fromMock.mockImplementation((table: string) => {
    expect(table).toBe('farm_subscriptions');
    return {
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: () => Promise.resolve(subscriptionResult),
          }),
        }),
      }),
    };
  });
  stubBillingFetch({ allowlisted: true });
});

afterEach(() => {
  clearBillingEligibilityCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('BillingManager', () => {
  it('renders nothing when the billing UI flag is disabled', () => {
    vi.stubEnv('VITE_BILLING_UI_ENABLED', 'false');
    const fetchMock = stubBillingFetch({ allowlisted: true });
    const { container } = renderBilling();
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders nothing under Capacitor (billing is web only for v1)', async () => {
    const capacitor = await import('@capacitor/core');
    vi.spyOn(capacitor.Capacitor, 'isNativePlatform').mockReturnValue(true);
    const fetchMock = stubBillingFetch({ allowlisted: true });
    try {
      const { container } = renderBilling();
      expect(container).toBeEmptyDOMElement();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('shows "coming soon" without any checkout action for non-allowlisted users', async () => {
    stubBillingFetch({ allowlisted: false });
    renderBilling();

    expect(await screen.findByText(/Billing is coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /manage billing/i })).toBeNull();
  });

  it('treats a fetch error or non-2xx eligibility response as coming soon', async () => {
    stubBillingFetch({ eligibilityError: new Error('network down') });
    const { unmount } = renderBilling();
    expect(await screen.findByText(/Billing is coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    unmount();

    clearBillingEligibilityCache();
    stubBillingFetch({ eligibilityStatus: 500, allowlisted: true });
    renderBilling();
    expect(await screen.findByText(/Billing is coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
  });

  it('does not flash checkout buttons while eligibility is pending', () => {
    const fetchMock = vi.fn(
      () => new Promise<Response>(() => {}),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderBilling();

    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /manage billing/i })).toBeNull();
    expect(screen.queryByText(/Billing is coming soon/i)).toBeNull();
  });

  it('does not show another user\'s cached allowlisted answer', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/billing-eligibility')) {
        return eligibilityResponse(true);
      }
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchBillingEligibility({ userId: 'user-1', accessToken: 'token-1' });
    expect(getCachedBillingEligibility('user-1')).toBe(true);
    expect(getCachedBillingEligibility('user-2')).toBeUndefined();

    const view = renderBilling();
    expect(await screen.findByRole('button', { name: /start 4-month free trial/i })).toBeInTheDocument();

    farmState.session = {
      access_token: 'token-2',
      user: { id: 'user-2', email: 'other@example.com' },
    };
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-2',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    view.rerender(
      <MemoryRouter>
        <BillingManager />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    expect(screen.queryByText(/Billing is coming soon/i)).toBeNull();
  });

  it('ignores a late in-flight eligibility result from a previous user', async () => {
    const resolvers: Array<(value: Response) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes('/api/billing-eligibility')) {
          return new Promise<Response>(resolve => {
            resolvers.push(resolve);
          });
        }
        return Promise.resolve(new Response(JSON.stringify({ error: 'unexpected fetch' }), { status: 500 }));
      }),
    );

    const view = renderBilling();
    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
    const previousResolvers = resolvers.splice(0, resolvers.length);

    farmState.session = {
      access_token: 'token-2',
      user: { id: 'user-2', email: 'other@example.com' },
    };
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-2',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    view.rerender(
      <MemoryRouter>
        <BillingManager />
      </MemoryRouter>,
    );

    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0));
    await act(async () => {
      for (const resolve of resolvers) resolve(eligibilityResponse(false));
    });
    expect(await screen.findByText(/Billing is coming soon/i)).toBeInTheDocument();

    await act(async () => {
      for (const resolve of previousResolvers) resolve(eligibilityResponse(true));
    });

    expect(screen.getByText(/Billing is coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
  });

  it('does not reuse a previous user eligibility after a user switch', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/billing-eligibility')) {
        const allowlisted = farmState.session?.user.id === 'user-1';
        return eligibilityResponse(allowlisted);
      }
      return new Response(JSON.stringify({ error: 'unexpected fetch' }), { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderBilling();
    expect(await screen.findByRole('button', { name: /start 4-month free trial/i })).toBeInTheDocument();
    unmount();

    farmState.session = {
      access_token: 'token-2',
      user: { id: 'user-2', email: 'other@example.com' },
    };
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-2',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    renderBilling();

    expect(await screen.findByText(/Billing is coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/billing-eligibility'))).toHaveLength(2);
  });

  it('does not reuse a previous user eligibility after sign-out', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/billing-eligibility')) {
        const allowlisted = farmState.session?.user.id === 'user-1';
        return eligibilityResponse(allowlisted);
      }
      return new Response(JSON.stringify({ error: 'unexpected fetch' }), { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = renderBilling();
    expect(await screen.findByRole('button', { name: /start 4-month free trial/i })).toBeInTheDocument();
    first.unmount();

    farmState.session = null;
    const signedOut = renderBilling();
    expect(signedOut.container).toBeEmptyDOMElement();
    signedOut.unmount();

    farmState.session = {
      access_token: 'token-2',
      user: { id: 'user-2', email: 'other@example.com' },
    };
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-2',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    renderBilling();

    expect(await screen.findByText(/Billing is coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start 4-month free trial/i })).toBeNull();
  });

  it('offers the trial checkout to an allowlisted farm without a subscription', async () => {
    renderBilling();

    expect(await screen.findByRole('button', { name: /start 4-month free trial/i })).toBeInTheDocument();
    expect(screen.getByText(/\$299\/year after the trial/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /manage billing/i })).toBeNull();
  });

  it('always refreshes and posts the refreshed token, not the stale store snapshot', async () => {
    // Regression: the useFarm() snapshot can hold the previous (expired)
    // access token; the click must refresh and send the rotated token, with
    // no expiry gate — refresh happens even for a long-lived session.
    refreshSessionMock.mockResolvedValue({
      data: {
        session: {
          ...farmState.session,
          access_token: 'token-refreshed',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
    });
    const fetchMock = stubBillingFetch({
      allowlisted: true,
      checkout: new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/test' }), { status: 200 }),
    });

    renderBilling();
    fireEvent.click(await screen.findByRole('button', { name: /start 4-month free trial/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/create-checkout-session',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-refreshed' }),
        }),
      );
    });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('asks the user to sign in again when the refresh yields no session', async () => {
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = stubBillingFetch({ allowlisted: true });

    renderBilling();
    fireEvent.click(await screen.findByRole('button', { name: /start 4-month free trial/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith('Please sign in again to manage billing.');
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/create-checkout-session',
      expect.anything(),
    );
  });

  it('asks the user to sign in again when the refresh errors', async () => {
    refreshSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token' },
    });
    const fetchMock = stubBillingFetch({ allowlisted: true });

    renderBilling();
    fireEvent.click(await screen.findByRole('button', { name: /start 4-month free trial/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith('Please sign in again to manage billing.');
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/create-checkout-session',
      expect.anything(),
    );
  });

  it('routes the portal button through the same refresh-then-post path as checkout', async () => {
    subscriptionResult = { data: makeSubscription({ status: 'active' }), error: null };
    refreshSessionMock.mockResolvedValue({
      data: { session: { ...farmState.session, access_token: 'token-refreshed' } },
    });
    const fetchMock = stubBillingFetch({
      allowlisted: true,
      checkout: new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/test' }), { status: 200 }),
    });

    renderBilling();
    fireEvent.click(await screen.findByRole('button', { name: /manage billing/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/create-portal-session',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-refreshed' }),
        }),
      );
    });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
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
    stubBillingFetch({
      allowlisted: true,
      checkout: new Response(JSON.stringify({ error: 'Billing is coming soon.' }), { status: 403 }),
    });

    renderBilling();
    const button = await screen.findByRole('button', { name: /start 4-month free trial/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith('Billing is coming soon.');
    });
  });
});
