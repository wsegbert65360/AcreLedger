import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insert, from } = vi.hoisted(() => {
  const insertMock = vi.fn();
  return {
    insert: insertMock,
    from: vi.fn(() => ({ insert: insertMock })),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from },
}));

import { requestAccountDeletion } from '@/lib/accountDeletion';

describe('requestAccountDeletion', () => {
  beforeEach(() => {
    insert.mockReset();
    from.mockClear();
  });

  it('creates a farm-scoped request for the signed-in user', async () => {
    insert.mockResolvedValue({ error: null });

    await expect(requestAccountDeletion('user-1', 'farm-1')).resolves.toBe('requested');
    expect(from).toHaveBeenCalledWith('account_deletion_requests');
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', farm_id: 'farm-1' });
  });

  it('treats a duplicate request as already pending', async () => {
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    await expect(requestAccountDeletion('user-1', 'farm-1')).resolves.toBe('already_pending');
  });

  it('surfaces database failures', async () => {
    const error = { code: '42501', message: 'denied' };
    insert.mockResolvedValue({ error });
    await expect(requestAccountDeletion('user-1', 'farm-1')).rejects.toBe(error);
  });
});
