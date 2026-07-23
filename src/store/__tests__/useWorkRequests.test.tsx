/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkRequest } from '@/types/farm';
import { act, renderHook } from '@/test/hookTestHarness';
import { useStatefulArray } from '@/test/hookTestHarness';
import { createSupabaseMock } from '@/test/supabaseMock';

const supabaseMock = createSupabaseMock();
const mapWorkRequestToDb = vi.fn((record: WorkRequest) => ({ ...record }));
const enqueueMutation = vi.fn();
const enqueueMutations = vi.fn();

vi.doMock('@/lib/supabase', () => ({ supabase: supabaseMock.client }));
vi.doMock('@/lib/mappers', () => ({ mapWorkRequestToDb }));
vi.doMock('@/lib/syncQueue', () => ({
  syncQueue: { enqueueMutation, enqueueMutations },
}));
vi.doMock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let useWorkRequests: (typeof import('../useWorkRequests'))['useWorkRequests'];

beforeAll(async () => {
  ({ useWorkRequests } = await import('../useWorkRequests'));
});

const FARM_ID = 'farm-1';

function makeRequest(overrides: Partial<WorkRequest> = {}): WorkRequest {
  return {
    id: 'request-1',
    farm_id: FARM_ID,
    requestNumber: 'WR-2026-ABC123',
    status: 'Draft',
    createdAt: '2026-07-22T12:00:00.000Z',
    updatedAt: '2026-07-22T12:00:00.000Z',
    customerName: 'Example Farm',
    workType: 'spraying',
    cropYear: 2026,
    products: [],
    fields: [],
    timestamp: 1_753_184_000_000,
    deleted_at: null,
    ...overrides,
  };
}

function renderWorkRequestHook(initial: WorkRequest[] = []) {
  return renderHook(() => {
    const requests = useStatefulArray(initial);
    const ops = useWorkRequests({
      farm_id: FARM_ID,
      workRequests: requests.value,
      setWorkRequests: requests.setValue,
      isOnline: true,
      onMutation: vi.fn(),
    });
    return { requests, ops };
  });
}

beforeEach(() => {
  supabaseMock.reset();
  mapWorkRequestToDb.mockClear();
  enqueueMutation.mockReset();
  enqueueMutations.mockReset();
});

describe('useWorkRequests', () => {
  it('returns the authoritative created record through the success callback', async () => {
    const { id: _id, farm_id: _farmId, timestamp: _timestamp, deleted_at: _deletedAt, ...draft } = makeRequest();
    const onCreated = vi.fn();
    const { result } = renderWorkRequestHook();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.addWorkRequest(draft, onCreated);
    });

    expect(ok).toBe(true);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(result.current.requests.value[0]);
    expect(result.current.requests.value[0]).toMatchObject({
      farm_id: FARM_ID,
      requestNumber: draft.requestNumber,
    });
  });

  it('restores deleted records at their original positions when the cloud delete fails', async () => {
    const initial = [
      makeRequest({ id: 'request-1' }),
      makeRequest({ id: 'request-2', requestNumber: 'WR-2026-DEF456' }),
    ];
    supabaseMock.setResult({ error: null, count: 0 });
    const { result } = renderWorkRequestHook(initial);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.ops.deleteWorkRequests(['request-1']);
    });

    expect(ok).toBe(false);
    expect(result.current.requests.value).toEqual(initial);
  });
});
