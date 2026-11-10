/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const farm = vi.hoisted(() => ({
  current: {
    session: { user: { id: 'user-1' } },
    activeSeason: 2026,
    farm_id: 'farm-1',
    rolloverToNewSeason: vi.fn(),
    restoreFromBackup: vi.fn().mockResolvedValue(true),
    undoPreSeasonReset: vi.fn().mockResolvedValue(true),
    loading: false,
    initialFetchComplete: true,
    fetchError: false,
    pendingSyncCount: 0,
    farmRole: 'owner' as string | null,
  },
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farm.current,
}));
vi.mock('@/lib/native', () => ({
  native: { haptic: { success: vi.fn(), error: vi.fn() } },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PRE_SEASON_RESET_WARNING, RESTORE_RESURRECT_WARNING, RESTORE_ROLE_DENIED } from '@/lib/backupRestorePolicy';
import SeasonRolloverModal from '../SeasonRolloverModal';

function backupFile(overrides: Record<string, unknown> = {}, name = 'acreledger-backup.json') {
  const payload = JSON.stringify({
    backupVersion: 2,
    backupDate: '2026-03-04T12:00:00.000Z',
    activeSeason: 2025,
    fields: [{ id: 'f1', name: 'North', farm_id: 'farm-1', acreage: 40, deleted_at: null }],
    sprayRecords: [{ id: 's1', fieldId: 'f1', seasonYear: 2025, farm_id: 'farm-1', deleted_at: null }],
    ...overrides,
  });
  return {
    name,
    size: payload.length,
    text: async () => payload,
  } as File;
}

async function openRollover() {
  render(<SeasonRolloverModal />);
  act(() => {
    window.dispatchEvent(new Event('open-rollover'));
  });
  await waitFor(() => expect(screen.getByText(/Season rollover/)).toBeInTheDocument());
}

describe('SeasonRolloverModal restore confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    farm.current.initialFetchComplete = true;
    farm.current.fetchError = false;
    farm.current.pendingSyncCount = 0;
    farm.current.activeSeason = 2026;
    farm.current.farm_id = 'farm-1';
    farm.current.restoreFromBackup.mockResolvedValue(true);
    farm.current.undoPreSeasonReset.mockResolvedValue(true);
    farm.current.farmRole = 'owner';
  });

  it('disables upload while restore is gated', async () => {
    farm.current.pendingSyncCount = 1;
    await openRollover();
    expect(screen.getByLabelText('Upload backup JSON file')).toBeDisabled();
    expect(screen.getByText(/Wait for cloud data and pending changes/i)).toBeInTheDocument();
  });

  it('shows backup date, season, counts, restore warning, and season-switch confirmation', async () => {
    await openRollover();
    const input = screen.getByLabelText('Upload backup JSON file');
    fireEvent.change(input, { target: { files: [backupFile()] } });
    await waitFor(() => expect(screen.getByText(/Restore backup\?/)).toBeInTheDocument());
    expect(screen.getByText(/2026-03-04/)).toBeInTheDocument();
    expect(screen.getAllByText(/season 2025/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Fields')).toBeInTheDocument();
    expect(screen.getByText('Spray records')).toBeInTheDocument();
    expect(screen.getByText(RESTORE_RESURRECT_WARNING)).toBeInTheDocument();
    expect(screen.getByText(/Backup season 2025 differs from current 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    await waitFor(() => expect(farm.current.restoreFromBackup).toHaveBeenCalled());
    expect(farm.current.restoreFromBackup.mock.calls[0][1]).toEqual({
      switchActiveSeason: false,
      preSeasonReset: false,
      rollbackTables: undefined,
    });
  });

  it('warns that a pre-season snapshot undoes the rollover and rolls records back', async () => {
    await openRollover();
    const input = screen.getByLabelText('Upload backup JSON file');
    fireEvent.change(input, {
      target: {
        files: [backupFile({
          rolloverDate: '2026-09-01T00:00:00.000Z',
        }, 'Pre_Season_Reset_2026-09-01.json')],
      },
    });
    await waitFor(() => expect(screen.getByText(PRE_SEASON_RESET_WARNING)).toBeInTheDocument());
    expect(screen.getByText(RESTORE_RESURRECT_WARNING)).toBeInTheDocument();
    const seasonBox = screen.getByRole('checkbox');
    expect(seasonBox).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    await waitFor(() => expect(farm.current.restoreFromBackup).toHaveBeenCalled());
    expect(farm.current.restoreFromBackup.mock.calls[0][1]).toEqual(expect.objectContaining({
      switchActiveSeason: true,
      preSeasonReset: true,
      rollbackTables: expect.arrayContaining(['fields', 'spray_records']),
    }));
  });

  it('hides the server undo until this device has a snapshot for the farm', async () => {
    await openRollover();
    expect(screen.queryByRole('button', { name: 'Undo pre-season reset' })).not.toBeInTheDocument();
  });

  it('undoes a stored server snapshot without using file restore', async () => {
    farm.current.undoPreSeasonReset.mockImplementation(async () => {
      localStorage.removeItem('user-1_farm-1_al_pre_season_snapshot');
      return true;
    });
    localStorage.setItem(
      'user-1_farm-1_al_pre_season_snapshot',
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        fromSeason: 2025,
        toSeason: 2026,
      }),
    );
    await openRollover();
    fireEvent.click(screen.getByRole('button', { name: 'Undo pre-season reset' }));
    expect(screen.getByText('Undo pre-season reset?')).toBeInTheDocument();
    expect(screen.getByText(/On a free farm, Pro data is left as it is/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo reset' }));
    await waitFor(() => expect(farm.current.undoPreSeasonReset).toHaveBeenCalled());
    expect(farm.current.restoreFromBackup).not.toHaveBeenCalled();
  });

  it('hides restore from a worker', async () => {
    farm.current.farmRole = 'worker';
    await openRollover();
    expect(screen.queryByLabelText('Upload backup JSON file')).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(RESTORE_ROLE_DENIED))).toBeInTheDocument();
  });
});
