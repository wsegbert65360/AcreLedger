/**
 * @vitest-environment jsdom
 *
 * Settings → Account & Display deletion path: exact DELETE confirmation,
 * blocked while offline mutations are pending, request recorded, then sign-out.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMocks,
}));

const requestAccountDeletion = vi.hoisted(() => vi.fn());

vi.mock('@/lib/accountDeletion', () => ({
  requestAccountDeletion,
}));

const farmState: {
  session: { user: { id: string; email: string } } | null;
  farm_id: string | null;
  farmName: string;
  updateFarmName: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  pendingSyncCount: number;
} = {
  session: { user: { id: 'user-1', email: 'farmer@example.com' } },
  farm_id: 'farm-1',
  farmName: 'Oak Creek',
  updateFarmName: vi.fn(),
  signOut: vi.fn(),
  pendingSyncCount: 0,
};

vi.mock('@/store/farmStore', () => ({
  useFarm: () => farmState,
}));

import AccountManager from '@/components/settings/AccountManager';

function renderAccount() {
  return render(<AccountManager />);
}

describe('AccountManager deletion request', () => {
  beforeEach(() => {
    farmState.pendingSyncCount = 0;
    farmState.signOut.mockReset().mockResolvedValue(undefined);
    requestAccountDeletion.mockReset().mockResolvedValue('requested');
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
  });

  it('requires the exact DELETE confirmation before recording a request', async () => {
    renderAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));

    const confirm = screen.getByRole('button', { name: 'Request deletion' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'delete' },
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    await waitFor(() => {
      expect(requestAccountDeletion).toHaveBeenCalledWith('user-1', 'farm-1');
    });
    expect(farmState.signOut).toHaveBeenCalledTimes(1);
  });

  it('blocks deletion while offline mutations are pending', async () => {
    farmState.pendingSyncCount = 2;
    renderAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));

    expect(screen.getByText(/Reconnect and sync 2 pending changes first/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request deletion' })).toBeDisabled();
    expect(screen.queryByLabelText('Type DELETE to confirm')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request deletion' }));
    expect(requestAccountDeletion).not.toHaveBeenCalled();
    expect(farmState.signOut).not.toHaveBeenCalled();
  });

  it('records an already-pending request and still signs out', async () => {
    requestAccountDeletion.mockResolvedValue('already_pending');
    renderAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request deletion' }));

    await waitFor(() => {
      expect(requestAccountDeletion).toHaveBeenCalledWith('user-1', 'farm-1');
    });
    expect(farmState.signOut).toHaveBeenCalledTimes(1);
    expect(toastMocks.success).toHaveBeenCalled();
  });
});
