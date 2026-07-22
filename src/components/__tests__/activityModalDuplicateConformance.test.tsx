/**
 * @vitest-environment jsdom
 *
 * Duplicate-mode conformance for the activity record modals (AGENTS.md):
 * mode="duplicate" must show the viewingSeason badge (not the source season),
 * stamp today's date (grain: a fresh timestamp), and call addXxx — never
 * updateXxx — so the hook stamps a new id/seasonYear/farm_id.
 *
 * PlantModal and FertilizerModal have their own dedicated suites (acreage
 * defaults); spray's wizard flow is covered in SprayModal.test.tsx.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Field } from '@/types/farm';

// --- Shared mock plumbing: each suite installs its own useFarm payload. ---
const farmMock: { current: Record<string, unknown> } = { current: {} };

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmMock.current
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: {
      error: vi.fn(),
      success: vi.fn(),
      light: vi.fn()
    }
  }
}));

vi.mock('@/services/WeatherService', () => ({
  WeatherService: {
    fetchCurrentWeather: vi.fn().mockResolvedValue({ wind: 0, temp: 0, humidity: 0, windDirection: '—', isError: true }),
    fetchHistoricalConditions: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => {
    const trigger = (Array.isArray(children) ? children : [children]).find((c: any) => c?.props?.id);
    const collectOptions = (node: any): any[] => {
      if (!node) return [];
      if (Array.isArray(node)) return node.flatMap(collectOptions);
      if (node.props?.value != null) return [node];
      return collectOptions(node.props?.children);
    };

    return (
      <select
        id={trigger?.props?.id}
        value={value}
        onChange={e => onValueChange(e.target.value)}
        data-testid="select"
      >
        {collectOptions(children)}
      </select>
    );
  },
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => open ? <div data-testid="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
}));

const field: Field = {
  id: 'field-1',
  name: 'North Field',
  acreage: 80,
  lat: null,
  lng: null,
  farm_id: 'farm-1',
  deleted_at: null
};

const today = new Date().toISOString().split('T')[0];

/** Shared assertions for every duplicate-mode modal. */
async function expectDuplicateSemantics(addMock: ReturnType<typeof vi.fn>, updateMock: ReturnType<typeof vi.fn>) {
  expect(screen.getByText('2026 Season')).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /log duplicate/i }));
  });

  await waitFor(() => expect(addMock).toHaveBeenCalledTimes(1));
  const arg = addMock.mock.calls[0][0] as Record<string, unknown>;
  // Fresh record: the hook stamps id/seasonYear/farm_id, not the modal.
  expect(arg.id).toBeUndefined();
  expect(arg.seasonYear).toBeUndefined();
  expect(arg.farm_id).toBeUndefined();
  expect(updateMock).not.toHaveBeenCalled();
  return arg;
}

describe('HarvestModal duplicate mode', () => {
  const addHarvestRecord = vi.fn().mockResolvedValue(true);
  const updateHarvestRecord = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    farmMock.current = {
      addHarvestRecord, updateHarvestRecord,
      addGrainMovement: vi.fn(), updateGrainMovement: vi.fn(),
      grainMovements: [], harvestRecords: [], bins: [], viewingSeason: 2026,
    };
  });

  it('stamps today and adds a new record', async () => {
    const HarvestModal = (await import('../HarvestModal')).default;
    render(
      <HarvestModal field={field} open={true} onClose={vi.fn()} mode="duplicate" initialData={{
        id: 'harv-1', fieldId: field.id, fieldName: field.name, destination: 'town',
        moisturePercent: 15, landlordSplitPercent: 0, bushels: 4000, crop: 'Corn',
        harvestDate: '2025-10-01', timestamp: 1000, seasonYear: 2025, farm_id: 'farm-1', deleted_at: null,
      }} />
    );

    expect(screen.getByText('2026 Season')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log duplicate/i }));
    });

    await waitFor(() => expect(addHarvestRecord).toHaveBeenCalledTimes(1));
    const arg = addHarvestRecord.mock.calls[0][0] as Record<string, unknown>;
    // Harvest is the sanctioned exception: the modal pre-generates id/timestamp
    // so the linked grain movement can reference them (the hook honors provided
    // values via `r.id ?? crypto.randomUUID()`). Both must be FRESH, and
    // seasonYear/farm_id remain hook-stamped.
    expect(arg.id).toBeDefined();
    expect(arg.id).not.toBe('harv-1');
    expect(arg.timestamp).toBeGreaterThan(1e12);
    expect(arg.seasonYear).toBeUndefined();
    expect(arg.farm_id).toBeUndefined();
    expect(arg.harvestDate).toBe(today);
    expect(arg.bushels).toBe(4000);
    expect(updateHarvestRecord).not.toHaveBeenCalled();
  });
});

describe('HayModal duplicate mode', () => {
  const addHayHarvestRecord = vi.fn().mockResolvedValue(true);
  const updateHayHarvestRecord = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    farmMock.current = {
      addHayHarvestRecord, updateHayHarvestRecord,
      hayHarvestRecords: [], viewingSeason: 2026,
    };
  });

  it('stamps today and adds a new record', async () => {
    const HayModal = (await import('../HayModal')).default;
    render(
      <HayModal field={field} open={true} onClose={vi.fn()} mode="duplicate" initialData={{
        id: 'hay-1', fieldId: field.id, fieldName: field.name, date: '2025-06-01',
        baleCount: 10, cuttingNumber: 1, baleType: 'Round',
        timestamp: 1000, seasonYear: 2025, farm_id: 'farm-1', deleted_at: null,
      }} />
    );

    const arg = await expectDuplicateSemantics(addHayHarvestRecord, updateHayHarvestRecord);
    expect(arg.date).toBe(today);
    expect(arg.baleCount).toBe(10);
  });
});

describe('TillageModal duplicate mode', () => {
  const addTillageRecord = vi.fn().mockResolvedValue(true);
  const updateTillageRecord = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    farmMock.current = {
      addTillageRecord, updateTillageRecord, deleteTillageRecords: vi.fn(),
      tillageRecords: [], viewingSeason: 2026,
    };
  });

  it('stamps today and adds a new record', async () => {
    const TillageModal = (await import('../TillageModal')).default;
    render(
      <TillageModal field={field} open={true} onClose={vi.fn()} mode="duplicate" initialData={{
        id: 'till-1', fieldId: field.id, fieldName: field.name, date: '2025-04-01',
        implementType: 'Disk', timestamp: 1000, seasonYear: 2025, farm_id: 'farm-1', deleted_at: null,
      }} />
    );

    const arg = await expectDuplicateSemantics(addTillageRecord, updateTillageRecord);
    expect(arg.date).toBe(today);
    expect(arg.implementType).toBe('Disk');
  });
});

describe('CustomSprayModal duplicate mode', () => {
  const addCustomSprayRecord = vi.fn().mockResolvedValue(true);
  const updateCustomSprayRecord = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    farmMock.current = {
      addCustomSprayRecord, updateCustomSprayRecord,
      customSprayRecords: [], viewingSeason: 2026,
    };
  });

  it('stamps a fresh local date and adds a new record', async () => {
    const CustomSprayModal = (await import('../CustomSprayModal')).default;
    render(
      <CustomSprayModal field={field} open={true} onClose={vi.fn()} mode="duplicate" initialData={{
        id: 'cs-1', fieldId: field.id, fieldName: field.name, date: '2025-05-01',
        applicationTime: '08:00', applicator: 'Co-op Applicator', recipe: 'Roundup 32oz/ac',
        timestamp: 1000, seasonYear: 2025, farm_id: 'farm-1', deleted_at: null,
      }} />
    );

    const arg = await expectDuplicateSemantics(addCustomSprayRecord, updateCustomSprayRecord);
    expect(arg.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg.date).not.toBe('2025-05-01');
    expect(arg.applicator).toBe('Co-op Applicator');
  });
});

describe('GrainMovementModal duplicate mode', () => {
  const addGrainMovement = vi.fn().mockResolvedValue(true);
  const updateGrainMovement = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    farmMock.current = {
      addGrainMovement, updateGrainMovement,
      bins: [{ id: 'bin-1', name: 'Bin 1', capacity: 5000, farm_id: 'farm-1', deleted_at: null }],
      fields: [], viewingSeason: 2026,
    };
  });

  it('stamps a fresh timestamp and adds a new record', async () => {
    const GrainMovementModal = (await import('../GrainMovementModal')).default;
    render(
      <GrainMovementModal open={true} onClose={vi.fn()} mode="duplicate" initialData={{
        id: 'gm-1', binId: 'bin-1', binName: 'Bin 1', type: 'out', bushels: 1000,
        moisturePercent: 15, timestamp: 1000, seasonYear: 2025, farm_id: 'farm-1', deleted_at: null,
      }} />
    );

    const arg = await expectDuplicateSemantics(addGrainMovement, updateGrainMovement);
    // Grain carries timestamp rather than date: it must be fresh, not the source's.
    expect(arg.timestamp).toBeGreaterThan(1e12);
    expect(arg.bushels).toBe(1000);
    expect(arg.type).toBe('out');
  });
});
