import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BENTON, HENRY } from './fixtures';

const { fetchBoundaries, store } = vi.hoisted(() => ({
  fetchBoundaries: vi.fn(),
  store: new Map<string, unknown[]>(),
}));

vi.mock('@/services/countyBoundaryService', () => ({
  COUNTY_RPC_LIMIT: 40,
  countyBoundaryService: { fetchBoundaries },
}));
vi.mock('@/lib/offlineStorage', () => ({
  offlineStorage: {
    saveCache: vi.fn(async (table: string, user: string | null, data: unknown[]) => { store.set(`${user}|${table}`, JSON.parse(JSON.stringify(data))); }),
    loadCache: vi.fn(async (table: string, user: string | null) => store.get(`${user}|${table}`) ?? null),
  },
}));

import { cellsFor, loadCountiesFor } from '../boundaryProvider';

const AREA = { minLng: -93.62, minLat: 38.39, maxLng: -93.58, maxLat: 38.41 };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe('county boundary provider', () => {
  it('needs no area for a subject without a location', async () => {
    expect(await loadCountiesFor(null, { userId: 'u', isOnline: false })).toEqual({ counties: [], reason: null });
  });

  it('downloads once, then serves the same area offline from the device', async () => {
    fetchBoundaries.mockResolvedValue({ data: [HENRY, BENTON], error: null });
    const online = await loadCountiesFor(AREA, { userId: 'u', isOnline: true });
    expect(online.counties?.map(c => c.fips).sort()).toEqual(['29015', '29083']);
    const calls = fetchBoundaries.mock.calls.length;
    expect(calls).toBe(cellsFor(AREA).length);

    const offline = await loadCountiesFor(AREA, { userId: 'u', isOnline: false });
    expect(offline.counties?.map(c => c.fips).sort()).toEqual(['29015', '29083']);
    expect(fetchBoundaries.mock.calls.length).toBe(calls);
  });

  it('never fetches again for an area it already holds, even when it is online (no per-report request)', async () => {
    fetchBoundaries.mockResolvedValue({ data: [HENRY, BENTON], error: null });
    await loadCountiesFor(AREA, { userId: 'u', isOnline: true });
    fetchBoundaries.mockClear();
    await loadCountiesFor(AREA, { userId: 'u', isOnline: true });
    expect(fetchBoundaries).not.toHaveBeenCalled();
  });

  it('answers "not downloaded" (null), not an empty list, when offline with no cache', async () => {
    const out = await loadCountiesFor(AREA, { userId: 'u', isOnline: false });
    expect(out.counties).toBeNull();
    expect(out.reason).toMatch(/not downloaded/);
  });

  it('does not mark an area covered after a failed download', async () => {
    fetchBoundaries.mockResolvedValueOnce({ data: null, error: new Error('network') });
    expect((await loadCountiesFor(AREA, { userId: 'u', isOnline: true })).counties).toBeNull();
    fetchBoundaries.mockResolvedValue({ data: [HENRY, BENTON], error: null });
    expect((await loadCountiesFor(AREA, { userId: 'u', isOnline: true })).counties).toHaveLength(2);
  });

  it('treats a full RPC page as incomplete rather than trusting it', async () => {
    fetchBoundaries.mockResolvedValue({ data: Array.from({ length: 40 }, () => HENRY), error: null });
    const out = await loadCountiesFor(AREA, { userId: 'u', isOnline: true });
    expect(out.counties).toBeNull();
    expect(out.reason).toMatch(/incomplete/);
  });

  it('keeps one device cache per signed-in user', async () => {
    fetchBoundaries.mockResolvedValue({ data: [HENRY, BENTON], error: null });
    await loadCountiesFor(AREA, { userId: 'u1', isOnline: true });
    expect((await loadCountiesFor(AREA, { userId: 'u2', isOnline: false })).counties).toBeNull();
  });

  it('prefers the newest dataset version of a county', async () => {
    fetchBoundaries.mockResolvedValue({ data: [{ ...HENRY, datasetVersion: 'fixture-0' }, HENRY, BENTON], error: null });
    const out = await loadCountiesFor(AREA, { userId: 'u', isOnline: true });
    expect(out.counties?.filter(c => c.fips === '29083').map(c => c.datasetVersion)).toEqual(['fixture-1']);
  });
});
