import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mocks.from,
  },
}));

import { cluAssignmentService } from '../cluAssignmentService';

describe('cluAssignmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const builder = {
      eq: mocks.eq,
      is: mocks.is,
      select: mocks.select,
      update: mocks.update,
    };

    mocks.from.mockReturnValue(builder);
    mocks.update.mockReturnValue(builder);
    mocks.eq.mockReturnValue(builder);
    mocks.is.mockResolvedValue({ count: 1, data: null, error: null });
  });

  it('updates land use with exact row counts and no returning select', async () => {
    const result = await cluAssignmentService.updateLandUse('assignment-1', 'cropland', 'farm-1');

    expect(mocks.from).toHaveBeenCalledWith('field_clu_assignments');
    expect(mocks.update).toHaveBeenCalledWith({ land_use: 'cropland' }, { count: 'exact' });
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'id', 'assignment-1');
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'farm_id', 'farm-1');
    expect(mocks.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });

  it('soft deletes assignments with exact row counts and no returning select', async () => {
    const deletedAt = '2026-07-02T02:30:00.000Z';
    const result = await cluAssignmentService.removeAssignment('assignment-1', 'farm-1', deletedAt);

    expect(mocks.from).toHaveBeenCalledWith('field_clu_assignments');
    expect(mocks.update).toHaveBeenCalledWith({ deleted_at: deletedAt }, { count: 'exact' });
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'id', 'assignment-1');
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'farm_id', 'farm-1');
    expect(mocks.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(result.count).toBe(1);
  });
});