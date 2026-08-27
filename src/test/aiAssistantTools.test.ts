import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyResultBudget,
  escapeIlike,
  executeNamedTool,
  INVALID_ARGS_ERROR,
  MAX_PAGES,
  PAGE_SIZE,
  TOO_MANY_ROWS_ERROR,
  UNKNOWN_TOOL_ERROR,
  type ToolContext,
} from '../../api/ai-assistant-tools';

interface CallLog {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
  ilike: Array<[string, string]>;
  not: Array<[string, string, unknown]>;
  or: string[];
  order: Array<[string, unknown?]>;
  limit?: number;
  range?: [number, number];
}

type TableHandler = (call: CallLog) => { data: unknown; error: { message: string } | null } | unknown[];

function createFakeSupabase(handlers: Record<string, TableHandler> = {}) {
  const calls: CallLog[] = [];
  const from = vi.fn((table: string) => {
    const call: CallLog = {
      table,
      eq: [],
      is: [],
      ilike: [],
      not: [],
      or: [],
      order: [],
    };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = (cols: string) => {
      call.select = cols;
      return self();
    };
    builder.eq = (column: string, value: unknown) => {
      call.eq.push([column, value]);
      return self();
    };
    builder.is = (column: string, value: unknown) => {
      call.is.push([column, value]);
      return self();
    };
    builder.ilike = (column: string, value: string) => {
      call.ilike.push([column, value]);
      return self();
    };
    builder.not = (column: string, operator: string, value: unknown) => {
      call.not.push([column, operator, value]);
      return self();
    };
    builder.or = (expr: string) => {
      call.or.push(expr);
      return self();
    };
    builder.order = (column: string, options?: unknown) => {
      call.order.push([column, options]);
      return self();
    };
    builder.limit = (count: number) => {
      call.limit = count;
      return self();
    };
    builder.range = (fromIdx: number, toIdx: number) => {
      call.range = [fromIdx, toIdx];
      return self();
    };
    builder.then = (
      onFulfilled: ((value: { data: unknown; error: { message: string } | null }) => unknown) | null,
      onRejected: ((reason: unknown) => unknown) | null,
    ) => {
      const handler = handlers[table];
      const raw = handler ? handler(call) : [];
      const result = raw && typeof raw === 'object' && 'data' in raw && 'error' in raw
        ? raw as { data: unknown; error: { message: string } | null }
        : { data: raw, error: null };
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return builder;
  });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    calls,
  };
}

function ctxFor(client: SupabaseClient, seasonYear = 2026): ToolContext {
  return { supabase: client, seasonYear, farmId: 'farm-1' };
}

describe('escapeIlike', () => {
  it('escapes backslash, percent, and underscore', () => {
    expect(escapeIlike('%')).toBe('\\%');
    expect(escapeIlike('corn_')).toBe('corn\\_');
    expect(escapeIlike('a\\b')).toBe('a\\\\b');
  });
});

describe('applyResultBudget', () => {
  it('returns aggregating payloads over 12kB as a too-many-rows error, not a sliced list', () => {
    const result = applyResultBudget('aggregating', {
      lookup: 'bins',
      rows: Array.from({ length: 400 }, (_, i) => ({ binName: `Bin ${i}`, bushels: i, capacity: 50000 })),
    });
    expect(result.error).toBe(TOO_MANY_ROWS_ERROR);
    expect(result.rows).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('Bin 0');
  });

  it('may truncate listing payloads with truncated: true', () => {
    const result = applyResultBudget('listing', {
      lookup: 'seeds',
      rows: Array.from({ length: 400 }, (_, i) => ({ name: `Seed ${i}`.repeat(20) })),
    });
    expect(result.truncated).toBe(true);
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(12_000);
  });
});

describe('executeNamedTool validation', () => {
  it('rejects unknown tool names without querying', async () => {
    const fake = createFakeSupabase();
    const result = await executeNamedTool('drop_all', '{}', ctxFor(fake.client));
    expect(result).toEqual({ error: UNKNOWN_TOOL_ERROR });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('rejects empty crop, extra keys, seasonYear, and non-objects without querying', async () => {
    const fake = createFakeSupabase();
    const ctx = ctxFor(fake.client);

    expect(await executeNamedTool('earliest_planting', '{"crop":""}', ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('earliest_planting', '{"crop":"corn","seasonYear":2026}', ctx)).toEqual({
      error: INVALID_ARGS_ERROR,
    });
    expect(await executeNamedTool('earliest_planting', '{"crop":"corn","surprise":true}', ctx)).toEqual({
      error: INVALID_ARGS_ERROR,
    });
    expect(await executeNamedTool('earliest_planting', '[]', ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('earliest_planting', 'null', ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('earliest_planting', '{', ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('earliest_planting', 12, ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('planted_acres_by_crop', '{"crop":"corn"}', ctx)).toEqual({
      error: INVALID_ARGS_ERROR,
    });
    expect(await executeNamedTool('bin_inventory', '{"seasonYear":2026}', ctx)).toEqual({
      error: INVALID_ARGS_ERROR,
    });
    expect(await executeNamedTool('sprays_for_season', '{"fieldName":1}', ctx)).toEqual({
      error: INVALID_ARGS_ERROR,
    });

    expect(fake.from).not.toHaveBeenCalled();
  });
});

describe('earliest_planting', () => {
  it('filters season, soft-delete, dated rows, crop ilike, and excludes prevented planting', async () => {
    const fake = createFakeSupabase({
      plant_records: () => [{ plant_date: '2026-04-12', seed_variety: 'P1197', crop: 'Corn', field_name: 'Home' }],
    });
    const result = await executeNamedTool('earliest_planting', '{"crop":"corn"}', ctxFor(fake.client));
    const call = fake.calls[0];
    expect(call.select).toContain('plant_date');
    expect(call.is).toContainEqual(['deleted_at', null]);
    expect(call.eq).toContainEqual(['season_year', 2026]);
    expect(call.ilike).toContainEqual(['crop', '%corn%']);
    expect(call.not).toContainEqual(['plant_date', 'is', null]);
    expect(call.or[0]).toContain('crop_status.is.null');
    expect(call.or[0]).toContain('crop_status.neq."Prevented Planting"');
    expect(call.order[0][0]).toBe('plant_date');
    expect(call.limit).toBe(20);
    expect(result.error).toBeUndefined();
    expect(result.lookup).toMatch(/2026/);
    expect(result.lookup).toMatch(/prevented planting/i);
  });

  it('applies fieldName ilike when present and omits it otherwise', async () => {
    const fake = createFakeSupabase({ plant_records: () => [] });
    await executeNamedTool('earliest_planting', '{"crop":"corn","fieldName":"Home Place"}', ctxFor(fake.client));
    expect(fake.calls[0].ilike).toContainEqual(['field_name', '%Home Place%']);

    const fake2 = createFakeSupabase({ plant_records: () => [] });
    await executeNamedTool('earliest_planting', '{"crop":"corn"}', ctxFor(fake2.client));
    expect(fake2.calls[0].ilike.some(([col]) => col === 'field_name')).toBe(false);
  });

  it('escapes LIKE wildcards in crop and fieldName', async () => {
    const fake = createFakeSupabase({ plant_records: () => [] });
    await executeNamedTool('earliest_planting', '{"crop":"%","fieldName":"corn_"}', ctxFor(fake.client));
    expect(fake.calls[0].ilike).toContainEqual(['crop', '%\\%%']);
    expect(fake.calls[0].ilike).toContainEqual(['field_name', '%corn\\_%']);
    expect(fake.calls[0].ilike.find(([, pattern]) => pattern === '%%')).toBeUndefined();
  });
});

describe('planted_acres_by_crop', () => {
  it('excludes prevented planting, includes Failed, and sums two rows on the same field', async () => {
    const fake = createFakeSupabase({
      plant_records: () => [
        { crop: 'Corn', acreage: 40, crop_status: 'Planted', field_name: 'Home' },
        { crop: 'Corn', acreage: 20, crop_status: 'Failed', field_name: 'Home' },
      ],
    });
    const result = await executeNamedTool('planted_acres_by_crop', '{}', ctxFor(fake.client));
    expect(fake.calls[0].select).not.toContain('clu');
    expect(fake.calls[0].or[0]).toContain('Prevented Planting');
    expect(result.error).toBeUndefined();
    const rows = result.rows as Array<{ group: string; acres: number }>;
    const corn = rows.find(row => row.group === 'corn');
    expect(corn?.acres).toBe(60);
    expect(result.lookup).toMatch(/not FSA cropland/i);
  });

  it('groups Field Corn with Corn and Soy with Soybeans', async () => {
    const fake = createFakeSupabase({
      plant_records: () => [
        { crop: 'Field Corn', acreage: 50, crop_status: 'Planted' },
        { crop: 'Corn', acreage: 10, crop_status: null },
        { crop: 'Soy', acreage: 30, crop_status: 'Planted' },
        { crop: 'Soybeans', acreage: 20, crop_status: 'Planted' },
      ],
    });
    const result = await executeNamedTool('planted_acres_by_crop', '{}', ctxFor(fake.client));
    const rows = result.rows as Array<{ group: string; acres: number; labels: string[] }>;
    const corn = rows.find(row => row.group === 'corn');
    const soy = rows.find(row => row.group === 'soybean');
    expect(corn?.acres).toBe(60);
    expect(corn?.labels).toEqual(expect.arrayContaining(['Field Corn', 'Corn']));
    expect(soy?.acres).toBe(50);
    expect(soy?.labels).toEqual(expect.arrayContaining(['Soy', 'Soybeans']));
  });

  it('returns too-many-rows with no numeric total when paging hits the cap', async () => {
    const fake = createFakeSupabase({
      plant_records: (call) => {
        const [from, to] = call.range ?? [0, PAGE_SIZE - 1];
        const size = to - from + 1;
        return Array.from({ length: size }, () => ({ crop: 'Corn', acreage: 1, crop_status: 'Planted' }));
      },
    });
    const result = await executeNamedTool('planted_acres_by_crop', '{}', ctxFor(fake.client));
    expect(fake.calls).toHaveLength(MAX_PAGES);
    expect(result.error).toBe(TOO_MANY_ROWS_ERROR);
    expect(result.rows).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/"acres"\s*:/);
  });
});

describe('sprays_for_season', () => {
  it('does not select notes and applies fieldName when present', async () => {
    const fake = createFakeSupabase({ spray_records: () => [] });
    await executeNamedTool('sprays_for_season', '{"fieldName":"%"}', ctxFor(fake.client));
    expect(fake.calls[0].select).toBe('spray_date, field_name, products');
    expect(fake.calls[0].select).not.toContain('notes');
    expect(fake.calls[0].ilike).toContainEqual(['field_name', '%\\%%']);
  });

  it('returns every field from 101 applications instead of a 100-row slice', async () => {
    const fake = createFakeSupabase({
      spray_records: () => Array.from({ length: 101 }, (_, i) => ({
        spray_date: '2026-06-01',
        field_name: `Field ${i % 3}`,
        products: [{ product: 'Roundup' }],
      })),
    });
    const result = await executeNamedTool('sprays_for_season', '{}', ctxFor(fake.client));
    const rows = result.rows as { applicationCount: number; fields: string[]; products: string[] };
    expect(rows.applicationCount).toBe(101);
    expect(rows.fields).toHaveLength(3);
    expect(rows.products).toEqual(['Roundup']);
  });

  it('returns an error, not a partial field list, when the page cap is hit', async () => {
    const fake = createFakeSupabase({
      spray_records: (call) => {
        const [from, to] = call.range ?? [0, PAGE_SIZE - 1];
        return Array.from({ length: to - from + 1 }, (_, i) => ({
          field_name: `Field ${from + i}`,
          products: [],
        }));
      },
    });
    const result = await executeNamedTool('sprays_for_season', '{}', ctxFor(fake.client));
    expect(result.error).toBe(TOO_MANY_ROWS_ERROR);
    expect(result.rows).toBeUndefined();
  });
});

describe('bin_inventory', () => {
  it('sums movements from two season years and uses signed bushels', async () => {
    const fake = createFakeSupabase({
      bins: () => [{ id: 'bin-1', name: 'North', capacity: 10000 }],
      grain_movements: () => [
        { bin_id: 'bin-1', type: 'in', bushels: 500, season_year: 2025 },
        { bin_id: 'bin-1', type: 'in', bushels: 200, season_year: 2026 },
        { bin_id: 'bin-1', type: 'out', bushels: 100 },
        { bin_id: 'bin-1', type: 'in', bushels: -25 },
      ],
    });
    const result = await executeNamedTool('bin_inventory', '{}', ctxFor(fake.client));
    const movementCall = fake.calls.find(call => call.table === 'grain_movements');
    expect(movementCall?.eq.some(([col]) => col === 'season_year')).toBe(false);
    expect(movementCall?.select).toBe('bin_id, type, bushels');
    const rows = result.rows as Array<{ binName: string; bushels: number; capacity: number }>;
    expect(rows[0]).toEqual({ binName: 'North', bushels: 575, capacity: 10000 });
  });

  it('returns an error instead of a truncated bushel figure when movement pages are full', async () => {
    const fake = createFakeSupabase({
      bins: () => [{ id: 'bin-1', name: 'North', capacity: 10000 }],
      grain_movements: (call) => {
        const [from, to] = call.range ?? [0, PAGE_SIZE - 1];
        return Array.from({ length: to - from + 1 }, () => ({
          bin_id: 'bin-1',
          type: 'in',
          bushels: 1,
        }));
      },
    });
    const result = await executeNamedTool('bin_inventory', '{}', ctxFor(fake.client));
    expect(result.error).toBe(TOO_MANY_ROWS_ERROR);
    expect(result.rows).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/"bushels"\s*:/);
  });
});

describe('seed_library', () => {
  it('lists seeds with a cap and soft-delete filter', async () => {
    const fake = createFakeSupabase({
      saved_seeds: () => [{ name: 'P1197', crop: 'Corn', variety: 'P1197', supplier: 'Pioneer', lot_number: '1', year: 2026 }],
    });
    const result = await executeNamedTool('seed_library', '{}', ctxFor(fake.client));
    expect(fake.calls[0].is).toContainEqual(['deleted_at', null]);
    expect(fake.calls[0].limit).toBe(100);
    expect(result.lookup).toMatch(/seed library/i);
    expect(result.error).toBeUndefined();
  });
});
