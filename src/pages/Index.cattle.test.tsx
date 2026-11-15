/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const farmState = vi.hoisted(() => ({
  farm_id: 'd4124658-d3dc-41e8-9792-b3327954c5c5',
  fields: [{
    id: 'field-1',
    name: 'North Field',
    acreage: 29,
    intendedUse: 'Corn',
    farm_id: 'farm-1',
    deleted_at: null,
  }],
  cluAssignments: [],
  plantRecords: [],
  sprayRecords: [],
  fertilizerApplications: [],
  harvestRecords: [],
  hayHarvestRecords: [],
  viewingSeason: 2026,
  equipment: [] as unknown[],
  maintenanceSchedules: [],
  runsCattle: false,
  cattleGroups: [] as unknown[],
}));

vi.mock('@/store/farmStore', () => ({ useFarm: () => farmState }));
vi.mock('@/context/AskAcreLedgerContext', () => ({
  useAskAcreLedger: () => ({ openAsk: vi.fn() }),
}));
vi.mock('@/components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/FieldList', () => ({ default: () => <div>Field list</div> }));
vi.mock('@/components/FieldManageModal', () => ({ default: () => null }));
vi.mock('@/components/FieldManager', () => ({ default: () => null }));
vi.mock('@/components/Logo', () => ({ default: () => <div>Logo</div> }));
vi.mock('@/components/SeasonSelect', () => ({ default: () => <div>Season</div> }));
vi.mock('@/components/WeatherWidget', () => ({ default: () => <div>Weather</div> }));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/lib/equipment/feature', () => ({ isEquipmentUiEnabled: () => true }));

import Index from './Index';

const machine = { id: 'm1', name: 'JD 8R', farm_id: 'farm-1', deleted_at: null };
const cattle = [
  { id: 'g1', name: 'Cows', headCount: 20, deleted_at: null },
  { id: 'g2', name: 'Calves', headCount: 8, deleted_at: null },
  { id: 'g3', name: 'Sold', headCount: 99, deleted_at: '2026-01-01' },
];

function show(options: { runsCattle: boolean; equipment: unknown[] }) {
  farmState.runsCattle = options.runsCattle;
  farmState.equipment = options.equipment;
  farmState.cattleGroups = cattle;
  return render(<MemoryRouter><Index /></MemoryRouter>);
}

describe('Index cattle tile', () => {
  it('shows no cattle tile when cattle is off, and Equipment stays full width', () => {
    show({ runsCattle: false, equipment: [machine] });
    expect(screen.queryByText('Cattle')).toBeNull();
    const equipment = screen.getByText('Equipment').closest('a')!;
    expect(equipment.parentElement?.className).not.toContain('grid-cols-2');
    expect(equipment.className).toContain('min-h-14');
  });

  it('puts Equipment and Cattle in a two-column grid when both show', () => {
    show({ runsCattle: true, equipment: [machine] });
    const cattleLink = screen.getByText('Cattle').closest('a')!;
    expect(cattleLink.getAttribute('href')).toBe('/cattle');
    expect(cattleLink.parentElement?.className).toContain('grid-cols-2');
    expect(screen.getByText('Equipment').closest('a')!.parentElement).toBe(cattleLink.parentElement);
    expect(screen.getByText('28 head')).toBeTruthy();
    expect(screen.getByText('2 groups')).toBeTruthy();
  });

  it('shows Cattle alone at full width when there are no machines', () => {
    show({ runsCattle: true, equipment: [] });
    const cattleLink = screen.getByText('Cattle').closest('a')!;
    expect(screen.queryByText('Equipment')).toBeNull();
    expect(cattleLink.parentElement?.className).not.toContain('grid-cols-2');
    expect(cattleLink.className).toContain('min-h-14');
  });
});
