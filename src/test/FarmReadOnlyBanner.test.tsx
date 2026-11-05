import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FarmReadOnlyBanner from '@/components/FarmReadOnlyBanner';

const control = vi.hoisted(() => ({ readOnly: true, reason: 'trial-ended', native: false, billing: true }));
vi.mock('@/lib/native', () => ({ isNativePlatform: () => control.native }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => ({ farmAccess: { readOnly: control.readOnly, reason: control.reason } }) }));
vi.mock('@/lib/billing', () => ({ isBillingUiAvailable: () => control.billing }));

const mount = () => render(<MemoryRouter><FarmReadOnlyBanner /></MemoryRouter>);
beforeEach(() => Object.assign(control, { readOnly: true, reason: 'trial-ended', native: false, billing: true }));

describe('FarmReadOnlyBanner', () => {
  it('renders nothing for a farm with full access', () => {
    control.readOnly = false;
    mount();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('explains an ended trial on the web and links to billing', () => {
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Your free trial has ended. This farm is view-only.');
    expect(screen.getByRole('link', { name: 'Subscribe' })).toHaveAttribute('href', '/settings?section=billing');
  });

  it('names an ended subscription', () => {
    control.reason = 'subscription-ended';
    mount();
    expect(screen.getByRole('status')).toHaveTextContent('Your AcreLedger subscription has ended.');
  });

  it('hides Subscribe when the billing UI is unavailable', () => {
    control.billing = false;
    mount();
    expect(screen.queryByRole('link', { name: 'Subscribe' })).toBeNull();
  });

  it('shows only the view-only fact in the native app', () => {
    control.native = true;
    mount();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('This farm is view-only. You can still view and export your records.');
    expect(status.textContent).not.toMatch(/trial|subscri|\$/i);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
