/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSeasonManagement } from '@/store/useSeasonManagement';
import { exportDataAsJson } from '@/utils/backup';

const cloud = vi.hoisted(() => ({
  result: { error: null as { message: string } | null, count: 1 as number | null },
  failure: null as Error | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => {
                if (cloud.failure) throw cloud.failure;
                return cloud.result;
              }),
            })),
          })),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) })) };
    }),
    rpc: vi.fn(),
  },
}));

vi.mock('@/utils/backup', () => ({ exportDataAsJson: vi.fn().mockResolvedValue(true) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeArgs(overrides: Record<string, unknown> = {}) {
  const setActiveSeason = vi.fn();
  const setViewingSeason = vi.fn();
  return {
    session: { user: { id: 'user-1' } },
    farm_id: 'farm-1',
    fields: [], bins: [], plantRecords: [], sprayRecords: [], harvestRecords: [],
    hayHarvestRecords: [], customSprayRecords: [], fertilizerApplications: [], grainMovements: [],
    savedSeeds: [], fertilizerRecipes: [], sprayRecipes: [], tillageRecords: [],
    fsaTracts: [], cluAssignments: [], activeSeason: 2025,
    setActiveSeason, setViewingSeason, setLoading: vi.fn(),
    setFields: vi.fn(), setBins: vi.fn(), setPlantRecords: vi.fn(), setSprayRecords: vi.fn(),
    setHarvestRecords: vi.fn(), setHayHarvestRecords: vi.fn(), setCustomSprayRecords: vi.fn(),
    setFertilizerApplications: vi.fn(), setGrainMovements: vi.fn(), setSavedSeeds: vi.fn(),
    setFertilizerRecipes: vi.fn(), setSprayRecipes: vi.fn(), setTillageRecords: vi.fn(),
    setFsaTracts: vi.fn(), setCluAssignments: vi.fn(), setFarmId: vi.fn(),
    refetchFarmData: vi.fn().mockResolvedValue(true),
    isOnline: true, initialFetchComplete: true, fetchError: false, pendingSyncCount: 0,
    ...overrides,
  } as any;
}

describe('season rollover safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cloud.result = { error: null, count: 1 };
    cloud.failure = null;
  });

  it('downloads a versioned backup before changing both seasons', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(true);
    expect(exportDataAsJson).toHaveBeenCalledWith(
      expect.objectContaining({ backupVersion: 2, activeSeason: 2025 }),
      expect.any(String),
    );
    expect(args.setActiveSeason).toHaveBeenCalledWith(2026);
    expect(args.setViewingSeason).toHaveBeenCalledWith(2026);
  });

  it('does not change local seasons when the cloud update affects zero rows', async () => {
    cloud.result = { error: null, count: 0 };
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(args.setActiveSeason).not.toHaveBeenCalled();
    expect(args.setViewingSeason).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing on an unexpected network failure', async () => {
    cloud.failure = new Error('network');
    const args = makeArgs();
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(args.setActiveSeason).not.toHaveBeenCalled();
  });

  it('blocks rollover while local changes are waiting to sync', async () => {
    const args = makeArgs({ pendingSyncCount: 1 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
  });

  it('does not roll over when the generated backup fails schema validation', async () => {
    const args = makeArgs({ fields: [{}] });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
    expect(args.setActiveSeason).not.toHaveBeenCalled();
    expect(args.setViewingSeason).not.toHaveBeenCalled();
  });

  it('rejects a no-op or backwards rollover before creating a backup', async () => {
    const args = makeArgs({ activeSeason: 2026 });
    const { result } = renderHook(() => useSeasonManagement(args));

    await expect(result.current.rolloverToNewSeason(2026)).resolves.toBe(false);
    expect(exportDataAsJson).not.toHaveBeenCalled();
  });
});
