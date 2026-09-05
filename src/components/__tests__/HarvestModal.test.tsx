/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Field, HarvestRecord, GrainMovement } from '@/types/farm';

import HarvestModal from '../HarvestModal';

const state = vi.hoisted(() => ({
  grainMovements: [] as import('@/types/farm').GrainMovement[],
  updateHarvestRecord: vi.fn().mockResolvedValue(true),
  addGrainMovement: vi.fn().mockResolvedValue(true),
  updateGrainMovement: vi.fn().mockResolvedValue(true),
  deleteGrainMovements: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addHarvestRecord: vi.fn().mockResolvedValue(true),
    updateHarvestRecord: state.updateHarvestRecord,
    addGrainMovement: state.addGrainMovement,
    updateGrainMovement: state.updateGrainMovement,
    deleteGrainMovements: state.deleteGrainMovements,
    grainMovements: state.grainMovements,
    harvestRecords: [] as import('@/types/farm').HarvestRecord[],
    bins: [{ id: 'bin-1', farm_id: 'farm-1', name: 'Big Bin', capacity: 50000, deleted_at: null }],
    viewingSeason: 2026,
    session: { user: { id: 'test-user-id' } },
    farmName: 'Test Farm',
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

// Mock Radix primitives to plain elements to avoid jsdom portal behavior,
// mirroring the SprayModal test idiom.
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

const field: Field = {
  id: 'field-1',
  name: 'Home Place',
  acreage: 80,
  lat: null,
  lng: null,
  farm_id: 'farm-1',
  deleted_at: null,
};

function binHarvest(overrides: Partial<HarvestRecord> = {}): HarvestRecord {
  return {
    id: 'harvest-1',
    fieldId: field.id,
    fieldName: field.name,
    destination: 'bin',
    binId: 'bin-1',
    moisturePercent: 15.5,
    landlordSplitPercent: 0,
    bushels: 5000,
    timestamp: 1770000000000,
    seasonYear: 2026,
    farm_id: 'farm-1',
    deleted_at: null,
    ...overrides,
  };
}

function linkedMovement(overrides: Partial<GrainMovement> = {}): GrainMovement {
  return {
    id: 'gm-1',
    farm_id: 'farm-1',
    binId: 'bin-1',
    binName: 'Big Bin',
    type: 'in',
    bushels: 5000,
    moisturePercent: 15.5,
    sourceFieldName: field.name,
    timestamp: 1770000000000,
    harvestRecordId: 'harvest-1',
    seasonYear: 2026,
    deleted_at: null,
    ...overrides,
  };
}

function townHarvest(overrides: Partial<HarvestRecord> = {}): HarvestRecord {
  return binHarvest({ destination: 'town', binId: undefined, ...overrides });
}

describe('HarvestModal linked grain movement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.grainMovements = [];
    state.updateHarvestRecord.mockResolvedValue(true);
    state.addGrainMovement.mockResolvedValue(true);
    state.updateGrainMovement.mockResolvedValue(true);
    state.deleteGrainMovements.mockResolvedValue(true);
  });

  it('deletes the linked movement when destination changes from bin to town', () => {
    state.grainMovements = [linkedMovement()];

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={binHarvest()}
      />,
    );

    // Destination switch happens via Back → Town chooser buttons.
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /town/i }));

    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.updateHarvestRecord).toHaveBeenCalledTimes(1);
      expect(state.updateHarvestRecord.mock.calls[0][0]).toMatchObject({
        id: 'harvest-1',
        destination: 'town',
        bushels: 5000,
      });
      expect(state.deleteGrainMovements).toHaveBeenCalledWith(['gm-1']);
      expect(state.updateGrainMovement).not.toHaveBeenCalled();
      expect(state.addGrainMovement).not.toHaveBeenCalled();
    });
  });

  it('updates the linked movement when the harvest stays in the bin', () => {
    state.grainMovements = [linkedMovement()];

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={binHarvest({ bushels: 4600 })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '4200' } });
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.updateGrainMovement).toHaveBeenCalledTimes(1);
      expect(state.updateGrainMovement.mock.calls[0][0]).toMatchObject({
        id: 'gm-1',
        binId: 'bin-1',
        bushels: 4200,
      });
      expect(state.deleteGrainMovements).not.toHaveBeenCalled();
      expect(state.addGrainMovement).not.toHaveBeenCalled();
    });
  });

  it('updates a leftover movement when a town harvest is switched back to a bin', () => {
    state.grainMovements = [linkedMovement()];

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={townHarvest()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /bin/i }));
    fireEvent.change(screen.getByTestId('select'), { target: { value: 'bin-1' } });
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.updateGrainMovement).toHaveBeenCalledTimes(1);
      expect(state.updateGrainMovement.mock.calls[0][0]).toMatchObject({
        id: 'gm-1',
        binId: 'bin-1',
        bushels: 5000,
        harvestRecordId: 'harvest-1',
      });
      expect(state.addGrainMovement).not.toHaveBeenCalled();
      expect(state.deleteGrainMovements).not.toHaveBeenCalled();
    });
  });

  it('prefers the explicitly-linked movement over a legacy field+timestamp match', () => {
    // Pre-index doubles: a legacy unlinked leftover plus a linked row for the
    // same harvest. Updating the legacy row would stamp harvestRecordId onto
    // it and collide with the linked row's unique active-per-harvest index.
    const legacy = linkedMovement({ id: 'gm-legacy', harvestRecordId: undefined });
    state.grainMovements = [legacy, linkedMovement()];

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={binHarvest()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.updateGrainMovement).toHaveBeenCalledTimes(1);
      expect(state.updateGrainMovement.mock.calls[0][0]).toMatchObject({
        id: 'gm-1',
        harvestRecordId: 'harvest-1',
      });
      expect(state.deleteGrainMovements).toHaveBeenCalledWith(['gm-legacy']);
      expect(state.addGrainMovement).not.toHaveBeenCalled();
    });
  });

  it('deletes both the linked movement and leftover when destination changes to town', () => {
    const legacy = linkedMovement({ id: 'gm-legacy', harvestRecordId: undefined });
    state.grainMovements = [legacy, linkedMovement()];

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={binHarvest()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /town/i }));
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.deleteGrainMovements).toHaveBeenCalledWith(['gm-1', 'gm-legacy']);
      expect(state.updateGrainMovement).not.toHaveBeenCalled();
      expect(state.addGrainMovement).not.toHaveBeenCalled();
    });
  });

  it('does not restore the harvest when leftover grain cannot be removed after a successful bin update', () => {
    const legacy = linkedMovement({ id: 'gm-legacy', harvestRecordId: undefined });
    state.grainMovements = [legacy, linkedMovement()];
    state.deleteGrainMovements.mockResolvedValue(false);

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={binHarvest({ bushels: 4600 })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '4200' } });
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.updateGrainMovement).toHaveBeenCalledTimes(1);
      expect(state.deleteGrainMovements).toHaveBeenCalledWith(['gm-legacy']);
      expect(state.updateHarvestRecord).toHaveBeenCalledTimes(1);
    });
  });

  it('asks addGrainMovement to create the link when no leftover is in memory', () => {
    // Empty local snapshot: the hook (not the modal) is responsible for
    // remote leftover lookup / dedupe before insert.
    state.grainMovements = [];

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={townHarvest()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /bin/i }));
    fireEvent.change(screen.getByTestId('select'), { target: { value: 'bin-1' } });
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.addGrainMovement).toHaveBeenCalledTimes(1);
      expect(state.addGrainMovement.mock.calls[0][0]).toMatchObject({
        binId: 'bin-1',
        type: 'in',
        harvestRecordId: 'harvest-1',
      });
      expect(state.updateGrainMovement).not.toHaveBeenCalled();
    });
  });

  it('deletes a leftover movement when a town harvest stays in town', () => {
    state.grainMovements = [linkedMovement()];

    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={townHarvest()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '4800' } });
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.deleteGrainMovements).toHaveBeenCalledWith(['gm-1']);
      expect(state.addGrainMovement).not.toHaveBeenCalled();
      expect(state.updateGrainMovement).not.toHaveBeenCalled();
    });
  });

  it('restores the harvest when bin-to-town grain removal fails', () => {
    state.grainMovements = [linkedMovement()];
    state.deleteGrainMovements.mockResolvedValue(false);

    const original = binHarvest();
    render(
      <HarvestModal
        field={field}
        open
        onClose={() => {}}
        initialData={original}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(screen.getByRole('button', { name: /town/i }));
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));

    return waitFor(() => {
      expect(state.deleteGrainMovements).toHaveBeenCalledWith(['gm-1']);
      expect(state.updateHarvestRecord).toHaveBeenCalledTimes(2);
      expect(state.updateHarvestRecord.mock.calls[0][0]).toMatchObject({
        id: 'harvest-1',
        destination: 'town',
      });
      expect(state.updateHarvestRecord.mock.calls[1][0]).toEqual(original);
    });
  });
});

it('saves a selected local harvest time to the harvest and linked bin movement', async () => {
  vi.clearAllMocks();
  state.grainMovements = [linkedMovement()];
  state.updateHarvestRecord.mockResolvedValue(true);
  state.updateGrainMovement.mockResolvedValue(true);
  render(<HarvestModal field={field} open onClose={() => {}} initialData={binHarvest()} />);
  fireEvent.change(screen.getByLabelText('HARVEST DATE'), { target: { value: '2026-09-03' } });
  fireEvent.change(screen.getByLabelText('HARVEST TIME'), { target: { value: '19:45' } });
  fireEvent.click(screen.getByRole('button', { name: /update record/i }));
  const timestamp = new Date(2026, 8, 3, 19, 45).getTime();
  await waitFor(() => expect(state.updateGrainMovement).toHaveBeenCalledWith(expect.objectContaining({ timestamp })));
  expect(state.updateHarvestRecord).toHaveBeenCalledWith(expect.objectContaining({ harvestDate: '2026-09-03', timestamp }));
});
