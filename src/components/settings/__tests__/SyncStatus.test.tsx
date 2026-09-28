/** @vitest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SyncStatus from '../SyncStatus';

const control = vi.hoisted(() => ({
  pendingSyncCount: 0,
  subscription: null as null | ((status: string) => void),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    session: { user: { id: 'user-1' } },
    pendingSyncCount: control.pendingSyncCount,
  }),
}));

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
  });

  it('shows pending and does not record a completed sync while work remains queued', () => {
    control.pendingSyncCount = 2;
    render(<SyncStatus />);
    act(() => control.subscription?.('SUBSCRIBED'));

    expect(screen.getByText('Pending Sync')).toBeInTheDocument();
    expect(localStorage.getItem('acreledger_last_sync')).toBeNull();
  });
});
