import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { parseCluFile } from '@/lib/cluImport';
import { useFarm } from '@/store/farmStore';
import type { ParsedCluTract } from '@/lib/cluImport';

import FsaTractImporter from '../FsaTractImporter';

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

function makeTract(tractKey: string, featureCount: number): ParsedCluTract {
  return {
    tractKey,
    collection: {
      type: 'FeatureCollection',
      features: Array.from({ length: featureCount }, () => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { cluNumber: '1', acres: 1 },
      })),
    },
  };
}

describe('FsaTractImporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderImporter = (importTract = vi.fn().mockResolvedValue(true)) => {
    (useFarm as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ importTract });
    const utils = render(<FsaTractImporter />);
    return { importTract, ...utils };
  };

  it('accepts ZIP, JSON, and GeoJSON files', () => {
    const { container } = renderImporter();
    expect(screen.getByRole('button', { name: /load boundary file/i })).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toHaveAttribute('accept', '.zip,.json,.geojson');
  });

  it('calls importTract once per tract returned by the shared parser', async () => {
    const { importTract, container } = renderImporter();
    (parseCluFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeTract('6418-1417', 2),
      makeTract('7653-12050', 1),
    ]);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['zip-bytes'], 'farm.zip')] } });

    await waitFor(() => {
      expect(importTract).toHaveBeenCalledTimes(2);
    });
    expect(importTract).toHaveBeenCalledWith('6418-1417', 'farm.zip', expect.anything(), 2);
    expect(importTract).toHaveBeenCalledWith('7653-12050', 'farm.zip', expect.anything(), 1);
  });

  it('does not import anything when the file cannot be parsed', async () => {
    const { importTract, container } = renderImporter();
    (parseCluFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('This ZIP does not contain a complete shapefile. Ask FSA to include the SHP, DBF, SHX, and PRJ files.'),
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['junk'], 'broken.zip')] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('does not contain a complete shapefile'),
      );
    });
    expect(importTract).not.toHaveBeenCalled();
  });
});
