/**
 * @vitest-environment jsdom
 *
 * Routing invariants for Activity.tsx (AGENTS.md): query-driven tab selection,
 * one-time editor opening from readiness deep links (?record=&type=) gated by
 * the editingRecordType discriminator (works from the All tab), and the spray
 * review queue staying season + search scoped.
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import type { Field, PlantRecord, SprayRecord, ActivityRecord } from '@/types/farm';

const undoMock = vi.hoisted(() => ({ requestDelete: vi.fn(), options: null as null | {
  onCommit: (ids: string[], records: ActivityRecord[], farmId: string | null) => Promise<void | boolean>;
} }));
vi.mock('@/hooks/useUndoDelete', () => ({
  useUndoDelete: (options: typeof undoMock.options) => {
    undoMock.options = options;
    return { pending: new Set<string>(), requestDelete: undoMock.requestDelete };
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// --- Shared mock plumbing ---
const farmMock: { current: Record<string, unknown> } = { current: {} };

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmMock.current
}));

vi.mock('@/context/QuickAddContext', () => ({
  useQuickAdd: () => ({ openQuickAdd: vi.fn() })
}));

vi.mock('@/lib/native', () => ({
  native: { haptic: { error: vi.fn(), success: vi.fn(), light: vi.fn() } }
}));

// Modals render a testid when open; SprayModal exposes a close button so the
// one-time-open guard can be exercised. Factories must be self-contained:
// vi.mock is hoisted above module-scope helpers (TDZ).
vi.mock('@/components/SprayModal', () => ({
  default: ({ open, onClose }: any) => open
    ? <div data-testid="spray-modal"><button data-testid="spray-modal-close" onClick={onClose}>close</button></div>
    : null
}));
vi.mock('@/components/PlantModal', () => ({
  default: ({ open }: any) => open ? <div data-testid="plant-modal" /> : null
}));
vi.mock('@/components/HarvestModal', () => ({
  default: ({ open }: any) => open ? <div data-testid="harvest-modal" /> : null
}));
vi.mock('@/components/HayModal', () => ({
  default: ({ open }: any) => open ? <div data-testid="hay-modal" /> : null
}));
vi.mock('@/components/CustomSprayModal', () => ({
  default: ({ open }: any) => open ? <div data-testid="custom-spray-modal" /> : null
}));
vi.mock('@/components/FertilizerModal', () => ({
  default: ({ open }: any) => open ? <div data-testid="fertilizer-modal" /> : null
}));
vi.mock('@/components/TillageModal', () => ({
  default: ({ open }: any) => open ? <div data-testid="tillage-modal" /> : null
}));
vi.mock('@/components/GrainMovementModal', () => ({
  default: ({ open }: any) => open ? <div data-testid="grain-modal" /> : null
}));
vi.mock('@/components/DeletedFieldFallback', () => ({ default: () => <div data-testid="deleted-field-fallback" /> }));
vi.mock('@/components/SeasonSelect', () => ({ default: () => <div data-testid="season-select" /> }));
vi.mock('@/components/SyncStatusIndicator', () => ({ default: () => <div data-testid="sync-status" /> }));

vi.mock('@/components/activity/PlantTab', () => ({ default: ({ records }: any) => <div data-testid="plant-tab" data-count={records.length} /> }));
vi.mock('@/components/activity/SprayTab', () => ({ default: ({ records }: any) => <div data-testid="spray-tab" data-count={records.length} /> }));
vi.mock('@/components/activity/HarvestTab', () => ({ default: ({ records }: any) => <div data-testid="harvest-tab" data-count={records.length} /> }));
vi.mock('@/components/activity/HayTab', () => ({ default: ({ records }: any) => <div data-testid="hay-tab" data-count={records.length} /> }));
vi.mock('@/components/activity/CustomSprayTab', () => ({ default: ({ records }: any) => <div data-testid="custom-spray-tab" data-count={records.length} /> }));
vi.mock('@/components/activity/FertilizerTab', () => ({ default: ({ records }: any) => <div data-testid="fertilizer-tab" data-count={records.length} /> }));
vi.mock('@/components/activity/TillageTab', () => ({ default: ({ records }: any) => <div data-testid="tillage-tab" data-count={records.length} /> }));
vi.mock('@/components/activity/GrainTab', () => ({ default: ({ records, onToggle }: any) => <div data-testid="grain-tab" data-count={records.length}>{records.map((record: any) => <button key={record.id} onClick={() => onToggle(record.id)}>Select {record.id}</button>)}<button onClick={() => onToggle('missing')}>Select missing</button></div> }));
vi.mock('@/components/activity/HistoryFeed', () => ({ default: ({ records }: any) => <div data-testid="history-feed" data-count={records.length} /> }));

import Activity from '../Activity';

const field: Field = {
  id: 'field-1',
  name: 'North Field',
  acreage: 80,
  lat: null,
  lng: null,
  farm_id: 'farm-1',
  deleted_at: null,
};

function makeSprayRecord(overrides: Partial<SprayRecord>): SprayRecord {
  return {
    id: 's1',
    fieldId: field.id,
    fieldName: field.name,
    products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' }],
    windSpeed: 5,
    temperature: 75,
    timestamp: 1000,
    seasonYear: 2026,
    farm_id: 'farm-1',
    deleted_at: null,
    nonCompliant: false,
    // US EPA required fields (see compliance profile registry).
    startTime: '06:00',
    endTime: '08:00',
    applicatorName: 'Farmer',
    licenseNumber: '123',
    windDirection: 'N',
    cropOrSiteTreated: 'Corn',
    applicationMethod: 'Ground',
    equipmentId: 'Sprayer 1',
    ...overrides,
  };
}

const plantRecord: PlantRecord = {
  id: 'p1',
  fieldId: field.id,
  fieldName: field.name,
  seedVariety: 'P1197',
  acreage: 80,
  timestamp: 1000,
  seasonYear: 2026,
  farm_id: 'farm-1',
  deleted_at: null,
};

function installFarmMock(overrides: Record<string, unknown> = {}) {
  farmMock.current = {
    fields: [field],
    cluAssignments: [],
    fsaTracts: [],
    plantRecords: [],
    sprayRecords: [],
    harvestRecords: [],
    hayHarvestRecords: [],
    customSprayRecords: [],
    fertilizerApplications: [],
    tillageRecords: [],
    grainMovements: [],
    deletePlantRecords: vi.fn(),
    deleteSprayRecords: vi.fn(),
    deleteHarvestRecords: vi.fn(),
    deleteHayHarvestRecords: vi.fn(),
    deleteCustomSprayRecords: vi.fn(),
    deleteFertilizerApplications: vi.fn(),
    deleteTillageRecords: vi.fn(),
    deleteGrainMovements: vi.fn(),
    viewingSeason: 2026,
    farmName: 'Test Farm',
    farm_id: 'farm-1',
    ...overrides,
  };
}

function renderActivity(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Activity />
    </MemoryRouter>
  );
}

describe('Activity query-driven tab selection', () => {
  beforeEach(() => installFarmMock({ sprayRecords: [makeSprayRecord({})] }));

  it('keeps Log Activity from shrinking or wrapping', () => {
    render(<MemoryRouter><Activity /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Log Activity/i })).toHaveClass('shrink-0', 'whitespace-nowrap');
  });

  it('selects the tab named in ?tab= and shows its content and export action', () => {
    renderActivity('/activity?tab=spray');

    expect(screen.getByTestId('spray-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('history-feed')).not.toBeInTheDocument();
    expect(screen.getByTitle('Export Universal Spray Log PDF')).toBeInTheDocument();

    const sprayingButton = screen.getByRole('button', { name: /Spraying/i });
    expect(sprayingButton.className).toContain('ring-2');
  });

  it('falls back to the All tab when no valid tab is requested', () => {
    renderActivity('/activity');
    expect(screen.getByTestId('history-feed')).toBeInTheDocument();
  });

  it('falls back to the All tab for an unrecognized tab value', () => {
    renderActivity('/activity?tab=bogus');
    expect(screen.getByTestId('history-feed')).toBeInTheDocument();
  });
});

describe('Activity readiness deep links', () => {
  it('opens the matching editor once from ?record=&type= and does not reopen after close', async () => {
    installFarmMock({ sprayRecords: [makeSprayRecord({})] });
    const { rerender } = renderActivity('/activity?record=s1&type=spray');

    await waitFor(() => expect(screen.getByTestId('spray-modal')).toBeInTheDocument());

    // User closes the editor.
    fireEvent.click(screen.getByTestId('spray-modal-close'));
    await waitFor(() => expect(screen.queryByTestId('spray-modal')).not.toBeInTheDocument());

    // A store refresh (new collection identity, same contents) must not reopen
    // the editor: the one-time guard keys on type:id.
    installFarmMock({ sprayRecords: [makeSprayRecord({})] });
    rerender(
      <MemoryRouter initialEntries={['/activity?record=s1&type=spray']}>
        <Activity />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('spray-modal')).not.toBeInTheDocument();
  });

  it('opens the correct modal type from the All tab via the editingRecordType discriminator', async () => {
    installFarmMock({ plantRecords: [plantRecord] });
    renderActivity('/activity?record=p1&type=plant');

    await waitFor(() => expect(screen.getByTestId('plant-modal')).toBeInTheDocument());
    expect(screen.queryByTestId('spray-modal')).not.toBeInTheDocument();
  });
});

describe('Activity spray review queue', () => {
  beforeEach(() => installFarmMock({
    sprayRecords: [
      makeSprayRecord({ id: 'clean-2026' }),
      makeSprayRecord({ id: 'dirty-2026', nonCompliant: true, products: [] }),
      makeSprayRecord({ id: 'dirty-2025', nonCompliant: true, products: [], seasonYear: 2025 }),
      makeSprayRecord({ id: 'dirty-deleted', nonCompliant: true, products: [], deleted_at: '2026-06-01T00:00:00.000Z' }),
    ],
  }));

  it('counts only in-season, non-deleted records needing review', () => {
    renderActivity('/activity');

    const reviewButton = screen.getByTitle('Show only incomplete spray records needing review');
    expect(within(reviewButton).getByText('1')).toBeInTheDocument();
  });

  it('feeds only the scoped records to the queue view', async () => {
    renderActivity('/activity');

    fireEvent.click(screen.getByTitle('Show only incomplete spray records needing review'));

    await waitFor(() => {
      expect(screen.getByText('Review queue - incomplete spray records')).toBeInTheDocument();
    });
    expect(screen.getByTestId('spray-tab').getAttribute('data-count')).toBe('1');
  });

  it('respects the search filter in the queue count', async () => {
    renderActivity('/activity');

    fireEvent.change(screen.getByLabelText(/search records/i), { target: { value: 'zzz-no-match' } });

    const reviewButton = screen.getByTitle('Show only incomplete spray records needing review');
    await waitFor(() => expect(within(reviewButton).queryByText('1')).not.toBeInTheDocument());
  });
});


describe('Activity deletion safety', () => {
  const harvest = { id: 'h1', fieldId: field.id, fieldName: field.name, bushels: 10,
    destination: 'bin' as const, binId: 'b1', moisturePercent: 11, landlordSplitPercent: 0,
    timestamp: 1000, seasonYear: 2026, farm_id: 'farm-1', deleted_at: null };
  const grain = { id: 'g1', binId: 'b1', binName: 'Bin', type: 'in' as const, harvestRecordId: 'h1',
    bushels: 10, moisturePercent: 11, timestamp: 1000, seasonYear: 2026, farm_id: 'farm-1', deleted_at: null };
  beforeEach(() => {
    vi.clearAllMocks();
    installFarmMock({ harvestRecords: [harvest], grainMovements: [grain] });
  });
  it('refuses a mirrored harvest-linked Grain-tab selection without adding pending deletes', () => {
    renderActivity('/activity?tab=grain');
    fireEvent.click(screen.getByText('Select g1'));
    fireEvent.click(screen.getByText('Delete 1 Record'));
    expect(toast.error).toHaveBeenCalledWith('This load came from a harvest record. Delete the harvest to remove it.');
    expect(undoMock.requestDelete).not.toHaveBeenCalled();
  });
  it('refuses an incomplete selection rather than hiding records it cannot delete', () => {
    renderActivity('/activity?tab=grain');
    fireEvent.click(screen.getByText('Select missing'));
    fireEvent.click(screen.getByText('Delete 1 Record'));
    expect(toast.error).toHaveBeenCalledWith('Some selected records are no longer available. Select them again.');
    expect(undoMock.requestDelete).not.toHaveBeenCalled();
  });
  it('queues a fully resolved unlinked Grain-tab record', () => {
    const unlinked = { ...grain, harvestRecordId: undefined };
    installFarmMock({ grainMovements: [unlinked] });
    renderActivity('/activity?tab=grain');
    fireEvent.click(screen.getByText('Select g1'));
    fireEvent.click(screen.getByText('Delete 1 Record'));
    expect(undoMock.requestDelete).toHaveBeenCalledWith(['g1'], '1 record deleted', [expect.objectContaining({ type: 'grain', data: unlinked })]);
  });
  it('uses one harvest cascade without separately deleting its linked movement', async () => {
    const harvestDelete = vi.fn().mockResolvedValue(true);
    const grainDelete = vi.fn().mockResolvedValue(true);
    installFarmMock({ deleteHarvestRecords: harvestDelete, deleteGrainMovements: grainDelete });
    renderActivity('/activity');
    await undoMock.options!.onCommit(['h1', 'g1'], [{ type: 'harvest', data: harvest }, { type: 'grain', data: grain }], 'farm-1');
    expect(harvestDelete).toHaveBeenCalledWith(['h1']);
    expect(grainDelete).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('finishes harvest deletion before starting unrelated grain deletion', async () => {
    let release!: () => void;
    const harvestDelete = vi.fn(() => new Promise<boolean>(resolve => { release = () => resolve(true); }));
    const grainDelete = vi.fn().mockResolvedValue(true);
    installFarmMock({ deleteHarvestRecords: harvestDelete, deleteGrainMovements: grainDelete });
    renderActivity('/activity');
    const pending = undoMock.options!.onCommit(['h1', 'g1'], [{ type: 'harvest', data: harvest }, { type: 'grain', data: { ...grain, harvestRecordId: undefined } }], 'farm-1');
    expect(grainDelete).not.toHaveBeenCalled();
    release(); await pending;
    expect(grainDelete).toHaveBeenCalledWith(['g1']);
  });
  it.each(['farm-2', null])('refuses queued deletes when the current farm is %s', async (farmId) => {
    const grainDelete = vi.fn().mockResolvedValue(true);
    installFarmMock({ farm_id: farmId, deleteGrainMovements: grainDelete });
    renderActivity('/activity');
    expect(await undoMock.options!.onCommit(['g1'], [{ type: 'grain', data: grain }], 'farm-1')).toBe(false);
    expect(grainDelete).not.toHaveBeenCalled();
  });
});
