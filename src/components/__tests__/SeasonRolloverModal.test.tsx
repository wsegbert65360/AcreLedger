/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const farm = vi.hoisted(() => ({
  current: {
    session: { user: { id: 'user-1' } },
    activeSeason: 2026,
    rolloverToNewSeason: vi.fn(),
    restoreFromBackup: vi.fn().mockResolvedValue(true),
    loading: false,
    initialFetchComplete: true,
    fetchError: false,
    pendingSyncCount: 0,
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

import SeasonRolloverModal from '../SeasonRolloverModal';

function backupFile(overrides: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    backupVersion: 2,
    backupDate: '2026-03-04T12:00:00.000Z',
    activeSeason: 2025,
    fields: [{ id: 'f1', name: 'North', farm_id: 'farm-1', acreage: 40, deleted_at: null }],
    sprayRecords: [{ id: 's1', fieldId: 'f1', seasonYear: 2025, farm_id: 'farm-1', deleted_at: null }],
    ...overrides,
  });
  return {
    name: 'acreledger-backup.json',
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
    farm.current.initialFetchComplete = true;
    farm.current.fetchError = false;
    farm.current.pendingSyncCount = 0;
    farm.current.activeSeason = 2026;
    farm.current.restoreFromBackup.mockResolvedValue(true);
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
    expect(screen.getByText(
      'Records deleted since this backup will be restored; newer edits to the same records will be replaced.',
    )).toBeInTheDocument();
    expect(screen.getByText(/Backup season 2025 differs from current 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore backup' }));
    await waitFor(() => expect(farm.current.restoreFromBackup).toHaveBeenCalled());
    expect(farm.current.restoreFromBackup.mock.calls[0][1]).toEqual({ switchActiveSeason: false });
  });
});
