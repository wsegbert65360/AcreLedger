import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyResultBudget,
  escapeIlike,
  executeNamedTool,
  FARM_ENTITY_NAMES,
  INVALID_ARGS_ERROR,
  MAX_PAGES,
  PAGE_SIZE,
  TOOL_DEFINITIONS,
  TOO_MANY_ROWS_ERROR,
  UNKNOWN_TOOL_ERROR,
  type ToolContext,
} from '../../server/ai-assistant-tools';

interface CallLog {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
  ilike: Array<[string, string]>;
  in: Array<[string, readonly string[]]>;
  gte: Array<[string, string]>;
  lte: Array<[string, string]>;
  gt: Array<[string, string]>;
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
      in: [],
      gte: [],
      lte: [],
      gt: [],
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
    builder.in = (column: string, values: readonly string[]) => {
      call.in.push([column, values]);
      return self();
    };
    builder.gte = (column: string, value: string) => {
      call.gte.push([column, value]);
      return self();
    };
    builder.lte = (column: string, value: string) => {
      call.lte.push([column, value]);
      return self();
    };
    builder.gt = (column: string, value: string) => {
      call.gt.push([column, value]);
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

describe('full farm read catalog', () => {
  it('publishes every active farm record area and no mutation tools', () => {
    expect(FARM_ENTITY_NAMES).toEqual([
      'farm', 'profile', 'fields', 'bins', 'plant_records', 'spray_records',
      'custom_spray_records', 'fertilizer_applications', 'tillage_records',
      'harvest_records', 'hay_harvest_records', 'grain_movements', 'saved_seeds',
      'fertilizer_recipes', 'spray_recipes', 'fsa_tract_imports',
      'field_clu_assignments', 'work_requests', 'field_rainfall_hourly',
      'field_rainfall_coverage', 'farm_rainfall_daily',
    ]);
    const toolNames = TOOL_DEFINITIONS.map(tool => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining([
      'farm_overview', 'query_farm_records', 'get_record_details',
      'search_farm_records', 'aggregate_farm_records', 'activity_timeline',
    ]));
    expect(toolNames.some(name => /insert|update|delete|write|save|upsert/i.test(name))).toBe(false);
  });

  it('scopes every catalog entity to the authoritative farm and excludes soft-deleted rows', async () => {
    const expectedTables: Record<string, string> = {
      farm: 'farms',
      profile: 'profiles',
    };
    const softDeleted = new Set([
      'fields', 'bins', 'plant_records', 'spray_records', 'custom_spray_records',
      'fertilizer_applications', 'tillage_records', 'harvest_records',
      'hay_harvest_records', 'grain_movements', 'saved_seeds', 'fertilizer_recipes',
      'spray_recipes', 'fsa_tract_imports', 'field_clu_assignments', 'work_requests',
    ]);

    for (const entity of FARM_ENTITY_NAMES) {
      const fake = createFakeSupabase();
      const result = await executeNamedTool('query_farm_records', { entity, limit: 1 }, ctxFor(fake.client));
      expect(result.error, entity).toBeUndefined();
      const call = fake.calls.find(item => item.table === (expectedTables[entity] ?? entity));
      expect(call, entity).toBeTruthy();
      if (entity === 'farm') expect(call?.eq).toContainEqual(['id', 'farm-1']);
      else if (entity === 'field_rainfall_hourly' || entity === 'field_rainfall_coverage') {
        expect(call?.eq).toContainEqual(['fields.farm_id', 'farm-1']);
      } else {
        expect(call?.eq).toContainEqual(['farm_id', 'farm-1']);
      }
      if (softDeleted.has(entity)) expect(call?.is).toContainEqual(['deleted_at', null]);
    }
  });

  it('rejects unknown entities, unsupported filters, invalid years, and extra keys before querying', async () => {
    const fake = createFakeSupabase();
    const ctx = ctxFor(fake.client);
    expect(await executeNamedTool('query_farm_records', { entity: 'auth.users' }, ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('query_farm_records', { entity: 'bins', seasonYear: 2026 }, ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('query_farm_records', { entity: 'fields', dateFrom: '2026-01-01' }, ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('query_farm_records', { entity: 'plant_records', seasonYear: 1999 }, ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(await executeNamedTool('query_farm_records', { entity: 'plant_records', write: true }, ctx)).toEqual({ error: INVALID_ARGS_ERROR });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('returns full spray details but removes embedded image bytes before model exposure', async () => {
    const fake = createFakeSupabase({
      spray_records: () => [{
        id: 'spray-1',
        field_name: 'Home',
        notes: 'Ticket attached [ATTACHMENT:data:image/png;base64,ABC123] done',
        products: [{ product: 'Roundup', rate: '32', rateUnit: 'oz/ac' }],
      }],
    });
    const result = await executeNamedTool('get_record_details', {
      entity: 'spray_records', recordId: 'spray-1',
    }, ctxFor(fake.client));
    const rows = result.rows as Array<Record<string, unknown>>;
    expect(fake.calls[0].select).toBe('*');
    expect(fake.calls[0].eq).toContainEqual(['id', 'spray-1']);
    expect(rows[0].products).toEqual([{ product: 'Roundup', rate: '32', rateUnit: 'oz/ac' }]);
    expect(rows[0].notes).toContain('[image attachment present; binary omitted]');
    expect(JSON.stringify(rows)).not.toContain('ABC123');
  });

  it('supports season, field, date, and cursor filters with deterministic ID ordering', async () => {
    const fake = createFakeSupabase({ plant_records: () => [] });
    await executeNamedTool('query_farm_records', {
      entity: 'plant_records', seasonYear: 2026, fieldName: 'Home%',
      dateFrom: '2026-04-01', dateTo: '2026-05-01', afterId: 'record-10', limit: 20,
    }, ctxFor(fake.client));
    const call = fake.calls[0];
    expect(call.eq).toContainEqual(['farm_id', 'farm-1']);
    expect(call.eq).toContainEqual(['season_year', 2026]);
    expect(call.ilike).toContainEqual(['field_name', '%Home\\%%']);
    expect(call.gte).toContainEqual(['plant_date', '2026-04-01']);
    expect(call.lte).toContainEqual(['plant_date', '2026-05-01']);
    expect(call.gt).toContainEqual(['id', 'record-10']);
    expect(call.order[0]).toEqual(['id', { ascending: true }]);
    expect(call.limit).toBe(21);
  });

  it('resolves field-only foreign keys inside the current farm before reading applications', async () => {
    const fake = createFakeSupabase({
      fields: () => [{ id: 'field-1' }],
      fertilizer_applications: () => [{ id: 'fert-1', field_id: 'field-1', acres: 40 }],
    });
    const result = await executeNamedTool('query_farm_records', {
      entity: 'fertilizer_applications', fieldName: 'North', limit: 10,
    }, ctxFor(fake.client));
    expect(result.error).toBeUndefined();
    expect(fake.calls[0].table).toBe('fields');
    expect(fake.calls[0].eq).toContainEqual(['farm_id', 'farm-1']);
    expect(fake.calls[1].in).toContainEqual(['field_id', ['field-1']]);
    expect(fake.calls[1].eq).toContainEqual(['farm_id', 'farm-1']);
  });

  it('returns a discovery catalog with supported filters and aggregate fields', async () => {
    const fake = createFakeSupabase({
      farms: () => [{ id: 'farm-1', name: 'Test Farm' }],
      profiles: () => [{ id: 'user-1', farm_id: 'farm-1', active_season: 2026 }],
      fields: () => [{ id: 'field-1', name: 'Home', acreage: 40 }],
      bins: () => [{ id: 'bin-1', name: 'North', capacity: 10000 }],
    });
    const result = await executeNamedTool('farm_overview', {}, ctxFor(fake.client));
    const overview = result.rows as {
      availableRecordTypes: Array<{ entity: string; numericFields: string[]; supportsFieldName: boolean }>;
    };
    expect(result.error).toBeUndefined();
    expect(overview.availableRecordTypes).toHaveLength(FARM_ENTITY_NAMES.length);
    expect(overview.availableRecordTypes).toContainEqual(expect.objectContaining({
      entity: 'harvest_records',
      numericFields: expect.arrayContaining(['bushels']),
      supportsFieldName: true,
    }));
  });

  it('returns a cursor matching the last row actually retained by the response budget', async () => {
    const fake = createFakeSupabase({
      plant_records: () => Array.from({ length: 100 }, (_, index) => ({
        id: `record-${String(index).padStart(3, '0')}`,
        crop: 'Corn',
        memo: 'x'.repeat(500),
      })),
    });
    const result = await executeNamedTool('query_farm_records', {
      entity: 'plant_records', limit: 100,
    }, ctxFor(fake.client));
    const rows = result.rows as Array<{ id: string }>;
    expect(result.truncated).toBe(true);
    expect(rows.length).toBeLessThan(100);
    expect(result.nextCursor).toBe(rows.at(-1)?.id);
  });
});

describe('flexible farm tools', () => {
  it('searches nested products and notes across selected record types', async () => {
    const fake = createFakeSupabase({
      spray_records: () => [{ id: 's1', products: [{ product: 'Liberty' }], notes: 'North fence' }],
      spray_recipes: () => [{ id: 'r1', name: 'Burndown', products: [{ product: 'Roundup' }] }],
    });
    const result = await executeNamedTool('search_farm_records', {
      query: 'liberty', entities: ['spray_records', 'spray_recipes'],
    }, ctxFor(fake.client));
    const rows = result.rows as Array<{ entity: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].entity).toBe('spray_records');
    expect(fake.calls.every(call => call.eq.some(([column, value]) => column === 'farm_id' && value === 'farm-1'))).toBe(true);
  });

  it('calculates grouped sums from every matching row rather than a display slice', async () => {
    const fake = createFakeSupabase({
      harvest_records: () => [
        { crop: 'Corn', bushels: 100 },
        { crop: 'Corn', bushels: 50 },
        { crop: 'Soybeans', bushels: 80 },
      ],
    });
    const result = await executeNamedTool('aggregate_farm_records', {
      entity: 'harvest_records', operation: 'sum', numericField: 'bushels',
      groupBy: 'crop', seasonYear: 2026,
    }, ctxFor(fake.client));
    expect(result.rows).toEqual(expect.arrayContaining([
      { group: 'Corn', value: 150, recordCount: 2, numericValueCount: 2 },
      { group: 'Soybeans', value: 80, recordCount: 1, numericValueCount: 1 },
    ]));
    expect(fake.calls[0].range).toEqual([0, PAGE_SIZE - 1]);
    expect(fake.calls[0].eq).toContainEqual(['season_year', 2026]);
  });

  it('fails closed for non-allowlisted aggregate fields', async () => {
    const fake = createFakeSupabase();
    const result = await executeNamedTool('aggregate_farm_records', {
      entity: 'harvest_records', operation: 'sum', numericField: 'farm_id',
    }, ctxFor(fake.client));
    expect(result).toEqual({ error: INVALID_ARGS_ERROR });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('builds a cross-type timeline in newest-first order', async () => {
    const fake = createFakeSupabase({
      plant_records: () => [{ id: 'p1', plant_date: '2026-04-10', field_name: 'Home' }],
      spray_records: () => [{ id: 's1', spray_date: '2026-05-10', field_name: 'Home' }],
    });
    const result = await executeNamedTool('activity_timeline', { seasonYear: 2026, limit: 10 }, ctxFor(fake.client));
    const rows = result.rows as Array<{ entity: string }>;
    expect(rows[0].entity).toBe('spray_records');
    expect(rows[1].entity).toBe('plant_records');
    expect(fake.calls.filter(call => call.table !== 'fields').every(call => (
      call.eq.some(([column, value]) => column === 'farm_id' && value === 'farm-1')
      && call.eq.some(([column, value]) => column === 'season_year' && value === 2026)
    ))).toBe(true);
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
    expect(fake.calls[0].limit).toBe(101);
    expect(fake.calls[0].order[0]).toEqual(['id', { ascending: true }]);
    expect(result.lookup).toMatch(/seed library/i);
    expect(result.error).toBeUndefined();
  });
});
