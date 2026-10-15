/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const farm = vi.hoisted(() => ({
  current: {
    fields: [{ id: 'f1', name: 'North', farm_id: 'farm-1', acreage: 80 }],
    bins: [],
    plantRecords: [],
    sprayRecords: [],
    harvestRecords: [],
    hayHarvestRecords: [],
    customSprayRecords: [],
    fertilizerApplications: [],
    tillageRecords: [],
    grainMovements: [],
    savedSeeds: [],
    fertilizerRecipes: [],
    sprayRecipes: [],
    fsaTracts: [],
    cluAssignments: [],
    workRequests: [],
    equipment: [],
    maintenanceSchedules: [],
    maintenanceLogs: [],
    activeSeason: 2026,
    initialFetchComplete: true,
    fetchError: false,
    equipmentLoadFailed: false,
    dataLoadSource: 'cloud' as const,
    dataLoadedAt: '2026-10-13T00:00:00.000Z',
    farmRole: 'owner' as string | null,
  },
}));

const exportDataAsJson = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farm.current,
}));
vi.mock('@/utils/backup', () => ({
  exportDataAsJson,
}));
vi.mock('@/utils/seasonRollover', () => ({
  openSeasonRolloverModal: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import BackupManager from '../BackupManager';

describe('BackupManager load gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    farm.current.initialFetchComplete = true;
    farm.current.fetchError = false;
    farm.current.equipmentLoadFailed = false;
    farm.current.dataLoadSource = 'cloud';
    farm.current.dataLoadedAt = '2026-10-13T00:00:00.000Z';
    farm.current.farmRole = 'owner';
  });

  it('blocks download until the first cloud fetch finishes', () => {
    farm.current.initialFetchComplete = false;
    render(<BackupManager />);
    expect(screen.getByRole('button', { name: /Download Backup JSON/i })).toBeDisabled();
    expect(screen.getByText(/Wait for farm records to finish loading/i)).toBeInTheDocument();
  });

  it('warns when equipment failed to load and stamps the backup as a cache copy', async () => {
    farm.current.equipmentLoadFailed = true;
    render(<BackupManager />);
    expect(screen.getByText(/Equipment records did not load/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Download Backup JSON/i }));
    await waitFor(() => expect(exportDataAsJson).toHaveBeenCalled());
    expect(exportDataAsJson.mock.calls[0][0]).toEqual(expect.objectContaining({
      backupVersion: 3,
      source: 'cache',
      loadedAt: '2026-10-13T00:00:00.000Z',
    }));
  });

  it('stamps cloud source and load time on a complete backup', async () => {
    render(<BackupManager />);
    fireEvent.click(screen.getByRole('button', { name: /Download Backup JSON/i }));
    await waitFor(() => expect(exportDataAsJson).toHaveBeenCalled());
    expect(exportDataAsJson.mock.calls[0][0]).toEqual(expect.objectContaining({
      source: 'cloud',
      loadedAt: '2026-10-13T00:00:00.000Z',
      backupVersion: 3,
    }));
  });

  it('lets a worker download a backup and hides restore', async () => {
    farm.current.farmRole = 'worker';
    render(<BackupManager />);
    expect(screen.getByRole('button', { name: /Download Backup JSON/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Season rollover$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /and restore/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Only the farm owner or an admin can restore a backup/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Download Backup JSON/i }));
    await waitFor(() => expect(exportDataAsJson).toHaveBeenCalled());
  });
});
