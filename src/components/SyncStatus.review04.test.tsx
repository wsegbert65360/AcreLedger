import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const farm = vi.hoisted(() => ({
  isOnline: true,
  pendingSyncCount: 0,
  failedSyncCount: 0,
  syncQueueLocked: false,
  syncQueueReadFailed: false,
}));
vi.mock('@/store/farmStore', () => ({ useFarm: () => farm }));
import OfflineBanner from './OfflineBanner';
import SyncStatusIndicator from './SyncStatusIndicator';

describe('sync status truth', () => {
  beforeEach(() => Object.assign(farm, {
    isOnline: true,
    pendingSyncCount: 0,
    failedSyncCount: 0,
    syncQueueLocked: false,
    syncQueueReadFailed: false,
  }));

  it.each(['parked', 'locked'])('shows %s queue state instead of claiming synced', async state => {
    if (state === 'parked') farm.failedSyncCount = 2;
    else {
      farm.syncQueueLocked = true;
      farm.syncQueueReadFailed = true;
    }
    render(<><SyncStatusIndicator /><OfflineBanner /></>);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(state === 'parked' ? 'need attention' : 'locked'));
    expect(screen.queryByLabelText('All changes synced')).toBeNull();
    expect(screen.queryByText('All synced')).toBeNull();
  });

  it('does not flash All synced while parked work remains after reconnect', async () => {
    farm.isOnline = false;
    farm.failedSyncCount = 1;
    const { rerender } = render(<OfflineBanner />);
    farm.isOnline = true;
    rerender(<OfflineBanner />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('needs attention'));
    expect(screen.queryByText('All synced')).toBeNull();
  });

  it('does not show the locked banner while the first queue check is pending', () => {
    farm.syncQueueLocked = true;
    farm.syncQueueReadFailed = false;
    render(<><SyncStatusIndicator /><OfflineBanner /></>);
    expect(screen.queryByText(/offline changes locked/i)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByLabelText('All changes synced')).toBeInTheDocument();
  });
});
