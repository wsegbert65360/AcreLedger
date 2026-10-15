/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Bin, Field, HarvestRecord } from '@/types/farm';

import { toast } from 'sonner';

import AddGrainModal from '../AddGrainModal';

const state = vi.hoisted(() => ({
  addHarvestWithGrain: vi.fn().mockResolvedValue(true),
  addGrainMovement: vi.fn().mockResolvedValue(true),
  getBinTotal: vi.fn(() => 1000),
  locale: 'en-US' as 'en-US' | 'en-AU',
}));

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: () => ({ preferences: { country: 'US', locale: state.locale, unitSystem: 'imperial' } }),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addHarvestWithGrain: state.addHarvestWithGrain,
    addGrainMovement: state.addGrainMovement,
    getBinTotal: state.getBinTotal,
    session: { user: { id: 'user-1' } },
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
    state.getBinTotal.mockReturnValue(1000);
    state.locale = 'en-US';
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
    expect(screen.getByLabelText(/landlord %/i)).toHaveValue('25');
    expect(screen.getByLabelText(/landlord %/i)).toHaveAttribute('readonly');
  });

  it('falls back to intended use and preserves a valid zero producer share', async () => {
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-2' } });

    await waitFor(() => expect(screen.getByLabelText(/crop type/i)).toHaveValue('Timber'));
    expect(screen.getByLabelText(/landlord %/i)).toHaveValue('100');
    expect(screen.getByLabelText(/landlord name/i)).toHaveValue('Dad');
  });

  it('keeps a typed landlord name across Back, then reapplies it when the field changes', async () => {
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-2' } });
    await waitFor(() => expect(screen.getByLabelText(/landlord name/i)).toHaveValue('Dad'));

    fireEvent.change(screen.getByLabelText(/landlord name/i), { target: { value: 'Acme Farms' } });
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /harvest from field/i }));

    expect(screen.getByLabelText(/landlord name/i)).toHaveValue('Acme Farms');

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-1' } });
    await waitFor(() => expect(screen.getByLabelText(/landlord name/i)).toHaveValue(''));
  });

  it('focuses bushels instead of the field select when re-entering harvest with a field already chosen', async () => {
    openHarvestPath();

    fireEvent.change(screen.getByTestId('select'), { target: { value: 'field-1' } });
    await waitFor(() => expect(screen.getByLabelText(/crop type/i)).toHaveValue('Corn'));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /harvest from field/i }));

    expect(screen.getByLabelText(/bushels/i)).toHaveFocus();
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
    state.getBinTotal.mockReturnValue(1000);
    state.locale = 'en-US';
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

  it('parses grouped bushels with the app locale and warns without blocking an over-capacity inbound', async () => {
    state.locale = 'en-AU';
    state.getBinTotal.mockReturnValue(59000);
    render(<AddGrainModal bin={bin} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /other \/ inventory adjustment/i }));

    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '1,500.5' } });

    expect(screen.getByText(/this change would exceed bin capacity/i)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /save inventory/i });
    expect(save).toBeEnabled();

    fireEvent.click(save);

    await waitFor(() => expect(state.addGrainMovement).toHaveBeenCalledTimes(1));
    expect(state.getBinTotal).toHaveBeenCalledWith('bin-1');
    expect(state.addGrainMovement).toHaveBeenCalledWith(expect.objectContaining({ bushels: 1500.5 }));
    expect(toast.warning).toHaveBeenCalledWith('This change would exceed bin capacity.');
  });

  it('warns when an inbound load would leave the bin negative, and still saves', async () => {
    state.getBinTotal.mockReturnValue(-50);
    render(<AddGrainModal bin={bin} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /other \/ inventory adjustment/i }));

    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '10' } });

    expect(screen.getByText(/negative bin inventory/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save inventory/i }));

    await waitFor(() => expect(state.addGrainMovement).toHaveBeenCalledTimes(1));
    expect(toast.warning).toHaveBeenCalledWith('This change would leave negative bin inventory.');
  });
});
