import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', async importOriginal => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => platform.native, getPlatform: () => (platform.native ? 'ios' : 'web') },
}));

import Refund from '../Refund';
import Terms from '../Terms';

describe('approved legal policies', () => {
  it.each([['Terms of Service', Terms], ['Refund Policy', Refund]] as const)('renders %s with approved dates and legal navigation', (title, Page) => {
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getByText(`AcreLedger ${title}`)).toBeInTheDocument();
    expect(screen.getByText('Last updated: November 20, 2026')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/FINAL, attorney|DRAFT|internal|effective date, set/);
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of service' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Refund policy' })).toHaveAttribute('href', '/refund');
    expect(container).toHaveTextContent('Australian Consumer Law');
  });
  it('keeps the approved refund timing', () => {
    const { container } = render(<MemoryRouter><Refund /></MemoryRouter>);
    expect(container).toHaveTextContent('if you ask within 30 days of any charge (your first payment or a yearly renewal), we refund that charge in full.');
    expect(container).toHaveTextContent('If a renewal payment fails, you have 14 days to update your card before the farm returns to the free record book. There are no late fees.');
  });

  it('uses USD-only Pro pricing and does not call FSA tract entry Pro', () => {
    const terms = render(<MemoryRouter><Terms /></MemoryRouter>);
    expect(terms.container).toHaveTextContent('US$299 per farm per year, charged in US dollars.');
    expect(terms.container).not.toHaveTextContent('A$299');
    expect(terms.container).not.toHaveTextContent('FSA tract entry');
    expect(terms.container).toHaveTextContent('landlord summaries');
    expect(terms.container).not.toHaveTextContent('landlord statements');
    terms.unmount();

    const refund = render(<MemoryRouter><Refund /></MemoryRouter>);
    expect(refund.container).not.toHaveTextContent('A$299');
    expect(refund.container).not.toHaveTextContent('FSA tract entry');
  });

  describe('inside the iOS app', () => {
    afterEach(() => { platform.native = false; });

    it.each([['Terms', Terms], ['Refund', Refund]] as const)('%s shows no price, Stripe or billing path', (_name, Page) => {
      platform.native = true;
      const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
      expect(container).not.toHaveTextContent(/\$\s?\d|US\$|Stripe|Settings → Billing|per farm per year/);
      expect(container).toHaveTextContent('Australian Consumer Law');
    });

    it('keeps the approved iOS line in Terms', () => {
      platform.native = true;
      const { container } = render(<MemoryRouter><Terms /></MemoryRouter>);
      expect(container).toHaveTextContent('The iOS app does not sell subscriptions or show prices. Subscriptions are managed on the web.');
    });
  });
});
