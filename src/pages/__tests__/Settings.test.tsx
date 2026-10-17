/**
 * @vitest-environment jsdom
 *
 * Settings gates the Billing accordion on isBillingUiAvailable, so native
 * builds never expose Stripe checkout, a subscription price, or an external
 * purchase link. Account & Display stays available for deletion.
 */
import { Capacitor } from '@capacitor/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/settings/FsaTractManager', () => ({ default: () => null }));
vi.mock('@/components/settings/SeedManager', () => ({ default: () => null }));
vi.mock('@/components/settings/RecipeManager', () => ({ default: () => null }));
vi.mock('@/components/settings/FertilizerRecipeManager', () => ({ default: () => null }));
vi.mock('@/components/settings/DisplayManager', () => ({ default: () => null }));
vi.mock('@/components/settings/BillingManager', () => ({
  default: () => <div data-testid="billing-manager">$299/year</div>,
}));
vi.mock('@/components/settings/SyncStatus', () => ({ default: () => null }));
vi.mock('@/components/settings/BackupManager', () => ({ default: () => null }));
vi.mock('@/components/settings/SecurityManager', () => ({ default: () => null }));
vi.mock('@/components/settings/AccountManager', () => ({
  default: () => <div data-testid="account-manager">Delete Account</div>,
}));
vi.mock('@/components/settings/DevTools', () => ({ default: () => null }));
vi.mock('@/components/settings/RegionManager', () => ({
  default: () => <div data-testid="region-manager" />,
}));
vi.mock('@/components/VersionFooter', () => ({ default: () => null }));
vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => null }));

const farmControl = vi.hoisted(() => ({
  session: { user: { email: 'farmer@example.com' } } as { user: { email?: string | null; id?: string } } | null,
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({ session: farmControl.session }),
}));

import Settings from '../Settings';

function renderSettings(path = '/settings') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Settings />
    </MemoryRouter>,
  );
}

describe('Settings billing gate', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BILLING_UI_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('hides the Billing accordion on native platforms', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    renderSettings();

    expect(screen.queryByRole('button', { name: /billing/i })).not.toBeInTheDocument();
    expect(screen.queryByText('$299/year')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /account & display/i }));
    expect(screen.getByTestId('account-manager')).toBeInTheDocument();
  });

  it('shows the Billing accordion on web when the UI flag is on', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /billing/i }));
    expect(screen.getByTestId('billing-manager')).toBeInTheDocument();
    expect(screen.getByText('$299/year')).toBeInTheDocument();
  });

  it('opens and scrolls to billing from ?section=billing', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderSettings('/settings?section=billing');

    expect(screen.getByRole('button', { name: /billing/i })).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('billing-manager')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    HTMLElement.prototype.scrollIntoView = original;
  });

  it('keeps the default section for an unknown section query', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    renderSettings('/settings?section=nope');

    expect(screen.getByRole('button', { name: /farm data/i })).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: /billing/i })).toHaveAttribute('data-state', 'closed');
  });

  it('does not open billing from the section query when billing UI is unavailable', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    renderSettings('/settings?section=billing');

    expect(screen.queryByRole('button', { name: /billing/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /farm data/i })).toHaveAttribute('data-state', 'open');
    expect(screen.queryByTestId('billing-manager')).not.toBeInTheDocument();
  });
});

describe('Settings AU pilot gate', () => {
  beforeEach(() => {
    localStorage.clear();
    farmControl.session = { user: { email: 'farmer@example.com' } };
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function openAccountDisplay() {
    fireEvent.click(screen.getByRole('button', { name: /account & display/i }));
  }

  it('hides the region card by default', () => {
    renderSettings();
    openAccountDisplay();
    expect(screen.queryByTestId('region-manager')).not.toBeInTheDocument();
  });

  it('shows the region card when the pilot flag is exactly true', () => {
    vi.stubEnv('VITE_AU_PILOT_ENABLED', 'true');
    renderSettings();
    openAccountDisplay();
    expect(screen.getByTestId('region-manager')).toBeInTheDocument();
  });

  it('shows the region card when the allowlist contains the session email in a different case', () => {
    farmControl.session = { user: { email: 'Farmer@Example.com' } };
    vi.stubEnv('VITE_AU_PILOT_ALLOWLIST', 'farmer@example.com');
    renderSettings();
    openAccountDisplay();
    expect(screen.getByTestId('region-manager')).toBeInTheDocument();
  });

  it('hides the region card for an email that is not on the allowlist', () => {
    farmControl.session = { user: { email: 'other@example.com' } };
    vi.stubEnv('VITE_AU_PILOT_ALLOWLIST', 'farmer@example.com');
    renderSettings();
    openAccountDisplay();
    expect(screen.queryByTestId('region-manager')).not.toBeInTheDocument();
  });

  it('shows the region card when the allowlist contains the session user id', () => {
    farmControl.session = { user: { id: 'User-1', email: 'other@example.com' } };
    vi.stubEnv('VITE_AU_PILOT_ALLOWLIST', 'User-1');
    renderSettings();
    openAccountDisplay();
    expect(screen.getByTestId('region-manager')).toBeInTheDocument();
  });

  it('shows the region card when the saved country is already AU and the pilot gate is off', async () => {
    farmControl.session = { user: { id: 'user-au', email: 'other@example.com' } };
    localStorage.setItem(
      'user-au_al_app_prefs',
      JSON.stringify({ country: 'AU', locale: 'en-AU', unitSystem: 'metric' }),
    );
    renderSettings();
    openAccountDisplay();
    expect(await screen.findByTestId('region-manager')).toBeInTheDocument();
  });
});
