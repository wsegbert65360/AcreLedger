/** @vitest-environment jsdom */
import { Capacitor } from '@capacitor/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SyncStatus from '../SyncStatus';

const shareFileMock = vi.hoisted(() => vi.fn());

const control = vi.hoisted(() => ({
  syncQueueLocked: false,
  syncQueueReadFailed: false,
  pendingSyncCount: 0,
  failedSyncCount: 0,
  getFailed: vi.fn(async () => [{ id: 'q1' }]),
  retryFailedSyncChanges: vi.fn(),
  discardFailedSyncChanges: vi.fn(),
  subscription: null as null | ((status: string) => void),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    session: { user: { id: 'user-1' } },
    pendingSyncCount: control.pendingSyncCount,
    failedSyncCount: control.failedSyncCount,
    getFailedSyncChanges: control.getFailed,
    retryFailedSyncChanges: control.retryFailedSyncChanges,
    discardFailedSyncChanges: control.discardFailedSyncChanges,
    syncQueueLocked: control.syncQueueLocked,
    syncQueueReadFailed: control.syncQueueReadFailed,
  }),
}));

vi.mock('@/lib/native', () => ({ native: { shareFile: shareFileMock } }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: () => ({
      subscribe(callback: (status: string) => void) {
        control.subscription = callback;
        return this;
      },
    }),
    removeChannel: vi.fn(),
  },
}));

describe('SyncStatus', () => {
  beforeEach(() => {
    localStorage.clear();
    control.subscription = null;
    control.pendingSyncCount = 0;
    control.failedSyncCount = 0;
    control.syncQueueLocked = false;
    control.syncQueueReadFailed = false;
    control.getFailed.mockReset().mockResolvedValue([{ id: 'q1' }]);
    control.retryFailedSyncChanges.mockReset();
    control.discardFailedSyncChanges.mockReset();
    shareFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not show locked or synced while checking the queue', () => {
    control.syncQueueLocked = true;
    render(<SyncStatus />);
    act(() => control.subscription?.('SUBSCRIBED'));
    expect(screen.queryByText('Offline changes locked')).toBeNull();
    expect(screen.queryByText('Synced')).toBeNull();
    expect(screen.getByText('Pending Sync')).toBeInTheDocument();
  });

  it('shows pending and does not record a completed sync while work remains queued', () => {
    control.pendingSyncCount = 2;
    render(<SyncStatus />);
    act(() => control.subscription?.('SUBSCRIBED'));

    expect(screen.getByText('Pending Sync')).toBeInTheDocument();
    expect(localStorage.getItem('acreledger_last_sync')).toBeNull();
  });

  it('shares failed changes on a phone instead of starting a browser download', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const createObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    control.failedSyncCount = 1;
    try {
      render(<SyncStatus />);
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      await waitFor(() => {
        expect(shareFileMock).toHaveBeenCalledWith(expect.objectContaining({
          fileName: expect.stringMatching(/^acreledger-unsynced-changes-\d{4}-\d{2}-\d{2}\.json$/),
          encoding: 'utf8',
          data: expect.stringContaining('"q1"'),
        }));
      });
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });

  it('shows an error when failed changes cannot be read', async () => {
    control.failedSyncCount = 1;
    control.getFailed.mockRejectedValue(new Error('queue unreadable'));
    render(<SyncStatus />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('queue unreadable');
    expect(shareFileMock).not.toHaveBeenCalled();
  });

  it('shows an error when the phone share returns false or throws', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    control.failedSyncCount = 1;
    shareFileMock.mockResolvedValue(false);
    render(<SyncStatus />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not export unsynced changes.');
  });

  it('shows an error when the phone share throws', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    control.failedSyncCount = 1;
    shareFileMock.mockRejectedValue(new Error('share failed'));
    render(<SyncStatus />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('share failed');
  });

  it('downloads failed changes on the web and revokes the object URL after the click', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    control.failedSyncCount = 1;
    try {
      render(<SyncStatus />);
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(click).toHaveBeenCalled();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
      expect(document.body.querySelector('a')).toBeNull();
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
