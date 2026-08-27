import type { SupabaseClient } from '@supabase/supabase-js';

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 10;
export const RESULT_JSON_BUDGET = 12_000;
export const LISTING_LIMIT_EARLIEST = 20;
export const LISTING_LIMIT_SEEDS = 100;

export const TOO_MANY_ROWS_ERROR = 'too many rows to summarize';
export const INVALID_ARGS_ERROR = 'invalid arguments';
export const UNKNOWN_TOOL_ERROR = 'unknown tool';

export interface ToolContext {
  supabase: SupabaseClient;
  seasonYear: number;
  farmId: string;
}

export interface ToolResult {
  lookup?: string;
  rows?: unknown;
  error?: string;
  truncated?: boolean;
}

const EMPTY_OBJECT_TOOLS = new Set<string>(['planted_acres_by_crop', 'bin_inventory', 'seed_library']);

const CROP_ALIASES: Array<{ key: string; pattern: RegExp }> = [
  { key: 'soybean', pattern: /\b(soy|soya|soybean|soybeans|beans)\b/ },
  { key: 'corn', pattern: /\b(corn|maize|maiz)\b/ },
  { key: 'wheat', pattern: /\bwheat\b/ },
  { key: 'sorghum', pattern: /\b(sorghum|milo)\b/ },
  { key: 'cotton', pattern: /\bcotton\b/ },
  { key: 'hay', pattern: /\b(hay|haylage|alfalfa|lucerne|pasture|grass)\b/ },
];

export function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCropName(crop: string): string {
  return crop.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function aliasGroupForCrop(crop: string): string | null {
  const normalized = normalizeCropName(crop);
  if (!normalized) return null;
  return CROP_ALIASES.find(({ pattern }) => pattern.test(normalized))?.key ?? null;
}

function parseArgsJson(raw: unknown): Record<string, unknown> | null {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function optionalTrimmedString(value: unknown, max: number): string | undefined | typeof INVALID_ARGS_ERROR {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return INVALID_ARGS_ERROR;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) return INVALID_ARGS_ERROR;
  return trimmed;
}

function requiredTrimmedString(value: unknown, max: number): string | typeof INVALID_ARGS_ERROR {
  if (typeof value !== 'string') return INVALID_ARGS_ERROR;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return INVALID_ARGS_ERROR;
  return trimmed;
}

function hasOnlyKeys(obj: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(obj).every(key => allowed.includes(key));
}

export function applyResultBudget(
  kind: 'listing' | 'aggregating',
  result: ToolResult,
): ToolResult {
  const encoded = JSON.stringify(result);
  if (encoded.length <= RESULT_JSON_BUDGET) return result;
  if (kind === 'aggregating') {
    return { error: TOO_MANY_ROWS_ERROR };
  }

  if (!Array.isArray(result.rows)) {
    return { lookup: result.lookup, rows: [], truncated: true };
  }

  let rows = result.rows as unknown[];
  let next = { ...result, rows, truncated: true as const };
  while (rows.length > 0 && JSON.stringify(next).length > RESULT_JSON_BUDGET) {
    rows = rows.slice(0, Math.max(0, Math.floor(rows.length / 2)));
    next = { ...result, rows, truncated: true };
  }
  if (JSON.stringify(next).length > RESULT_JSON_BUDGET) {
    return { lookup: result.lookup, rows: [], truncated: true };
  }
  return next;
}

function getSignedBushels(movement: { type?: string; bushels?: number }): number {
  const bushels = typeof movement.bushels === 'number' && Number.isFinite(movement.bushels)
    ? movement.bushels
    : 0;
  return movement.type === 'out' ? -bushels : bushels;
}

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

async function pageAll<T>(
  makeQuery: (from: number, to: number) => PromiseLike<QueryResult<T>>,
): Promise<{ rows: T[] } | { error: string }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await makeQuery(from, to);
    if (error) return { error: error.message };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows };
  }
  return { error: TOO_MANY_ROWS_ERROR };
}

interface EarliestPlantingArgs {
  crop: string;
  fieldName?: string;
}

interface SpraysForSeasonArgs {
  fieldName?: string;
}

function validateEarliestPlanting(args: Record<string, unknown>): EarliestPlantingArgs | { error: string } {
  if (Object.prototype.hasOwnProperty.call(args, 'seasonYear')) {
    return { error: INVALID_ARGS_ERROR };
  }
  if (!hasOnlyKeys(args, ['crop', 'fieldName'])) {
    return { error: INVALID_ARGS_ERROR };
  }
  const crop = requiredTrimmedString(args.crop, 80);
  if (crop === INVALID_ARGS_ERROR) return { error: INVALID_ARGS_ERROR };
  const fieldName = optionalTrimmedString(args.fieldName, 80);
  if (fieldName === INVALID_ARGS_ERROR) return { error: INVALID_ARGS_ERROR };
  return fieldName ? { crop, fieldName } : { crop };
}

function validateSpraysForSeason(args: Record<string, unknown>): SpraysForSeasonArgs | { error: string } {
  if (Object.prototype.hasOwnProperty.call(args, 'seasonYear')) {
    return { error: INVALID_ARGS_ERROR };
  }
  if (!hasOnlyKeys(args, ['fieldName'])) {
    return { error: INVALID_ARGS_ERROR };
  }
  const fieldName = optionalTrimmedString(args.fieldName, 80);
  if (fieldName === INVALID_ARGS_ERROR) return { error: INVALID_ARGS_ERROR };
  return fieldName ? { fieldName } : {};
}

function validateEmptyObject(args: Record<string, unknown>): { error: string } | Record<string, never> {
  if (Object.keys(args).length > 0) return { error: INVALID_ARGS_ERROR };
  return {};
}

async function executeEarliestPlanting(
  args: EarliestPlantingArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const fieldClause = args.fieldName ? `, field name matching "${args.fieldName}"` : '';
  const lookup = `Earliest dated ${args.crop} plantings in ${ctx.seasonYear}${fieldClause}, excluding prevented planting, sorted by date (capped at ${LISTING_LIMIT_EARLIEST}).`;

  let query = ctx.supabase
    .from('plant_records')
    .select('plant_date, seed_variety, crop, field_name, acreage, crop_status, season_year')
    .is('deleted_at', null)
    .eq('season_year', ctx.seasonYear)
    .ilike('crop', `%${escapeIlike(args.crop)}%`)
    .not('plant_date', 'is', null)
    .or('crop_status.is.null,crop_status.neq."Prevented Planting"');

  if (args.fieldName) {
    query = query.ilike('field_name', `%${escapeIlike(args.fieldName)}%`);
  }

  const { data, error } = await query
    .order('plant_date', { ascending: true })
    .limit(LISTING_LIMIT_EARLIEST);

  if (error) return { lookup, error: error.message };
  return applyResultBudget('listing', { lookup, rows: data ?? [] });
}

interface AcresRow {
  crop?: string | null;
  acreage?: number | null;
  crop_status?: string | null;
  field_name?: string | null;
}

async function executePlantedAcresByCrop(ctx: ToolContext): Promise<ToolResult> {
  const lookup = `Sum of planting-record acres in ${ctx.seasonYear}, excluding prevented planting (not FSA cropland acres). Corn includes Field Corn; soybeans include Soy.`;

  const paged = await pageAll<AcresRow>((from, to) =>
    ctx.supabase
      .from('plant_records')
      .select('crop, acreage, crop_status, field_name')
      .is('deleted_at', null)
      .eq('season_year', ctx.seasonYear)
      .or('crop_status.is.null,crop_status.neq."Prevented Planting"')
      .order('id', { ascending: true })
      .range(from, to),
  );

  if ('error' in paged) {
    return { lookup, error: paged.error };
  }

  const groups = new Map<string, { group: string; acres: number; labels: Set<string> }>();
  for (const row of paged.rows) {
    const acres = typeof row.acreage === 'number' && Number.isFinite(row.acreage) ? row.acreage : 0;
    const stored = typeof row.crop === 'string' ? row.crop.trim() : '';
    const alias = stored ? aliasGroupForCrop(stored) : null;
    const mergeKey = alias ?? (stored ? normalizeCropName(stored) : '(no crop)');
    const displayGroup = alias ?? (stored || '(no crop)');
    const existing = groups.get(mergeKey);
    if (existing) {
      existing.acres += acres;
      if (stored) existing.labels.add(stored);
    } else {
      const labels = new Set<string>();
      if (stored) labels.add(stored);
      groups.set(mergeKey, { group: displayGroup, acres, labels });
    }
  }

  const rows = Array.from(groups.values()).map(entry => ({
    group: entry.group,
    acres: entry.acres,
    labels: Array.from(entry.labels),
  }));

  return applyResultBudget('aggregating', { lookup, rows });
}

interface SprayRow {
  spray_date?: string | null;
  field_name?: string | null;
  products?: unknown;
}

async function executeSpraysForSeason(
  args: SpraysForSeasonArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const fieldClause = args.fieldName ? `, field name matching "${args.fieldName}"` : '';
  const lookup = `Spray applications in ${ctx.seasonYear}${fieldClause}: every matching field and product name (notes omitted).`;

  const paged = await pageAll<SprayRow>((from, to) => {
    let query = ctx.supabase
      .from('spray_records')
      .select('spray_date, field_name, products')
      .is('deleted_at', null)
      .eq('season_year', ctx.seasonYear);
    if (args.fieldName) {
      query = query.ilike('field_name', `%${escapeIlike(args.fieldName)}%`);
    }
    return query.order('id', { ascending: true }).range(from, to);
  });

  if ('error' in paged) {
    return { lookup, error: paged.error };
  }

  const fields = new Set<string>();
  const products = new Set<string>();
  for (const row of paged.rows) {
    const fieldName = typeof row.field_name === 'string' ? row.field_name.trim() : '';
    if (fieldName) fields.add(fieldName);
    if (Array.isArray(row.products)) {
      for (const product of row.products) {
        if (!isPlainObject(product)) continue;
        const name = typeof product.product === 'string' ? product.product.trim() : '';
        if (name) products.add(name);
      }
    }
  }

  return applyResultBudget('aggregating', {
    lookup,
    rows: {
      applicationCount: paged.rows.length,
      fields: Array.from(fields),
      products: Array.from(products),
    },
  });
}

interface BinRow {
  id?: string;
  name?: string | null;
  capacity?: number | null;
}

interface MovementRow {
  bin_id?: string | null;
  type?: string | null;
  bushels?: number | null;
}

async function executeBinInventory(ctx: ToolContext): Promise<ToolResult> {
  const lookup = 'All-season physical bin inventory (signed bushels across every crop year; not season-scoped).';

  const { data: binData, error: binError } = await ctx.supabase
    .from('bins')
    .select('id, name, capacity')
    .is('deleted_at', null);

  if (binError) return { lookup, error: binError.message };

  const bins = (binData ?? []) as BinRow[];
  const paged = await pageAll<MovementRow>((from, to) =>
    ctx.supabase
      .from('grain_movements')
      .select('bin_id, type, bushels')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, to),
  );

  if ('error' in paged) {
    return { lookup, error: paged.error };
  }

  const totals = new Map<string, number>();
  for (const movement of paged.rows) {
    const binId = typeof movement.bin_id === 'string' ? movement.bin_id : '';
    if (!binId) continue;
    const current = totals.get(binId) ?? 0;
    totals.set(binId, current + getSignedBushels({
      type: movement.type ?? undefined,
      bushels: typeof movement.bushels === 'number' ? movement.bushels : 0,
    }));
  }

  const rows = bins.map(bin => ({
    binName: typeof bin.name === 'string' && bin.name.trim() ? bin.name : 'Unnamed Bin',
    bushels: (bin.id ? totals.get(bin.id) : undefined) ?? 0,
    capacity: typeof bin.capacity === 'number' && Number.isFinite(bin.capacity) ? bin.capacity : 0,
  }));

  return applyResultBudget('aggregating', { lookup, rows });
}

async function executeSeedLibrary(ctx: ToolContext): Promise<ToolResult> {
  const lookup = `Saved seeds in the seed library (capped at ${LISTING_LIMIT_SEEDS}; soft-deleted excluded).`;
  const { data, error } = await ctx.supabase
    .from('saved_seeds')
    .select('name, crop, variety, supplier, lot_number, year')
    .is('deleted_at', null)
    .limit(LISTING_LIMIT_SEEDS);

  if (error) return { lookup, error: error.message };
  return applyResultBudget('listing', { lookup, rows: data ?? [] });
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'earliest_planting',
    description:
      'List the earliest dated plantings for a crop in the current viewing season. Excludes prevented planting and undated rows. Optional field name filter.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        crop: { type: 'string', description: 'Crop name to search (partial match).' },
        fieldName: { type: 'string', description: 'Optional field name filter (partial match).' },
      },
      required: ['crop'],
    },
  },
  {
    type: 'function',
    name: 'planted_acres_by_crop',
    description:
      'Sum planting-record acres by crop group for the current viewing season, excluding prevented planting. Corn includes Field Corn; soybeans include Soy. Not FSA cropland acres.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'sprays_for_season',
    description:
      'Every spray application in the current viewing season: unique field names and product names. Does not return notes or photos. Optional field name filter.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fieldName: { type: 'string', description: 'Optional field name filter (partial match).' },
      },
    },
  },
  {
    type: 'function',
    name: 'bin_inventory',
    description:
      'Physical grain bin inventory across every season. Uses signed bushels (outbound subtracts; negative inbound stays negative). Not season-scoped.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'seed_library',
    description: 'List saved seeds in the farm seed library.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
] as const;

export async function executeNamedTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (
    name !== 'earliest_planting'
    && name !== 'planted_acres_by_crop'
    && name !== 'sprays_for_season'
    && name !== 'bin_inventory'
    && name !== 'seed_library'
  ) {
    return { error: UNKNOWN_TOOL_ERROR };
  }

  const parsed = parseArgsJson(rawArgs);
  if (!parsed) return { error: INVALID_ARGS_ERROR };

  if (name === 'earliest_planting') {
    const args = validateEarliestPlanting(parsed);
    if ('error' in args) return args;
    return executeEarliestPlanting(args, ctx);
  }

  if (name === 'sprays_for_season') {
    const args = validateSpraysForSeason(parsed);
    if ('error' in args) return args;
    return executeSpraysForSeason(args, ctx);
  }

  if (EMPTY_OBJECT_TOOLS.has(name)) {
    const args = validateEmptyObject(parsed);
    if ('error' in args) return args;
  }

  if (name === 'planted_acres_by_crop') return executePlantedAcresByCrop(ctx);
  if (name === 'bin_inventory') return executeBinInventory(ctx);
  return executeSeedLibrary(ctx);
}
