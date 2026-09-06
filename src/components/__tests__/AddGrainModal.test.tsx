/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Bin, Field, HarvestRecord } from '@/types/farm';

import AddGrainModal from '../AddGrainModal';

const state = vi.hoisted(() => ({
  addHarvestWithGrain: vi.fn().mockResolvedValue(true),
  addGrainMovement: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addHarvestWithGrain: state.addHarvestWithGrain,
    addGrainMovement: state.addGrainMovement,
    fields: [
      {
        id: 'field-1', name: 'Harry Middle', acreage: 40, lat: null, lng: null,
        farm_id: 'farm-1', producerShare: 75, deleted_at: null,
      },
      {
        id: 'field-2', name: 'Timber', acreage: 30, lat: null, lng: null,
        farm_id: 'farm-1', intendedUse: 'Timber', producerShare: 0, landlordName: 'Dad', deleted_at: null,
      },
      {
        id: 'field-3', name: 'Old Field', acreage: 10, lat: null, lng: null,
        farm_id: 'farm-1', deleted_at: '2026-01-01T00:00:00Z',
      },
    ] as Field[],
    harvestRecords: [
      {
        id: 'h-1', fieldId: 'field-1', fieldName: 'Harry Middle', destination: 'bin',
        moisturePercent: 15, landlordSplitPercent: 25, bushels: 410, timestamp: Date.now(),
        seasonYear: 2026, crop: 'Corn', farm_id: 'farm-1', deleted_at: null,
      },
    ] as HarvestRecord[],
    viewingSeason: 2026,
  }),
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: {
      error: vi.fn(),
      success: vi.fn(),
      light: vi.fn(),
    },
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => {
  const collectOptions = (node: any): any[] => {
    if (!node) return [];
    if (Array.isArray(node)) return node.flatMap(collectOptions);
    if (node.props?.value != null) return [node];
    return collectOptions(node.props?.children);
  };
  return {
    Select: ({ children, value, onValueChange }: any) => (
      <select value={value} onChange={e => onValueChange(e.target.value)} data-testid="select">
        {collectOptions(children)}
      </select>
    ),
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: () => null,
  };
});

const bin: Bin = {
  id: 'bin-1',
  name: 'Bin 2',
  capacity: 60000,
  farm_id: 'farm-1',
  deleted_at: null,
};

function openHarvestPath() {
  render(<AddGrainModal bin={bin} open onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /harvest from field/i }));
}

describe('AddGrainModal harvest path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.addHarvestWithGrain.mockResolvedValue(true);
    state.addGrainMovement.mockResolvedValue(true);
  });

  it('offers the harvest chooser before any form', () => {
    render(<AddGrainModal bin={bin} open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /harvest from field/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /other \/ inventory adjustment/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/bushels/i)).not.toBeInTheDocument();
  });

  it('hides soft-deleted fields from the source field picker', () => {
    openHarvestPath();

    const options = Array.from(screen.getByTestId('select').querySelectorAll('option'));
    const names = options.map(option => option.textContent);
    expect(names).toContain('Harry Middle');
    expect(names).toContain('Timber');
    expect(names).not.toContain('Old Field');
  });

  it('prefills crop from the field\u2019s latest harvest and landlord split from producer share', async () => {
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-1' } });

    await waitFor(() => expect(screen.getByLabelText(/crop type/i)).toHaveValue('Corn'));
    expect(screen.getByLabelText(/landlord %/i)).toHaveValue(25);
  });

  it('falls back to intended use and preserves a valid zero producer share', async () => {
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-2' } });

    await waitFor(() => expect(screen.getByLabelText(/crop type/i)).toHaveValue('Timber'));
    expect(screen.getByLabelText(/landlord %/i)).toHaveValue(100);
  });

  it('disables save until a crop is present', async () => {
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-1' } });
    await waitFor(() => expect(screen.getByLabelText(/crop type/i)).toHaveValue('Corn'));
    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '410' } });

    const save = screen.getByRole('button', { name: /save harvest/i });
    expect(save).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/crop type/i), { target: { value: '' } });
    expect(save).toBeDisabled();
  });

  it('creates the harvest and linked bin movement atomically via addHarvestWithGrain', async () => {
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-1' } });
    await waitFor(() => expect(screen.getByLabelText(/crop type/i)).toHaveValue('Corn'));
    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '410' } });

    fireEvent.click(screen.getByRole('button', { name: /save harvest/i }));

    await waitFor(() => expect(state.addHarvestWithGrain).toHaveBeenCalledTimes(1));
    const payload = state.addHarvestWithGrain.mock.calls[0][0];
    expect(payload.harvest).toEqual(expect.objectContaining({
      fieldId: 'field-1',
      fieldName: 'Harry Middle',
      destination: 'bin',
      binId: 'bin-1',
      bushels: 410,
      crop: 'Corn',
      landlordSplitPercent: 25,
    }));
    expect(payload.grainMovement).toEqual(expect.objectContaining({
      binId: 'bin-1',
      binName: 'Bin 2',
      type: 'in',
      bushels: 410,
      sourceFieldName: 'Harry Middle',
      harvestRecordId: payload.harvest.id,
    }));
    expect(state.addGrainMovement).not.toHaveBeenCalled();
  });

  it('retries a failed atomic create with the same harvest and movement IDs', async () => {
    state.addHarvestWithGrain
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-1' } });
    await waitFor(() => expect(screen.getByLabelText(/crop type/i)).toHaveValue('Corn'));
    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '410' } });

    const save = screen.getByRole('button', { name: /save harvest/i });
    fireEvent.click(save);
    await waitFor(() => expect(state.addHarvestWithGrain).toHaveBeenCalledTimes(1));
    fireEvent.click(save);
    await waitFor(() => expect(state.addHarvestWithGrain).toHaveBeenCalledTimes(2));

    const first = state.addHarvestWithGrain.mock.calls[0][0];
    const retry = state.addHarvestWithGrain.mock.calls[1][0];
    expect(first.harvest.id).toBe(retry.harvest.id);
    expect(first.grainMovement.id).toBe(retry.grainMovement.id);
  });
});

describe('AddGrainModal adjustment path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.addHarvestWithGrain.mockResolvedValue(true);
    state.addGrainMovement.mockResolvedValue(true);
  });

  it('keeps the plain inventory movement behavior without creating a harvest', async () => {
    render(<AddGrainModal bin={bin} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /other \/ inventory adjustment/i }));

    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/source \/ field name/i), { target: { value: 'Home Place' } });

    fireEvent.click(screen.getByRole('button', { name: /save inventory/i }));

    await waitFor(() => expect(state.addGrainMovement).toHaveBeenCalledTimes(1));
    expect(state.addGrainMovement).toHaveBeenCalledWith(expect.objectContaining({
      binId: 'bin-1',
      binName: 'Bin 2',
      type: 'in',
      bushels: 100,
      sourceFieldName: 'Home Place',
    }));
    expect(state.addHarvestWithGrain).not.toHaveBeenCalled();
  });
});
