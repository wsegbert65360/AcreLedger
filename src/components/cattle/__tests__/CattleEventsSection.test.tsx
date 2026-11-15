/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freeEntitlement, type Entitlement } from '@/lib/entitlements';

const farm = vi.hoisted(() => ({
  cattleGroups: [] as unknown[],
  cattleEvents: [] as unknown[],
  deleteCattleEvent: vi.fn(async () => true),
}));
const plan = vi.hoisted(() => ({ entitlement: null as unknown, cachedEntitlement: null as unknown }));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => ({ ...plan, loading: false, failed: false }) }));
vi.mock('@/components/cattle/CattleEventDialog', () => ({ default: () => <div>event dialog</div> }));
vi.mock('@/components/settings/PlanUpgradeLink', () => ({ PlanUpgradeLink: () => <a href="/settings?section=billing">See Pro</a> }));

import CattleEventsSection from '../CattleEventsSection';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import type { CattleGroup } from '@/types/cattle';

const base = { farm_id: 'f', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deleted_at: null };
const group: CattleGroup = { ...base, id: 'g1', name: 'Cows', class: 'cows', headCount: 20 };
const paid: Entitlement = { ...freeEntitlement(true), plan: 'paid' };

beforeEach(() => {
  farm.cattleGroups = [group];
  farm.cattleEvents = [{ ...base, id: 'e1', groupId: 'g1', eventType: 'death', eventDate: '2026-03-02', headDelta: -1 }];
  farm.deleteCattleEvent.mockClear();
  plan.entitlement = null;
  plan.cachedEntitlement = null;
});

const show = () => render(<MemoryRouter><CattleEventsSection group={group} /></MemoryRouter>);

describe('CattleEventsSection Pro gate', () => {
  it('free and enforced: upgrade prompt, no entry controls, existing events visible and removable', () => {
    plan.entitlement = freeEntitlement(true);
    show();
    expect(screen.getByTestId('cattle-events-locked')).toBeTruthy();
    expect(screen.getByText(ENTITLEMENT_COPY.cattleEventsLockedTitle)).toBeTruthy();
    expect(screen.getByText('See Pro')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Log event/ })).toBeNull();
    expect(screen.getByText('Death (-1)')).toBeTruthy();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Delete event/ }));
    expect(farm.deleteCattleEvent).toHaveBeenCalledWith('e1');
  });

  it('uses the cached answer while the live one is loading', () => {
    plan.cachedEntitlement = freeEntitlement(true);
    show();
    expect(screen.getByTestId('cattle-events-locked')).toBeTruthy();
  });

  it('free but not enforced: no lock, controls stay', () => {
    plan.entitlement = freeEntitlement(false);
    show();
    expect(screen.queryByTestId('cattle-events-locked')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Log event/ }));
    expect(screen.getByText('event dialog')).toBeTruthy();
  });

  it('paid, or no answer yet: controls are available', () => {
    plan.entitlement = paid;
    const { unmount } = show();
    expect(screen.getByRole('button', { name: /Log event/ })).toBeTruthy();
    unmount();
    plan.entitlement = null;
    show();
    expect(screen.getByRole('button', { name: /Log event/ })).toBeTruthy();
  });
});
