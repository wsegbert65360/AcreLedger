/**
 * @vitest-environment jsdom
 */
import type { ComponentType } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock } from '@/test/supabaseMock';
import { useStatefulArray } from '@/test/hookTestHarness';
import type { GrainMovement, HarvestRecord, Field } from '@/types/farm';

const mock = createSupabaseMock();
const updateHarvestRecord = vi.fn();
const enqueueMutation = vi.fn();
let local: GrainMovement[] = [];
let useGrainMovements: typeof import('@/store/useGrainMovements').useGrainMovements;
let HarvestModal: ComponentType<{
  field: Field; open: boolean; onClose: () => void; initialData: HarvestRecord;
}>;

const field: Field = { id: 'field', name: 'Home', acreage: 80, lat: null, lng: null, farm_id: 'farm', deleted_at: null };
const movement: GrainMovement = {
  id: 'grain', farm_id: 'farm', binId: 'bin', binName: 'Bin', type: 'in',
  bushels: 1000, moisturePercent: 15, timestamp: 1770000000000, seasonYear: 2026,
  harvestRecordId: 'harvest', version: 4, deleted_at: null,
};
const harvest: HarvestRecord = {
  id: 'harvest', farm_id: 'farm', fieldId: field.id, fieldName: field.name,
  destination: 'bin', binId: 'bin', bushels: 1000, moisturePercent: 15,
  landlordSplitPercent: 0, timestamp: movement.timestamp, seasonYear: 2026, deleted_at: null,
};

vi.doMock('@/lib/supabase', () => ({ supabase: mock.client }));
vi.doMock('@/lib/syncQueue', () => ({ syncQueue: { enqueueMutation } }));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.doMock('@/lib/native', () => ({ native: { haptic: { error: vi.fn(), success: vi.fn() } } }));
vi.doMock('@/store/farmStore', () => ({
  useFarm: function useFarm() {
    const grains = useStatefulArray([movement]);
    local = grains.value;
    const ops = useGrainMovements({
      farm_id: 'farm', viewingSeason: 2026, grainMovements: grains.value,
      setGrainMovements: grains.setValue, isOnline: true, onMutation: vi.fn(),
    });
    return {
      ...ops, updateHarvestRecord, harvestRecords: [harvest],
      grainMovements: grains.value, viewingSeason: 2026,
      bins: [{ id: 'bin', name: 'Bin', capacity: 5000, deleted_at: null }],
      getBinTotal: () => grains.value.reduce((sum, grain) => sum + grain.bushels, 0),
    };
  },
}));

beforeAll(async () => {
  ({ useGrainMovements } = await import('@/store/useGrainMovements'));
  ({ default: HarvestModal } = await import('../HarvestModal'));
});
beforeEach(() => {
  mock.reset();
  updateHarvestRecord.mockReset().mockResolvedValue(false);
});

describe('HarvestModal with the real versioned grain hook', () => {
  it('restores using the new version and leaves server and local grain matching after harvest failure', async () => {
    let server = { bushels: 1000, version: 4 };
    const serverUpdate = () => {
      const expected = mock.fns.eq.mock.calls.filter(([key]) => key === 'version').at(-1)?.[1];
      if (expected !== server.version) return { count: 0, error: null, data: null };
      const payload = mock.fns.update.mock.calls.at(-1)?.[0] as { bushels: number };
      server = { bushels: payload.bushels, version: server.version + 1 };
      return { count: 1, error: null, data: null };
    };
    mock.setTablePages('grain_movements', [serverUpdate, serverUpdate]);
    const onClose = vi.fn();
    render(<HarvestModal field={field} open onClose={onClose} initialData={harvest} />);
    fireEvent.change(screen.getByLabelText(/bushels/i), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: /update record/i }));
    await waitFor(() => expect(mock.fns.update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(local[0]).toMatchObject({ bushels: 1000, version: 6 }));
    expect(mock.fns.eq.mock.calls.filter(([key]) => key === 'version').map(([, value]) => value)).toEqual([4, 5]);
    expect(server).toEqual({ bushels: 1000, version: 6 });
    expect(updateHarvestRecord).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
