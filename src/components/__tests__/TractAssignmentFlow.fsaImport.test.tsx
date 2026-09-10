import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { parseCluFile } from '@/lib/cluImport';
import { useFarm } from '@/store/farmStore';
import type { Field } from '@/types/farm';

import TractAssignmentFlow from '../TractAssignmentFlow';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: vi.fn(),
}));

vi.mock('@/lib/cluImport', () => ({
  parseCluFile: vi.fn(),
}));

vi.mock('@/components/CluAssignmentMap', () => ({
  default: () => <div data-testid="clu-assignment-map" />,
}));

vi.mock('@/components/CluFieldSelector', () => ({
  default: () => <div data-testid="clu-field-selector" />,
}));

const makeField = (overrides: Partial<Field> = {}): Field => ({
  id: 'field-1',
  farm_id: 'farm-1',
  name: 'Home Place',
  acreage: 10,
  deleted_at: null,
  lat: null,
  lng: null,
  ...overrides,
});

const makeTracts = () => [{
  id: 'tract-1',
  farmId: 'farm-1',
  tractKey: '100-200',
  filename: 'original.json',
  featureCount: 1,
  geojson: {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { cluNumber: '10', acres: 5 },
      },
    ],
  },
  importedAt: new Date().toISOString(),
  deletedAt: null,
}];

const replacementCollection = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
      properties: { cluNumber: '10', acres: 6 },
    },
  ],
};

async function armReimportInput() {
  fireEvent.click(await screen.findByText('Imported tracts (1)'));
  fireEvent.click(await screen.findByTitle('Replace with new file'));
  return document.getElementById('reimport-file-input') as HTMLInputElement;
}

describe('TractAssignmentFlow tract replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderFlow = () => {
    const importTract = vi.fn().mockResolvedValue(true);
    (useFarm as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fields: [makeField()],
      fsaTracts: makeTracts(),
      cluAssignments: [],
      addField: vi.fn().mockResolvedValue(true),
      updateField: vi.fn().mockResolvedValue(true),
      importTract,
      deleteTract: vi.fn().mockResolvedValue(true),
      assignClu: vi.fn().mockResolvedValue(true),
      updateCluLandUse: vi.fn().mockResolvedValue(true),
      unassignClu: vi.fn().mockResolvedValue(true),
    });
    render(<TractAssignmentFlow />);
    return { importTract };
  };

  it('rejects a single imported tract whose key differs from the tract being replaced', async () => {
    const { importTract } = renderFlow();
    (parseCluFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tractKey: '9999-1111', collection: replacementCollection },
    ]);

    const input = await armReimportInput();
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { files: [new File(['x'], 'other-tract.zip')] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('It cannot replace this tract.'),
      );
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('9999-1111'));
    expect(importTract).not.toHaveBeenCalled();
  });

  it('rejects a multi-tract file that does not include the target tract', async () => {
    const { importTract } = renderFlow();
    (parseCluFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tractKey: '1111-1', collection: replacementCollection },
      { tractKey: '2222-2', collection: replacementCollection },
    ]);

    const input = await armReimportInput();
    fireEvent.change(input, { target: { files: [new File(['x'], 'multi.zip')] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('1111-1, 2222-2'));
    });
    expect(importTract).not.toHaveBeenCalled();
  });

  it('replaces the tract when the file contains the matching farm/tract key', async () => {
    const { importTract } = renderFlow();
    (parseCluFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { tractKey: '100-200', collection: replacementCollection },
    ]);

    const input = await armReimportInput();
    fireEvent.change(input, { target: { files: [new File(['x'], 'replacement.zip')] } });

    await waitFor(() => {
      expect(importTract).toHaveBeenCalledWith('100-200', 'replacement.zip', replacementCollection, 1);
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('TractAssignmentFlow import guide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useFarm as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fields: [],
      fsaTracts: [],
      cluAssignments: [],
      addField: vi.fn().mockResolvedValue(true),
      updateField: vi.fn().mockResolvedValue(true),
      importTract: vi.fn(),
      deleteTract: vi.fn().mockResolvedValue(true),
      assignClu: vi.fn().mockResolvedValue(true),
      updateCluLandUse: vi.fn().mockResolvedValue(true),
      unassignClu: vi.fn().mockResolvedValue(true),
    });
  });

  it('links to the USDA Service Center locator at the correct URL', async () => {
    render(<TractAssignmentFlow />);

    fireEvent.click(await screen.findByRole('button', { name: /import guide/i }));

    const link = await screen.findByRole('link', { name: /find your usda service center/i });
    expect(link).toHaveAttribute('href', 'https://www.farmers.gov/working-with-us/service-center-locator');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
