import { describe, expect, it } from 'vitest';
import { cattleEventSchema } from '../backupSchema';

const base = {
  id: 'e1', farm_id: 'farm-1', groupId: 'g1', eventType: 'head_removed', eventDate: '2026-03-01',
  headDelta: -2, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', deleted_at: null,
};

describe('cattle backup schema', () => {
  it('accepts a transfer id and the two shipped removal reasons', () => {
    expect(cattleEventSchema.safeParse({ ...base, reason: 'shipped', transferId: 't1' }).success).toBe(true);
    expect(cattleEventSchema.safeParse({ ...base, reason: 'moved_to_another_group' }).success).toBe(true);
  });
  it("rejects the retired 'died' removal reason", () => {
    expect(cattleEventSchema.safeParse({ ...base, reason: 'died' }).success).toBe(false);
  });
});
