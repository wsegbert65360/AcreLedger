/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import Logistics from '../Logistics';
import type { Bin, GrainMovement } from '@/types/farm';

const farm = vi.hoisted(() => ({
  bins: [] as Bin[],
  grainMovements: [] as GrainMovement[],
  totals: {} as Record<string, number>,
}));

vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: () => ({ preferences: { country: 'US', locale: 'en-US', unitSystem: 'imperial' } }),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    bins: farm.bins,
    grainMovements: farm.grainMovements,
    getBinTotal: (binId: string) => farm.totals[binId] ?? 0,
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => <div data-testid="sync-status" /> }));
vi.mock('@/components/BinManageModal', () => ({
  default: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Add Bin" /> : null,
  BinManager: () => <div data-testid="bin-manager" />,
}));
vi.mock('@/components/SellModal', () => ({ default: () => null }));
vi.mock('@/components/AddGrainModal', () => ({ default: () => null }));
vi.mock('@/components/grain/BinMonitorPanel', () => ({ default: () => null }));
vi.mock('@/components/grain/BinSiloThumb', () => ({
  default: ({ percentFull }: { percentFull: number }) => <span data-testid="silo" data-percent={percentFull} />,
}));

function bin(id: string, capacity: number): Bin {
  return { id, name: id, capacity, farm_id: 'farm-1', deleted_at: null };
}

describe('Logistics inventory labels', () => {
  beforeEach(() => {
    farm.bins = [];
    farm.grainMovements = [];
    farm.totals = {};
  });

  it('opens the add form directly from the empty state', () => {
    render(<Logistics />);
    fireEvent.click(screen.getByRole('button', { name: /^add bin$/i }));
    expect(screen.getByRole('dialog', { name: 'Add Bin' })).toBeInTheDocument();
    expect(screen.queryByTestId('bin-manager')).toBeNull();
  });

  it('keeps header Manage bins opening the manager', () => {
    farm.bins = [bin('one', 1000)];
    render(<Logistics />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage bins' }));
    expect(screen.getByTestId('bin-manager')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add Bin' })).toBeNull();
  });

  it('labels over-capacity and negative inventory while clamping the fill bar', () => {
    farm.bins = [bin('over', 1000), bin('neg', 1000), bin('ok', 1000)];
    farm.totals = { over: 1500, neg: -40, ok: 500 };

    render(<Logistics />);

    expect(screen.getByRole('button', { name: /over, 100 percent full.*over capacity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neg, 0 percent full.*negative inventory/i })).toBeInTheDocument();
    expect(screen.getByText('Over capacity')).toBeInTheDocument();
    expect(screen.getByText('Negative inventory')).toBeInTheDocument();

    const percents = screen.getAllByTestId('silo').map(node => node.getAttribute('data-percent'));
    expect(percents).toEqual(['100', '0', '50']);
  });
});
