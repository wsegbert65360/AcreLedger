/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import DeletionPending from './DeletionPending';

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));
describe('deletion-pending screen', () => {
  it('blocks with support contact and signs out with a pending-revoke warning', async () => {
    const signOut = vi.fn().mockResolvedValue({ signedOut: true, serverPending: true });
    render(<DeletionPending status="pending" signOut={signOut} />);
    expect(screen.getByRole('heading', { name: 'Account deletion pending' })).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('mailto:acreledgerapp@gmail.com');
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledWith({ preserveLocalData: true });
    expect(toast.warning).toHaveBeenCalledWith('Signed out on this device; server sign-out pending');
  });
});
