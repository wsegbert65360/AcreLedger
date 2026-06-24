/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SyncStatusIndicator from '../SyncStatusIndicator';
import * as farmStore from '@/store/farmStore';

vi.mock('@/store/farmStore', async () => {
  const actual = await vi.importActual<typeof farmStore>('@/store/farmStore');
  return {
    ...actual,
    useFarm: vi.fn(),
  };
});

const mockedUseFarm = vi.mocked(farmStore.useFarm);

describe('SyncStatusIndicator', () => {
  it('shows synced state when online with no pending items', () => {
    mockedUseFarm.mockReturnValue({ isOnline: true, pendingSyncCount: 0 } as any);
    render(<SyncStatusIndicator />);
    expect(screen.getByLabelText('All changes synced')).toBeInTheDocument();
  });

  it('shows syncing state with pending count', () => {
    mockedUseFarm.mockReturnValue({ isOnline: true, pendingSyncCount: 3 } as any);
    render(<SyncStatusIndicator />);
    expect(screen.getByLabelText('Syncing 3 records')).toBeInTheDocument();
  });

  it('shows offline state with pending count', () => {
    mockedUseFarm.mockReturnValue({ isOnline: false, pendingSyncCount: 2 } as any);
    render(<SyncStatusIndicator />);
    expect(screen.getByLabelText('Offline — 2 records pending sync')).toBeInTheDocument();
  });

  it('shows offline state without count when none pending', () => {
    mockedUseFarm.mockReturnValue({ isOnline: false, pendingSyncCount: 0 } as any);
    render(<SyncStatusIndicator />);
    expect(screen.getByLabelText('Offline — 0 records pending sync')).toBeInTheDocument();
  });
});
