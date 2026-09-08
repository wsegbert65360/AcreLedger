/**
 * @vitest-environment jsdom
 *
 * Ticket C routing invariants: signed-out users get the thin landing at /
 * (not the auth screen), /auth is deep-linkable with ?mode=signup|signin,
 * /privacy stays publicly readable, and signed-in behavior is unchanged —
 * the app renders at / and /auth bounces back into the app.
 */
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auth reads credentials through this module; stub auth calls so the signup
// flow can reach the verification screen without network.
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

// --- Shared farm-store mock (App reads session/loading + onboarding gates) ---
const farmState: { current: Record<string, unknown> } = { current: {} };

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmState.current,
  FarmProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/context/QuickAddContext', () => ({
  useQuickAdd: () => ({
    activeModal: null,
    selectedField: null,
    clearActiveModal: vi.fn(),
    openQuickAdd: vi.fn(),
  }),
  QuickAddProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/context/AskAcreLedgerContext', () => ({
  useAskAcreLedger: () => ({ openAsk: vi.fn() }),
  AskAcreLedgerProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Chrome components are irrelevant to routing; keep the tree light.
vi.mock('@/components/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/components/OfflineBanner', () => ({ default: () => null }));
vi.mock('@/components/SeasonRolloverModal', () => ({ default: () => null }));
vi.mock('@/components/QuickAddDialog', () => ({ default: () => null }));
vi.mock('@/components/AskAcreLedger', () => ({ default: () => null }));
vi.mock('@/components/CoachmarkOverlay', () => ({ default: () => null }));

vi.mock('@/hooks/useCoachmarks', () => ({
  useCoachmarks: () => ({
    isActive: false,
    currentStep: null,
    stepIndex: 0,
    totalSteps: 0,
    next: vi.fn(),
    back: vi.fn(),
    skip: vi.fn(),
  }),
}));

vi.mock('@/lib/syncQueue', () => ({
  syncQueue: {
    replayQueue: vi.fn().mockResolvedValue(undefined),
    enqueueMutation: vi.fn(),
    enqueueMutations: vi.fn(),
  },
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: { light: vi.fn(), success: vi.fn(), error: vi.fn() },
    statusBar: { setLight: vi.fn(), setDark: vi.fn() },
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    minimizeApp: vi.fn(),
  },
}));

// The signed-in dashboard is out of scope here; a marker proves the app rendered.
vi.mock('@/pages/Index', () => ({
  default: () => <div data-testid="app-dashboard" />,
}));

import App from './App';

const signedOutState = {
  session: null,
  loading: false,
  isOnline: true,
  farm_id: null,
  fields: [],
  onboardingComplete: false,
  initialFetchComplete: false,
  fetchError: null,
};

const signedInState = {
  session: { user: { id: 'user-1' } },
  loading: false,
  isOnline: true,
  farm_id: 'farm-1',
  fields: [{ id: 'field-1', name: 'North', acreage: 40, deleted_at: null }],
  onboardingComplete: true,
  initialFetchComplete: true,
  fetchError: null,
};

const navigate = (path: string) => {
  window.history.pushState({}, '', path);
};

const renderApp = () => render(<App />);

describe('signed-out routing (ticket C)', () => {
  beforeEach(() => {
    navigate('/');
    farmState.current = { ...signedOutState };
  });

  it('shows the landing, not the auth screen, at /', () => {
    renderApp();
    expect(screen.getByRole('link', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome Back' })).not.toBeInTheDocument();
  });

  it('keeps /privacy publicly readable', () => {
    navigate('/privacy');
    renderApp();
    expect(screen.getByText('AcreLedger Privacy Policy')).toBeInTheDocument();
  });

  it('deep-links /auth?mode=signup into sign-up mode', () => {
    navigate('/auth?mode=signup');
    renderApp();
    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('deep-links /auth (or ?mode=signin) into sign-in mode', () => {
    navigate('/auth');
    renderApp();
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
  });

  it('links the auth screen to the privacy policy', () => {
    navigate('/auth');
    renderApp();
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it('renders the approved sign-in microcopy', () => {
    navigate('/auth');
    renderApp();
    expect(screen.getByText('Farm records & compliance')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your farm')).toBeInTheDocument();
  });

  it('renders the approved signup microcopy and post-signup next-step', async () => {
    navigate('/auth?mode=signup');
    renderApp();
    expect(screen.getByText('Set up your farm records')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'farmer@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'longenough1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'longenough1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(
      await screen.findByText(
        'Next: name your farm, add a field (by hand is fine), and log a planting. You can import FSA tracts later.'
      )
    ).toBeInTheDocument();
  });

  it('redirects unknown signed-out paths to the landing', () => {
    navigate('/reports');
    renderApp();
    expect(screen.getByRole('link', { name: 'Create account' })).toBeInTheDocument();
  });
});

describe('signed-in routing (preserved behavior)', () => {
  beforeEach(() => {
    navigate('/');
    farmState.current = { ...signedInState };
  });

  it('renders the app at /', async () => {
    renderApp();
    expect(await screen.findByTestId('app-dashboard')).toBeInTheDocument();
  });

  it('bounces /auth back into the app', async () => {
    navigate('/auth');
    renderApp();
    expect(await screen.findByTestId('app-dashboard')).toBeInTheDocument();
  });

  it('still renders /privacy inside the app shell', async () => {
    navigate('/privacy');
    renderApp();
    expect(await screen.findByText('AcreLedger Privacy Policy')).toBeInTheDocument();
  });
});
