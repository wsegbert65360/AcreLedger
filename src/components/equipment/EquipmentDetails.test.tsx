/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Equipment } from '@/types/equipment';
import { formatIsoDate } from '@/utils/dates';

import EquipmentDetails from './EquipmentDetails';

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

function details() {
  return screen.getByRole('region', { name: 'Equipment details' });
}

describe('EquipmentDetails', () => {
  it('renders every populated equipment field with a readable label', () => {
    const full = machine({
      kind: 'combine',
      year: 2018,
      make: 'John Deere',
      model: 'S780',
      serialNumber: 'JD1S780-441',
      meterUnit: 'hours',
      currentReading: 1250.5,
      readingUpdatedAt: '2026-05-20T18:00:00.000Z',
      status: 'retired',
      notes: 'Replace the cab filter\nCheck the sieves',
      createdAt: '2026-01-15T18:00:00.000Z',
      updatedAt: '2026-06-02T18:00:00.000Z',
    });

    render(<EquipmentDetails machine={full} />);
    const region = details();

    expect(within(region).getByText('Make').nextElementSibling).toHaveTextContent('John Deere');
    expect(within(region).getByText('Model').nextElementSibling).toHaveTextContent('S780');
    expect(within(region).getByText('Serial number').nextElementSibling).toHaveTextContent('JD1S780-441');
    expect(within(region).getByText('Year').nextElementSibling).toHaveTextContent('2018');
    expect(within(region).getByText('Notes').nextElementSibling).toHaveTextContent('Replace the cab filter');
    expect(within(region).getByText('Notes').nextElementSibling?.textContent).toBe('Replace the cab filter\nCheck the sieves');
    expect(within(region).getByText('Kind').nextElementSibling).toHaveTextContent('Combine');
    expect(within(region).getByText('Status').nextElementSibling).toHaveTextContent('Retired');
    expect(within(region).getByText('Meter unit').nextElementSibling).toHaveTextContent('Hours');
    expect(within(region).getByText('Current reading').nextElementSibling).toHaveTextContent(full.currentReading.toLocaleString());
    expect(within(region).getByText('Reading updated').nextElementSibling).toHaveTextContent(formatIsoDate(full.readingUpdatedAt, 'en-US'));
    expect(within(region).getByText('Added').nextElementSibling).toHaveTextContent(formatIsoDate(full.createdAt, 'en-US'));
    expect(within(region).getByText('Last saved').nextElementSibling).toHaveTextContent(formatIsoDate(full.updatedAt, 'en-US'));
    expect(within(region).queryByText(full.id)).not.toBeInTheDocument();
    expect(within(region).queryByText(full.farm_id)).not.toBeInTheDocument();
  });

  it('hides empty, blank, and whitespace-only fields and still shows a zero reading', () => {
    render(
      <EquipmentDetails
        machine={machine({
          kind: 'truck',
          meterUnit: 'miles',
          currentReading: 0,
          status: 'sold',
          year: undefined,
          make: '   ',
          model: '',
          serialNumber: '\n',
          notes: '  \n  ',
          readingUpdatedAt: '   ',
          createdAt: ' ',
          updatedAt: '',
        })}
      />,
    );
    const region = details();

    expect(within(region).getByText('Kind').nextElementSibling).toHaveTextContent('Truck');
    expect(within(region).getByText('Status').nextElementSibling).toHaveTextContent('Sold');
    expect(within(region).getByText('Meter unit').nextElementSibling).toHaveTextContent('Miles');
    expect(within(region).getByText('Current reading').nextElementSibling).toHaveTextContent('0');

    for (const label of ['Make', 'Model', 'Serial number', 'Year', 'Notes', 'Reading updated', 'Added', 'Last saved']) {
      expect(within(region).queryByText(label)).not.toBeInTheDocument();
    }
    expect(within(region).queryByText(/no serial number/i)).not.toBeInTheDocument();
    expect(within(region).queryByText(/reading date not set/i)).not.toBeInTheDocument();
  });

  it('shows kilometres as km', () => {
    render(<EquipmentDetails machine={machine({ kind: 'sprayer', meterUnit: 'km', currentReading: 42 })} />);
    expect(within(details()).getByText('Meter unit').nextElementSibling).toHaveTextContent('km');
    expect(within(details()).getByText('Kind').nextElementSibling).toHaveTextContent('Sprayer');
  });
});
