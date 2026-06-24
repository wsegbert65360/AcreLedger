import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TractAssignmentFlow from '../TractAssignmentFlow';
import { useFarm } from '@/store/farmStore';
import type { Field } from '@/types/farm';

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

describe('TractAssignmentFlow Legacy Toggling', () => {
  it('calls updateField to remove cluNumber on first tap of a legacy assignment', async () => {
    const mockUpdateField = vi.fn().mockResolvedValue(true);
    
    const field: Field = {
      id: 'field-1',
      farm_id: 'farm-1',
      name: 'Legacy Field',
      acreage: 10,
      fsaFarmNumber: '100',
      fsaTractNumber: '200',
      cluNumbers: ['10', '11'], // Has legacy CLUs
      deleted_at: null,
    };

    const mockTracts = [{
      id: 'tract-1',
      farmId: 'farm-1',
      tractKey: '100-200',
      filename: 'test.json',
      featureCount: 2,
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
          }
        ]
      },
      importedAt: new Date().toISOString(),
      deletedAt: null,
    }];

    const mockAssignments = []; // Legacy uses field.cluNumbers

    (useFarm as any).mockReturnValue({
      fields: [field],
      fsaTracts: mockTracts,
      cluAssignments: mockAssignments,
      updateField: mockUpdateField,
      importTract: vi.fn(),
      deleteTract: vi.fn(),
      assignClu: vi.fn(),
      unassignClu: vi.fn(),
    });

    render(<TractAssignmentFlow />);

    // Force selection of field-1
    const selectFieldButton = await screen.findByText('Select Field 1');
    fireEvent.click(selectFieldButton);

    // Wait for the map to reflect the selected field
    await waitFor(() => {
      expect(screen.getByTestId('selected-field').textContent).toBe('field-1');
    });
    
    // Click the mocked toggle button
    const toggleButton = await screen.findByText('Toggle CLU 10');
    fireEvent.click(toggleButton);

    // Verify updateField was called to remove '10'
    await waitFor(() => {
      expect(mockUpdateField).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'field-1',
          cluNumbers: ['11'] // '10' should be removed
        })
      );
    });
  });
});
