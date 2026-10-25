/**
 * @vitest-environment jsdom
 *
 * Ticket C routing invariants: signed-out users get the thin landing at /
 * (not the auth screen), /auth is deep-linkable with ?mode=signup|signin,
 * /privacy and /support stay publicly readable, and signed-in behavior is
 * unchanged — the app renders at / and /auth bounces back into the app.
 */
import type { ReactNode } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auth reads credentials through this module; stub auth calls so the signup
// flow can reach the verification screen without network.
const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const equipmentUi = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/lib/equipment/feature', () => ({
  isEquipmentUiEnabled: () => equipmentUi.enabled,
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth,
  },
}));

vi.mock('sonner', () => ({ toast, Toaster: () => null }));

vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ containerClassName: _containerClassName, children: _children, onChange, ...props }: any) => (
    <input {...props} onChange={(event) => onChange(event.target.value)} />
  ),
  InputOTPGroup: ({ children }: any) => <>{children}</>,
  InputOTPSlot: () => null,
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
vi.mock('@/components/FarmTrialBanners', () => ({ default: () => null }));
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

const platform = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    minimizeApp: vi.fn(),
  },
}));

// The signed-in dashboard is out of scope here; a marker proves the app rendered.
vi.mock('@/pages/Index', () => ({
  default: () => <div data-testid="app-dashboard" />,
}));

vi.mock('./pages/Equipment', () => ({
  default: () => <div data-testid="equipment-page" />,
}));

vi.mock('./pages/Settings', () => ({
  default: () => <div data-testid="settings-page" />,
}));

import { App as CapApp } from '@capacitor/app';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

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
  onboardingStatusKnown: true,
  initialFetchComplete: true,
  fetchError: null,
};

const navigate = (path: string) => {
  window.history.pushState({}, '', path);
};

const renderApp = () => render(<App />);

Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

describe('native hardware back button', () => {
  beforeEach(() => {
    platform.native = true;
    navigate('/');
    farmState.current = { ...signedOutState, loading: true };
    sessionStorage.clear();
    vi.clearAllMocks();
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  function backListener() {
    const call = vi.mocked(CapApp.addListener).mock.calls.find(([event]) => String(event) === 'backButton');
    expect(call).toBeDefined();
    return call![1] as unknown as (event: { canGoBack: boolean }) => void;
  }

  it('closes a real Radix dialog before navigating or minimizing', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const view = render(
      <>
        <App />
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Unsaved spray</DialogTitle>
            <DialogDescription>Keep the current route while dismissing this entry.</DialogDescription>
          </DialogContent>
        </Dialog>
      </>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open');
    act(() => backListener()({ canGoBack: true }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(back).not.toHaveBeenCalled();
    expect(CapApp.minimizeApp).not.toHaveBeenCalled();
    view.unmount();
    back.mockRestore();
  });

  it('consumes back for an open alert dialog even when history is empty', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const view = renderApp();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('data-state', 'open');
    const escape = vi.fn();
    dialog.addEventListener('keydown', escape);
    document.body.append(dialog);
    try {
      act(() => backListener()({ canGoBack: false }));
      expect(escape).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape', bubbles: true }));
      expect(back).not.toHaveBeenCalled();
      expect(CapApp.minimizeApp).not.toHaveBeenCalled();
    } finally {
      dialog.remove();
      view.unmount();
      back.mockRestore();
    }
  });

  it('goes back when native history exists, including at the root route', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const view = renderApp();
    act(() => backListener()({ canGoBack: true }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(CapApp.minimizeApp).not.toHaveBeenCalled();
    view.unmount();
    back.mockRestore();
  });

  it('minimizes without native history, including a cold-start deep route', () => {
    navigate('/auth?mode=signin');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const view = renderApp();
    act(() => backListener()({ canGoBack: false }));
    expect(back).not.toHaveBeenCalled();
    expect(CapApp.minimizeApp).toHaveBeenCalledTimes(1);
    view.unmount();
    back.mockRestore();
  });

  it('removes the native back listener on unmount', async () => {
    const view = renderApp();
    backListener();
    const index = vi.mocked(CapApp.addListener).mock.calls.findIndex(([event]) => String(event) === 'backButton');
    const handle = await vi.mocked(CapApp.addListener).mock.results[index].value;
    view.unmount();
    await vi.waitFor(() => expect(handle.remove).toHaveBeenCalled());
  });

  it('does not register a native back listener on web', () => {
    platform.native = false;
    const view = renderApp();
    expect(vi.mocked(CapApp.addListener).mock.calls.some(([event]) => String(event) === 'backButton')).toBe(false);
    view.unmount();
  });
});

const startPasswordReset = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'farmer@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByRole('heading', { name: 'Enter Reset Code' });
};

describe('signed-out routing (ticket C)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    platform.native = false;
    navigate('/');
    farmState.current = { ...signedOutState };
    sessionStorage.clear();
    vi.clearAllMocks();
    auth.signUp.mockResolvedValue({ data: null, error: null });
    auth.signInWithPassword.mockResolvedValue({ data: null, error: null });
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, error: null });
    auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'reset-session' } }, error: null });
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: 'reset-session' } }, error: null });
    auth.updateUser.mockResolvedValue({ data: null, error: null });
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'reset-session' } }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });


  it('blocks the signed-in routes when deletion is pending', async () => {
    farmState.current = { ...signedInState, deletionStatus: 'pending', signOut: vi.fn() };
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Account deletion pending' })).toBeTruthy();
    expect(screen.queryByTestId('app-dashboard')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeTruthy();
  });

  it('shows the landing, not the auth screen, at /', () => {
    renderApp();
    expect(screen.getAllByRole('link', { name: 'Open your farm book' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Welcome Back' })).not.toBeInTheDocument();
  });

  it('keeps /privacy publicly readable', () => {
    navigate('/privacy');
    renderApp();
    expect(screen.getByText('AcreLedger Privacy Policy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'acreledgerapp@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:acreledgerapp@gmail.com'
    );
    expect(screen.queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument();
  });

  it('keeps /support publicly readable', () => {
    navigate('/support');
    renderApp();
    expect(screen.getByText('AcreLedger Support')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'acreledgerapp@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:acreledgerapp@gmail.com'
    );
    expect(screen.queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument();
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

  it('does not show the new-password screen for a recovery route without a callback', () => {
    navigate('/auth?mode=recovery');
    renderApp();
    expect(screen.queryByRole('heading', { name: 'Choose New Password' })).not.toBeInTheDocument();
  });

  it('requires verified recovery on native before showing a new-password form', async () => {
    platform.native = true;
    navigate('/auth?mode=recovery');
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose New Password' })).not.toBeInTheDocument();
  });

  it('sends native signup confirmation to the return-to-app page', async () => {
    platform.native = true;
    navigate('/auth?mode=signup');
    renderApp();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'farmer@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await vi.waitFor(() => expect(auth.signUp).toHaveBeenCalledWith({
      email: 'farmer@example.com', password: 'longenough1',
      options: { emailRedirectTo: 'https://acreledger.app/email-confirmed.html' },
    }));
  });

  it('keeps a verified native PKCE recovery on the password form', async () => {
    platform.native = true;
    vi.mocked(CapApp.getLaunchUrl).mockResolvedValueOnce({
      url: 'com.wsegbert.acreledger://auth/recovery?code=native-valid',
    });
    navigate('/auth');
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Choose New Password' })).toBeInTheDocument();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('native-valid');
    expect(sessionStorage.getItem('al_password_recovery_pending')).toBe('true');
  });

  it('links the auth screen to the privacy policy and support page', () => {
    navigate('/auth');
    renderApp();
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute(
      'href',
      '/privacy'
    );
    expect(screen.getByRole('link', { name: /^support$/i })).toHaveAttribute(
      'href',
      '/support'
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

    expect(await screen.findByRole('heading', { name: 'Check Your Email' })).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Next: name your farm, add a field (by hand is fine), and log a planting. You can import FSA tracts later.'
      )
    ).toBeInTheDocument();
  });

  it('signs out a session returned at signup so the check-email screen is shown', async () => {
    auth.signUp.mockResolvedValue({
      data: { session: { access_token: 'unconfirmed-session' }, user: { id: 'user-1' } },
      error: null,
    });
    navigate('/auth?mode=signup');
    renderApp();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'farmer@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(await screen.findByRole('heading', { name: 'Check Your Email' })).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('sends a reset code and shows the address on the verification screen', async () => {
    navigate('/auth');
    renderApp();

    await startPasswordReset();

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('farmer@example.com', expect.any(Object));
    expect(screen.getByText('Enter the 6-digit code we sent to farmer@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend code \(60s\)/i })).toBeDisabled();
  });

  it('verifies a correct code and keeps the new-password screen ahead of the dashboard', async () => {
    navigate('/auth');
    renderApp();
    await startPasswordReset();

    fireEvent.change(screen.getByLabelText('6-digit reset code'), { target: { value: '123456' } });

    await screen.findByRole('heading', { name: 'Choose New Password' });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'farmer@example.com',
      token: '123456',
      type: 'recovery',
    });
    expect(screen.queryByTestId('app-dashboard')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('al_password_recovery_pending')).toBe('true');
  });

  it('shows a wrong-code error, remains on the code screen, and clears the input', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'Token has expired' } });
    navigate('/auth');
    renderApp();
    await startPasswordReset();

    const codeInput = screen.getByLabelText('6-digit reset code') as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: '123456' } });

    await screen.findByRole('heading', { name: 'Enter Reset Code' });
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'That code is incorrect or has expired. Check the newest email or tap Resend code.'
    ));
    expect(codeInput.value).toBe('');
  });

  it('guards the password screen when recovery is emitted before verifyOtp resolves', async () => {
    let finishVerification!: (value: unknown) => void;
    auth.verifyOtp.mockImplementation(() => new Promise(resolve => { finishVerification = resolve; }));
    navigate('/auth');
    const view = renderApp();
    await startPasswordReset();
    fireEvent.change(screen.getByLabelText('6-digit reset code'), { target: { value: '123456' } });

    act(() => {
      farmState.current = { ...signedInState };
      auth.onAuthStateChange.mock.calls.at(-1)?.[0]('PASSWORD_RECOVERY', signedInState.session);
    });
    view.rerender(<App />);
    expect(screen.getByRole('heading', { name: 'Choose New Password' })).toBeInTheDocument();
    expect(screen.queryByTestId('app-dashboard')).not.toBeInTheDocument();
    await act(async () => {
      finishVerification({ data: { session: signedInState.session }, error: null });
    });
  });

  it('does not open the new-password screen from a token_hash recovery link', async () => {
    navigate('/auth?mode=recovery&token_hash=signout-test&type=recovery');
    renderApp();

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'This password-reset link is expired, invalid, or has already been used. Request a new reset email and open the newest link.',
    ));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Choose New Password' })).not.toBeInTheDocument();
  });

  it('leaves an established recovery route when the session signs out', async () => {
    navigate('/auth?mode=recovery&code=signout-test');
    const view = renderApp();
    await screen.findByRole('heading', { name: 'Choose New Password' });

    act(() => {
      farmState.current = { ...signedOutState };
      auth.onAuthStateChange.mock.calls.at(-1)?.[0]('SIGNED_OUT', null);
    });
    view.rerender(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(window.location.search).toBe('?mode=signin');
    expect(sessionStorage.getItem('al_password_recovery_pending')).toBeNull();
  });

  it('enables resend after 60 seconds and sends a new code', async () => {
    vi.useFakeTimers();
    try {
      navigate('/auth');
      renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'farmer@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
      await act(async () => undefined);
      expect(screen.getByRole('heading', { name: 'Enter Reset Code' })).toBeInTheDocument();

      const resend = screen.getByRole('button', { name: /resend code/i });
      expect(resend).toBeDisabled();
      for (let second = 0; second < 60; second += 1) {
        await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      }
      expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
      await vi.waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('redirects unknown signed-out paths to the landing', () => {
    navigate('/reports');
    renderApp();
    expect(screen.getAllByRole('link', { name: 'Open your farm book' }).length).toBeGreaterThan(0);
  });

  it('keeps /equipment behind sign-in', () => {
    navigate('/equipment');
    renderApp();
    expect(screen.getAllByRole('link', { name: 'Open your farm book' }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('equipment-page')).not.toBeInTheDocument();
  });
});

describe('signed-in routing (preserved behavior)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    platform.native = false;
    equipmentUi.enabled = false;
    navigate('/');
    farmState.current = { ...signedInState };
    sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    auth.signOut.mockResolvedValue({ error: null });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('renders the app at /', async () => {
    renderApp();
    expect(await screen.findByTestId('app-dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quick add record' })).toBeInTheDocument();
  });

  it('bounces /auth back into the app', async () => {
    navigate('/auth');
    renderApp();
    expect(await screen.findByTestId('app-dashboard')).toBeInTheDocument();
  });

  it('does not expose the recovery form to an existing session without a callback', () => {
    navigate('/auth?mode=recovery');
    renderApp();
    expect(screen.queryByRole('heading', { name: 'Choose New Password' })).not.toBeInTheDocument();
  });

  it('keeps a verified recovery session on the new-password screen until it is completed', () => {
    sessionStorage.setItem('al_password_recovery_pending', 'true');
    renderApp();

    expect(screen.getByRole('heading', { name: 'Choose New Password' })).toBeInTheDocument();
    expect(screen.queryByTestId('app-dashboard')).not.toBeInTheDocument();
  });

  it('cancels a pending recovery by signing out and clearing its saved state', async () => {
    sessionStorage.setItem('al_password_recovery_pending', 'true');
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel and Sign In' }));

    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem('al_password_recovery_pending')).toBeNull();
  });

  it('clears a pending recovery when Supabase reports any sign-out', async () => {
    sessionStorage.setItem('al_password_recovery_pending', 'true');
    renderApp();

    const onAuthStateChange = auth.onAuthStateChange.mock.calls.at(-1)?.[0];
    act(() => onAuthStateChange?.('SIGNED_OUT', null));

    await vi.waitFor(() => expect(sessionStorage.getItem('al_password_recovery_pending')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Choose New Password' })).not.toBeInTheDocument();
    expect(screen.getByTestId('app-dashboard')).toBeInTheDocument();
  });

  it('still renders /privacy inside the app shell', async () => {
    navigate('/privacy');
    renderApp();
    expect(await screen.findByText('AcreLedger Privacy Policy')).toBeInTheDocument();
  });

  it('still renders /support inside the app shell', async () => {
    navigate('/support');
    renderApp();
    expect(await screen.findByText('AcreLedger Support')).toBeInTheDocument();
  });

  it('renders /equipment inside the authenticated app when the pilot flag is on', async () => {
    equipmentUi.enabled = true;
    navigate('/equipment');
    renderApp();
    expect(await screen.findByTestId('equipment-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quick add record' })).not.toBeInTheDocument();
  });

  it('hides /equipment when the pilot flag is off', async () => {
    equipmentUi.enabled = false;
    navigate('/equipment');
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByTestId('equipment-page')).not.toBeInTheDocument();
  });

  it('redirects /billing and /subscription to the settings billing section', async () => {
    vi.stubEnv('VITE_BILLING_UI_ENABLED', 'true');
    platform.native = false;
    navigate('/billing');
    const view = renderApp();
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('?section=billing');

    view.unmount();
    navigate('/subscription');
    renderApp();
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('?section=billing');
    vi.unstubAllEnvs();
  });

  it('lands on /settings when billing UI is unavailable', async () => {
    vi.stubEnv('VITE_BILLING_UI_ENABLED', 'true');
    platform.native = true;
    navigate('/billing');
    renderApp();
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('');
    vi.unstubAllEnvs();
  });

  it('shows a focused recovery page without Quick Add for an unknown route', async () => {
    navigate('/missing-page');
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to fields' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Quick add record' })).not.toBeInTheDocument();
  });

  it('stays on the dashboard while onboarding status is still unknown', async () => {
    localStorage.removeItem('user-1_al_onboarding_complete');
    farmState.current = {
      ...signedInState,
      fields: [],
      onboardingComplete: false,
      initialFetchComplete: true,
      onboardingStatusKnown: false,
    };
    renderApp();
    expect(await screen.findByTestId('app-dashboard')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('sends a known new user with no fields to onboarding', async () => {
    localStorage.removeItem('user-1_al_onboarding_complete');
    farmState.current = {
      ...signedInState,
      fields: [],
      onboardingComplete: false,
      initialFetchComplete: true,
      onboardingStatusKnown: true,
    };
    renderApp();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/onboarding'));
    expect(screen.queryByTestId('app-dashboard')).not.toBeInTheDocument();
  });

  it('redirects /setup to settings', async () => {
    navigate('/setup');
    renderApp();
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('');
  });

  it('keeps the query string when redirecting /setup', async () => {
    navigate('/setup?section=billing');
    renderApp();
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('?section=billing');
  });
});
