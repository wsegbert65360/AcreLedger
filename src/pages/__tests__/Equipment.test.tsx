/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Equipment } from '@/types/equipment';
import { formatIsoDate } from '@/utils/dates';

const farm = vi.hoisted(() => ({
  equipment: [] as Equipment[],
  maintenanceSchedules: [] as [],
  maintenanceLogs: [] as [],
  deleteEquipment: vi.fn(async () => true),
  deleteMaintenanceSchedule: vi.fn(async () => true),
  updateEquipmentReading: vi.fn(async () => 'saved' as const),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farm,
}));

vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => null }));

import EquipmentPage from '../Equipment';

function machine(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: 'equip-1',
    farm_id: 'farm-1',
    kind: 'tractor',
    meterUnit: 'hours',
    currentReading: 0,
    status: 'active',
    createdAt: '2026-01-15T18:00:00.000Z',
    updatedAt: '2026-06-02T18:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const fullMachine = machine({
  id: 'equip-full',
  kind: 'combine',
  year: 2018,
  make: 'John Deere',
  model: 'S780',
  serialNumber: 'JD1S780-441',
  currentReading: 1250.5,
  readingUpdatedAt: '2026-05-20T18:00:00.000Z',
  status: 'retired',
  notes: 'Replace the cab filter',
});

const emptyMachine = machine({
  id: 'equip-empty',
  kind: 'truck',
  meterUnit: 'miles',
  currentReading: 0,
  status: 'sold',
  year: undefined,
  make: '   ',
  model: '',
  serialNumber: '  ',
  notes: '\n',
  readingUpdatedAt: ' ',
});

describe('Equipment details', () => {
  beforeEach(() => {
    farm.equipment = [fullMachine, emptyMachine];
    farm.maintenanceSchedules = [];
    farm.maintenanceLogs = [];
  });

  it('shows saved serial and notes on the list card and hides them when blank', () => {
    render(<EquipmentPage />);

    const fullCard = screen.getByRole('button', { name: /John Deere/ });
    expect(fullCard).toHaveTextContent('2018 John Deere S780');
    expect(fullCard).toHaveTextContent('Serial JD1S780-441');
    expect(fullCard).toHaveTextContent('Replace the cab filter');
    expect(fullCard.querySelector('.truncate')).toBeNull();

    const emptyCard = screen.getByRole('button', { name: /Truck/ });
    expect(emptyCard).not.toHaveTextContent('Serial');
    expect(emptyCard).not.toHaveTextContent('Replace the cab filter');
    expect(screen.queryByText(/no serial number/i)).not.toBeInTheDocument();
  });

  it('shows every populated field on the equipment detail screen and hides empty ones', () => {
    render(<EquipmentPage />);

    fireEvent.click(screen.getByRole('button', { name: /John Deere/ }));
    const region = screen.getByRole('region', { name: 'Equipment details' });

    expect(within(region).getByText('Make').nextElementSibling).toHaveTextContent('John Deere');
    expect(within(region).getByText('Model').nextElementSibling).toHaveTextContent('S780');
    expect(within(region).getByText('Serial number').nextElementSibling).toHaveTextContent('JD1S780-441');
    expect(within(region).getByText('Year').nextElementSibling).toHaveTextContent('2018');
    expect(within(region).getByText('Notes').nextElementSibling).toHaveTextContent('Replace the cab filter');
    expect(within(region).getByText('Kind').nextElementSibling).toHaveTextContent('Combine');
    expect(within(region).getByText('Status').nextElementSibling).toHaveTextContent('Retired');
    expect(within(region).getByText('Meter unit').nextElementSibling).toHaveTextContent('Hours');
    expect(within(region).getByText('Current reading').nextElementSibling).toHaveTextContent(fullMachine.currentReading.toLocaleString());
    expect(within(region).getByText('Reading updated').nextElementSibling).toHaveTextContent(formatIsoDate(fullMachine.readingUpdatedAt, 'en-US'));
    expect(within(region).getByText('Added').nextElementSibling).toHaveTextContent(formatIsoDate(fullMachine.createdAt, 'en-US'));
    expect(within(region).getByText('Last saved').nextElementSibling).toHaveTextContent(formatIsoDate(fullMachine.updatedAt, 'en-US'));
    expect(within(region).queryByText(fullMachine.id)).not.toBeInTheDocument();
    expect(screen.queryByText(/no serial number/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reading date not set/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to equipment' }));
    fireEvent.click(screen.getByRole('button', { name: /Truck/ }));
    const emptyRegion = screen.getByRole('region', { name: 'Equipment details' });

    expect(within(emptyRegion).getByText('Kind').nextElementSibling).toHaveTextContent('Truck');
    expect(within(emptyRegion).getByText('Status').nextElementSibling).toHaveTextContent('Sold');
    expect(within(emptyRegion).getByText('Meter unit').nextElementSibling).toHaveTextContent('Miles');
    expect(within(emptyRegion).getByText('Current reading').nextElementSibling).toHaveTextContent('0');
    for (const label of ['Make', 'Model', 'Serial number', 'Year', 'Notes', 'Reading updated']) {
      expect(within(emptyRegion).queryByText(label)).not.toBeInTheDocument();
    }
  });
});
