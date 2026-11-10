import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlanCard from '@/components/settings/PlanCard';
import { ENTITLEMENT_COPY, freePlanIncluded, paidPlanAdds } from '@/copy/entitlements';
import { freeEntitlement, type Entitlement } from '@/lib/entitlements';

let mockEntitlement: Entitlement | null = null;
let mockBillingUi = true;
let mockIosUrl: string | null = null;
const mockOpen = vi.fn();

vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({ entitlement: mockEntitlement, loading: false }),
}));
vi.mock('@/lib/billing', () => ({ isBillingUiAvailable: () => mockBillingUi }));
vi.mock('@/hooks/useIosUpgradeLink', () => ({ useIosUpgradeLink: () => ({ url: mockIosUrl, open: mockOpen }) }));

const renderCard = () => render(<MemoryRouter><PlanCard /></MemoryRouter>);

describe('PlanCard', () => {
  beforeEach(() => {
    mockEntitlement = null;
    mockBillingUi = true;
    mockIosUrl = null;
    mockOpen.mockClear();
  });

  it('renders nothing while the server is not enforcing', () => {
    mockEntitlement = freeEntitlement(false);
    renderCard();
    expect(screen.queryByTestId('plan-card')).toBeNull();
  });

  it('renders nothing before the entitlement loads', () => {
    renderCard();
    expect(screen.queryByTestId('plan-card')).toBeNull();
  });

  it('shows the free plan with an upgrade link on web', () => {
    mockEntitlement = freeEntitlement(true);
    renderCard();
    expect(screen.getByText(ENTITLEMENT_COPY.planFreeName)).toBeTruthy();
    expect(screen.getByText(ENTITLEMENT_COPY.planFreeSummary)).toBeTruthy();
    for (const line of [...freePlanIncluded(), ...paidPlanAdds()]) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    expect(screen.getByText(/Daily rainfall on your two oldest fields/)).toBeTruthy();
    expect(screen.getByText('Prepared FSA-578, spray log, fertilizer, and landlord reports')).toBeTruthy();
    expect(screen.getByText('Rainfall on all remaining fields, hourly')).toBeTruthy();
    expect(screen.queryByText(/photo/i)).toBeNull();
    expect(screen.getByRole('link', { name: ENTITLEMENT_COPY.planUpgradeLink }).getAttribute('href'))
      .toBe('/settings?section=billing');
  });

  it('shows no link and only the website pointer where billing UI is unavailable (iOS)', () => {
    mockEntitlement = freeEntitlement(true);
    mockBillingUi = false;
    renderCard();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(ENTITLEMENT_COPY.nativeManageOnWeb)).toBeTruthy();
  });

  it('on iOS shows a website button (not a router link) only when the US-storefront link resolved', () => {
    mockEntitlement = freeEntitlement(true);
    mockBillingUi = false;
    mockIosUrl = 'https://acreledger.com/plans';
    renderCard();
    const button = screen.getByRole('button', { name: ENTITLEMENT_COPY.planUpgradeLinkWebsite });
    button.click();
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(ENTITLEMENT_COPY.nativeManageOnWeb)).toBeNull();
  });

  it('shows full access, without upgrade prompts, for a paid farm', () => {
    mockEntitlement = { ...freeEntitlement(true), plan: 'paid' };
    renderCard();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Full access to every feature.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
