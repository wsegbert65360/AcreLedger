import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFarm } from '@/store/farmStore';
import type { Field } from '@/types/farm';

import TractAssignmentFlow from '../TractAssignmentFlow';

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Check: () => <span>Check</span>,
    X: () => <span>X</span>,
    Trash2: () => <span>Trash2</span>,
    Info: () => <span>Info</span>,
    AlertCircle: () => <span>AlertCircle</span>,
    HelpCircle: () => <span>HelpCircle</span>,
  };
});

vi.mock('@/store/farmStore', () => ({
  useFarm: vi.fn(),
}));

vi.mock('@/components/CluAssignmentMap', () => ({
  default: ({ onToggleClu, selectedFieldId }: any) => (
    <div data-testid="clu-assignment-map">
      <span data-testid="selected-field">{selectedFieldId}</span>
      <button onClick={() => onToggleClu('100-200', '10', 5)}>Toggle CLU 10</button>
      <button onClick={() => onToggleClu('100-200', '12', 3)}>Toggle CLU 12</button>
    </div>
  ),
}));

vi.mock('@/components/CluFieldSelector', () => ({
  default: ({ onSelectField }: any) => (
    <div data-testid="clu-field-selector">
      <button onClick={() => onSelectField('field-1')}>Select Field 1</button>
    </div>
  ),
}));

const makeField = (overrides: Partial<Field> = {}): Field => ({
  id: 'field-1',
  farm_id: 'farm-1',
  name: 'Legacy Field',
  acreage: 10,
  fsaFarmNumber: '100',
  fsaTractNumber: '200',
  cluNumbers: ['10', '11'],
  deleted_at: null,
  ...overrides,
});

const makeTracts = () => [{
  id: 'tract-1',
  farmId: 'farm-1',
  tractKey: '100-200',
  filename: 'test.json',
  featureCount: 3,
  geojson: {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { cluNumber: '10', acres: 5 },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] },
        properties: { cluNumber: '11', acres: 5 },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
        properties: { cluNumber: '12', acres: 3 },
      },
    ],
  },
  importedAt: new Date().toISOString(),
  deletedAt: null,
}];

describe('TractAssignmentFlow Legacy Toggling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderFlow = (overrides: Record<string, unknown> = {}, onDone?: () => void) => {
    const mockUpdateField = vi.fn().mockResolvedValue(true);
    const mockAssignClu = vi.fn().mockResolvedValue(true);

    (useFarm as any).mockReturnValue({
      fields: [makeField()],
      fsaTracts: makeTracts(),
      cluAssignments: [],
      addField: vi.fn().mockResolvedValue(true),
      updateField: mockUpdateField,
      importTract: vi.fn(),
      deleteTract: vi.fn(),
      assignClu: mockAssignClu,
      updateCluLandUse: vi.fn().mockResolvedValue(true),
      unassignClu: vi.fn().mockResolvedValue(true),
      ...overrides,
    });

    render(<TractAssignmentFlow onDone={onDone} />);
    return { mockUpdateField, mockAssignClu };
  };

  const selectField = async () => {
    fireEvent.click(await screen.findByText('Select Field 1'));
    await waitFor(() => {
      expect(screen.getByTestId('selected-field').textContent).toBe('field-1');
    });
  };

  it('does not rewrite the field when promoting a same-field legacy assignment that is already synced', async () => {
    const { mockUpdateField, mockAssignClu } = renderFlow();

    await selectField();
    fireEvent.click(await screen.findByText('Toggle CLU 10'));

    await waitFor(() => {
      expect(mockAssignClu).toHaveBeenCalledWith('field-1', '100-200', '10', 5, 'cropland');
    });
    expect(mockUpdateField).not.toHaveBeenCalled();
  });

  it('preserves existing legacy CLUs when assigning a new CLU and only saves the selected field', async () => {
    const { mockUpdateField } = renderFlow({
      fields: [
        makeField(),
        makeField({
          id: 'field-2',
          name: 'Untouched Field',
          acreage: 7,
          cluNumbers: ['20'],
        }),
      ],
    });

    await selectField();
    fireEvent.click(await screen.findByText('Toggle CLU 12'));

    await waitFor(() => {
      expect(mockUpdateField).toHaveBeenCalledTimes(1);
      expect(mockUpdateField).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'field-1',
          cluNumbers: ['10', '11', '12'],
          acreage: 10,
        }),
      );
    });
    expect(mockUpdateField).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'field-2' }));
  });

  it('allows Done when a tract has no assigned CLUs', async () => {
    const onDone = vi.fn();
    renderFlow({ fields: [makeField({ acreage: 0, cluNumbers: [] })] }, onDone);

    fireEvent.click(await screen.findByRole('button', { name: /done/i }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
