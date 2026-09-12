/**
 * @vitest-environment jsdom
 *
 * Settings gates the Billing accordion on isBillingUiAvailable, so native
 * builds never expose Stripe checkout, a subscription price, or an external
 * purchase link. Account & Display stays available for deletion.
 */
import { Capacitor } from '@capacitor/core';
import { fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('@/components/VersionFooter', () => ({ default: () => null }));
vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => null }));

import Settings from '../Settings';

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
    render(<Settings />);

    expect(screen.queryByRole('button', { name: /billing/i })).not.toBeInTheDocument();
    expect(screen.queryByText('$299/year')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /account & display/i }));
    expect(screen.getByTestId('account-manager')).toBeInTheDocument();
  });

  it('shows the Billing accordion on web when the UI flag is on', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: /billing/i }));
    expect(screen.getByTestId('billing-manager')).toBeInTheDocument();
    expect(screen.getByText('$299/year')).toBeInTheDocument();
  });
});
