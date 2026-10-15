/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
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
  BinManager: ({ initialAddOpen = false }: { initialAddOpen?: boolean }) => (
    <div data-testid="bin-manager" data-initial-add-open={String(initialAddOpen)} />
  ),
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

  it('opens the add-bin form from the empty state', () => {
    render(<Logistics />);

    fireEvent.click(screen.getByRole('button', { name: /^add bin$/i }));

    expect(screen.getByTestId('bin-manager')).toHaveAttribute('data-initial-add-open', 'true');
  });

  it('does not open the add-bin form from the manage button', () => {
    farm.bins = [bin('north', 1000)];
    render(<Logistics />);

    fireEvent.click(screen.getByRole('button', { name: /manage bins/i }));

    expect(screen.getByTestId('bin-manager')).toHaveAttribute('data-initial-add-open', 'false');
  });
});
