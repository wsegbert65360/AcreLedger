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
  nextCursor?: string;
}

export const FARM_ENTITY_NAMES = [
  'farm',
  'profile',
  'fields',
  'bins',
  'plant_records',
  'spray_records',
  'custom_spray_records',
  'fertilizer_applications',
  'tillage_records',
  'harvest_records',
  'hay_harvest_records',
  'grain_movements',
  'saved_seeds',
  'fertilizer_recipes',
  'spray_recipes',
  'fsa_tract_imports',
  'field_clu_assignments',
  'work_requests',
  'field_rainfall_hourly',
  'field_rainfall_coverage',
  'farm_rainfall_daily',
] as const;

export type FarmEntityName = typeof FARM_ENTITY_NAMES[number];

type FarmScope = 'farm_id' | 'farm_primary_key' | 'field_relation';

interface FarmEntitySpec {
  table: string;
  label: string;
  farmScope: FarmScope;
  softDelete: boolean;
  seasonColumn?: string;
  fieldNameColumn?: string;
  fieldIdColumn?: string;
  dateColumn?: string;
  dateTimeColumn?: boolean;
  orderColumn: string;
  listSelect?: string;
  numericFields: readonly string[];
  groupFields: readonly string[];
}

const FARM_ENTITY_REGISTRY: Record<FarmEntityName, FarmEntitySpec> = {
  farm: {
    table: 'farms', label: 'farm details', farmScope: 'farm_primary_key', softDelete: false,
    orderColumn: 'id', numericFields: [], groupFields: ['name'],
  },
  profile: {
    table: 'profiles', label: 'current user profile', farmScope: 'farm_id', softDelete: false,
    orderColumn: 'id', listSelect: 'id, farm_id, active_season, onboarding_complete',
    numericFields: ['active_season'], groupFields: ['active_season', 'onboarding_complete'],
  },
  fields: {
    table: 'fields', label: 'fields', farmScope: 'farm_id', softDelete: true,
    fieldNameColumn: 'name', orderColumn: 'id',
    numericFields: ['acreage', 'operational_acreage', 'producer_share', 'lat', 'lng'],
    groupFields: ['name', 'fsa_farm_number', 'fsa_tract_number', 'fsa_field_number', 'landlord_name', 'irrigation_practice', 'intended_use'],
  },
  bins: {
    table: 'bins', label: 'grain bins', farmScope: 'farm_id', softDelete: true,
    orderColumn: 'id', numericFields: ['capacity'], groupFields: ['name'],
  },
  plant_records: {
    table: 'plant_records', label: 'planting records', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldNameColumn: 'field_name', dateColumn: 'plant_date', orderColumn: 'id',
    numericFields: ['acreage', 'producer_share', 'season_year'],
    groupFields: ['field_name', 'crop', 'seed_variety', 'intended_use', 'irrigation_practice', 'crop_status', 'crop_sequence', 'season_year'],
  },
  spray_records: {
    table: 'spray_records', label: 'full spray application records', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldNameColumn: 'field_name', dateColumn: 'spray_date', orderColumn: 'id',
    numericFields: ['wind_speed', 'temperature', 'relative_humidity', 'treated_area_size', 'total_amount_applied', 'pressure_psi', 'boom_height', 'actual_speed', 'wind_speed_end', 'temp_end', 'season_year'],
    groupFields: ['field_name', 'applicator_name', 'crop_or_site_treated', 'target_pest', 'application_method', 'equipment_id', 'non_compliant', 'season_year'],
  },
  custom_spray_records: {
    table: 'custom_spray_records', label: 'outside-party spray records', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldNameColumn: 'field_name', dateColumn: 'date', orderColumn: 'id',
    numericFields: ['wind_speed', 'temperature', 'season_year'],
    groupFields: ['field_name', 'applicator', 'wind_direction', 'season_year'],
  },
  fertilizer_applications: {
    table: 'fertilizer_applications', label: 'fertilizer applications', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldIdColumn: 'field_id', dateColumn: 'date', orderColumn: 'id',
    numericFields: ['acres', 'season_year'], groupFields: ['field_id', 'fertilizer_formula', 'season_year'],
  },
  tillage_records: {
    table: 'tillage_records', label: 'tillage records', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldNameColumn: 'field_name', dateColumn: 'date', orderColumn: 'id',
    numericFields: ['season_year'], groupFields: ['field_name', 'implement_type', 'season_year'],
  },
  harvest_records: {
    table: 'harvest_records', label: 'harvest records', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldNameColumn: 'field_name', dateColumn: 'harvest_date', orderColumn: 'id',
    numericFields: ['bushels', 'moisture_percent', 'landlord_split_percent', 'season_year'],
    groupFields: ['field_name', 'crop', 'destination', 'bin_id', 'landlord_name', 'season_year'],
  },
  hay_harvest_records: {
    table: 'hay_harvest_records', label: 'hay harvest records', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldNameColumn: 'field_name', dateColumn: 'date', orderColumn: 'id',
    numericFields: ['bale_count', 'cutting_number', 'temperature', 'season_year'],
    groupFields: ['field_name', 'bale_type', 'conditions', 'season_year'],
  },
  grain_movements: {
    table: 'grain_movements', label: 'grain movements and sales', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'season_year', fieldNameColumn: 'source_field_name', dateColumn: 'timestamp', dateTimeColumn: true, orderColumn: 'id',
    numericFields: ['bushels', 'moisture_percent', 'price', 'season_year'],
    groupFields: ['bin_id', 'bin_name', 'type', 'source_field_name', 'destination', 'season_year'],
  },
  saved_seeds: {
    table: 'saved_seeds', label: 'saved seed library', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'year', orderColumn: 'id', numericFields: ['year'],
    groupFields: ['name', 'crop', 'variety', 'supplier', 'lot_number', 'year'],
  },
  fertilizer_recipes: {
    table: 'fertilizer_recipes', label: 'fertilizer recipes', farmScope: 'farm_id', softDelete: true,
    orderColumn: 'id', numericFields: [], groupFields: ['name', 'npk_ratio'],
  },
  spray_recipes: {
    table: 'spray_recipes', label: 'spray recipes', farmScope: 'farm_id', softDelete: true,
    orderColumn: 'id', numericFields: [],
    groupFields: ['name', 'applicator_name', 'license_number', 'target_pest', 'crop_or_site_treated'],
  },
  fsa_tract_imports: {
    table: 'fsa_tract_imports', label: 'FSA tract imports', farmScope: 'farm_id', softDelete: true,
    dateColumn: 'imported_at', dateTimeColumn: true, orderColumn: 'id',
    listSelect: 'id, farm_id, tract_key, filename, feature_count, imported_at, deleted_at',
    numericFields: ['feature_count'], groupFields: ['tract_key', 'filename'],
  },
  field_clu_assignments: {
    table: 'field_clu_assignments', label: 'field CLU assignments', farmScope: 'farm_id', softDelete: true,
    fieldIdColumn: 'field_id', dateColumn: 'assigned_at', dateTimeColumn: true, orderColumn: 'id',
    numericFields: ['acres'], groupFields: ['field_id', 'tract_key', 'clu_number', 'land_use'],
  },
  work_requests: {
    table: 'work_requests', label: 'work requests', farmScope: 'farm_id', softDelete: true,
    seasonColumn: 'crop_year', dateColumn: 'created_at', dateTimeColumn: true, orderColumn: 'id',
    numericFields: ['crop_year'], groupFields: ['request_number', 'status', 'work_type', 'crop', 'crop_year', 'provider_name', 'customer_name'],
  },
  field_rainfall_hourly: {
    table: 'field_rainfall_hourly', label: 'hourly field rainfall', farmScope: 'field_relation', softDelete: false,
    fieldNameColumn: 'fields.name', dateColumn: 'timestamp_utc', dateTimeColumn: true, orderColumn: 'id',
    listSelect: '*, fields!inner(name, farm_id)', numericFields: ['rainfall_in'],
    groupFields: ['field_id', 'source', 'finalized'],
  },
  field_rainfall_coverage: {
    table: 'field_rainfall_coverage', label: 'field rainfall coverage', farmScope: 'field_relation', softDelete: false,
    fieldNameColumn: 'fields.name', dateColumn: 'range_start_utc', dateTimeColumn: true, orderColumn: 'field_id',
    listSelect: '*, fields!inner(name, farm_id)', numericFields: [], groupFields: ['field_id', 'status'],
  },
  farm_rainfall_daily: {
    table: 'farm_rainfall_daily', label: 'daily farm rainfall summaries', farmScope: 'farm_id', softDelete: false,
    dateColumn: 'date_local', orderColumn: 'date_local',
    numericFields: ['avg_rainfall_in', 'max_rainfall_in', 'min_rainfall_in', 'max_hourly_in', 'fields_count'],
    groupFields: ['date_local'],
  },
};

const AGGREGATE_FIELD_GUIDE = FARM_ENTITY_NAMES
  .filter(entity => FARM_ENTITY_REGISTRY[entity].numericFields.length > 0)
  .map(entity => {
    const spec = FARM_ENTITY_REGISTRY[entity];
    return `${entity} numeric=[${spec.numericFields.join(',')}] group=[${spec.groupFields.join(',')}]`;
  })
  .join('; ');

interface QueryRecordArgs {
  entity: FarmEntityName;
  seasonYear?: number;
  fieldName?: string;
  dateFrom?: string;
  dateTo?: string;
  recordId?: string;
  afterId?: string;
  limit: number;
}

interface SearchFarmRecordsArgs {
  query: string;
  entities: FarmEntityName[];
  seasonYear?: number;
  limit: number;
}

type AggregateOperation = 'count' | 'sum' | 'average' | 'minimum' | 'maximum';

interface AggregateFarmRecordsArgs {
  entity: FarmEntityName;
  operation: AggregateOperation;
  numericField?: string;
  groupBy?: string;
  seasonYear?: number;
  fieldName?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface FarmQueryBuilder extends PromiseLike<QueryResult<Record<string, unknown>>> {
  eq(column: string, value: unknown): FarmQueryBuilder;
  is(column: string, value: unknown): FarmQueryBuilder;
  ilike(column: string, pattern: string): FarmQueryBuilder;
  in(column: string, values: readonly string[]): FarmQueryBuilder;
  gte(column: string, value: string): FarmQueryBuilder;
  lte(column: string, value: string): FarmQueryBuilder;
  gt(column: string, value: string): FarmQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): FarmQueryBuilder;
  limit(count: number): FarmQueryBuilder;
  range(from: number, to: number): FarmQueryBuilder;
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

function isFarmEntityName(value: unknown): value is FarmEntityName {
  return typeof value === 'string' && (FARM_ENTITY_NAMES as readonly string[]).includes(value);
}

function optionalSeasonYear(value: unknown): number | undefined | typeof INVALID_ARGS_ERROR {
  if (value === undefined || value === null) return undefined;
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(value) || (value as number) < 2000 || (value as number) > maxYear) {
    return INVALID_ARGS_ERROR;
  }
  return value as number;
}

function optionalIsoDate(value: unknown): string | undefined | typeof INVALID_ARGS_ERROR {
  const parsed = optionalTrimmedString(value, 40);
  if (parsed === undefined || parsed === INVALID_ARGS_ERROR) return parsed;
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]*)?$/.test(parsed)) return INVALID_ARGS_ERROR;
  if (Number.isNaN(Date.parse(parsed.length === 10 ? `${parsed}T00:00:00Z` : parsed))) return INVALID_ARGS_ERROR;
  return parsed;
}

function optionalLimit(value: unknown, fallback: number, max: number): number | typeof INVALID_ARGS_ERROR {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) {
    return INVALID_ARGS_ERROR;
  }
  return value as number;
}

function validateQueryRecordArgs(args: Record<string, unknown>): QueryRecordArgs | { error: string } {
  if (!hasOnlyKeys(args, ['entity', 'seasonYear', 'fieldName', 'dateFrom', 'dateTo', 'recordId', 'afterId', 'limit'])) {
    return { error: INVALID_ARGS_ERROR };
  }
  if (!isFarmEntityName(args.entity)) return { error: INVALID_ARGS_ERROR };
  const spec = FARM_ENTITY_REGISTRY[args.entity];
  const seasonYear = optionalSeasonYear(args.seasonYear);
  const fieldName = optionalTrimmedString(args.fieldName, 80);
  const dateFrom = optionalIsoDate(args.dateFrom);
  const dateTo = optionalIsoDate(args.dateTo);
  const recordId = optionalTrimmedString(args.recordId, 100);
  const afterId = optionalTrimmedString(args.afterId, 100);
  const limit = optionalLimit(args.limit, 50, 100);
  if (
    seasonYear === INVALID_ARGS_ERROR
    || fieldName === INVALID_ARGS_ERROR
    || dateFrom === INVALID_ARGS_ERROR
    || dateTo === INVALID_ARGS_ERROR
    || recordId === INVALID_ARGS_ERROR
    || afterId === INVALID_ARGS_ERROR
    || limit === INVALID_ARGS_ERROR
  ) return { error: INVALID_ARGS_ERROR };
  if (seasonYear !== undefined && !spec.seasonColumn) return { error: INVALID_ARGS_ERROR };
  if (fieldName !== undefined && !spec.fieldNameColumn && !spec.fieldIdColumn) return { error: INVALID_ARGS_ERROR };
  if ((dateFrom !== undefined || dateTo !== undefined) && !spec.dateColumn) return { error: INVALID_ARGS_ERROR };
  if (dateFrom && dateTo && dateFrom > dateTo) return { error: INVALID_ARGS_ERROR };
  if (afterId && spec.orderColumn !== 'id') return { error: INVALID_ARGS_ERROR };
  if (recordId && (args.entity === 'field_rainfall_coverage' || args.entity === 'farm_rainfall_daily')) {
    return { error: INVALID_ARGS_ERROR };
  }
  return {
    entity: args.entity,
    limit,
    ...(seasonYear !== undefined ? { seasonYear } : {}),
    ...(fieldName ? { fieldName } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(recordId ? { recordId } : {}),
    ...(afterId ? { afterId } : {}),
  };
}

function validateSearchFarmRecordsArgs(args: Record<string, unknown>): SearchFarmRecordsArgs | { error: string } {
  if (!hasOnlyKeys(args, ['query', 'entities', 'seasonYear', 'limit'])) return { error: INVALID_ARGS_ERROR };
  const query = requiredTrimmedString(args.query, 120);
  const seasonYear = optionalSeasonYear(args.seasonYear);
  const limit = optionalLimit(args.limit, 30, 60);
  if (query === INVALID_ARGS_ERROR || seasonYear === INVALID_ARGS_ERROR || limit === INVALID_ARGS_ERROR) {
    return { error: INVALID_ARGS_ERROR };
  }
  if (!Array.isArray(args.entities) || args.entities.length < 1 || args.entities.length > 6) {
    return { error: INVALID_ARGS_ERROR };
  }
  const entities: FarmEntityName[] = [];
  for (const entity of args.entities) {
    if (!isFarmEntityName(entity)) return { error: INVALID_ARGS_ERROR };
    if (seasonYear !== undefined && !FARM_ENTITY_REGISTRY[entity].seasonColumn) {
      return { error: INVALID_ARGS_ERROR };
    }
    if (!entities.includes(entity)) entities.push(entity);
  }
  return { query, entities, limit, ...(seasonYear !== undefined ? { seasonYear } : {}) };
}

function validateAggregateFarmRecordsArgs(args: Record<string, unknown>): AggregateFarmRecordsArgs | { error: string } {
  if (!hasOnlyKeys(args, ['entity', 'operation', 'numericField', 'groupBy', 'seasonYear', 'fieldName', 'dateFrom', 'dateTo'])) {
    return { error: INVALID_ARGS_ERROR };
  }
  if (!isFarmEntityName(args.entity)) return { error: INVALID_ARGS_ERROR };
  const operations: AggregateOperation[] = ['count', 'sum', 'average', 'minimum', 'maximum'];
  if (typeof args.operation !== 'string' || !operations.includes(args.operation as AggregateOperation)) {
    return { error: INVALID_ARGS_ERROR };
  }
  const spec = FARM_ENTITY_REGISTRY[args.entity];
  const numericField = optionalTrimmedString(args.numericField, 80);
  const groupBy = optionalTrimmedString(args.groupBy, 80);
  const seasonYear = optionalSeasonYear(args.seasonYear);
  const fieldName = optionalTrimmedString(args.fieldName, 80);
  const dateFrom = optionalIsoDate(args.dateFrom);
  const dateTo = optionalIsoDate(args.dateTo);
  if (
    numericField === INVALID_ARGS_ERROR
    || groupBy === INVALID_ARGS_ERROR
    || seasonYear === INVALID_ARGS_ERROR
    || fieldName === INVALID_ARGS_ERROR
    || dateFrom === INVALID_ARGS_ERROR
    || dateTo === INVALID_ARGS_ERROR
  ) return { error: INVALID_ARGS_ERROR };
  if (args.operation !== 'count' && (!numericField || !spec.numericFields.includes(numericField))) {
    return { error: INVALID_ARGS_ERROR };
  }
  if (numericField && !spec.numericFields.includes(numericField)) return { error: INVALID_ARGS_ERROR };
  if (groupBy && !spec.groupFields.includes(groupBy)) return { error: INVALID_ARGS_ERROR };
  if (seasonYear !== undefined && !spec.seasonColumn) return { error: INVALID_ARGS_ERROR };
  if (fieldName !== undefined && !spec.fieldNameColumn && !spec.fieldIdColumn) return { error: INVALID_ARGS_ERROR };
  if ((dateFrom !== undefined || dateTo !== undefined) && !spec.dateColumn) return { error: INVALID_ARGS_ERROR };
  if (dateFrom && dateTo && dateFrom > dateTo) return { error: INVALID_ARGS_ERROR };
  return {
    entity: args.entity,
    operation: args.operation as AggregateOperation,
    ...(numericField ? { numericField } : {}),
    ...(groupBy ? { groupBy } : {}),
    ...(seasonYear !== undefined ? { seasonYear } : {}),
    ...(fieldName ? { fieldName } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
}

function sanitizeStringForModel(value: string): string {
  const withoutImages = value.replace(
    /\[ATTACHMENT:data:image\/[^;\]]+;base64,[^\]]+\]/g,
    '[image attachment present; binary omitted]',
  );
  if (withoutImages.length <= 4_000) return withoutImages;
  return `${withoutImages.slice(0, 4_000)}… [text truncated]`;
}

function geometrySummary(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return { present: true, coordinatesOmitted: true };
  const type = typeof value.type === 'string' ? value.type : 'unknown';
  const features = Array.isArray(value.features) ? value.features.length : undefined;
  return {
    type,
    ...(features !== undefined ? { featureCount: features } : {}),
    coordinatesOmitted: true,
  };
}

function sanitizeForModel(value: unknown, key = ''): unknown {
  if (typeof value === 'string') return sanitizeStringForModel(value);
  if (value === null || typeof value !== 'object') return value;
  if (key === 'geojson' || key === 'boundary') return geometrySummary(value);
  if (Array.isArray(value)) return value.map(item => sanitizeForModel(item));
  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = sanitizeForModel(childValue, childKey);
  }
  return result;
}

async function resolveFieldIds(ctx: ToolContext, fieldName: string): Promise<{ ids: string[] } | { error: string }> {
  const { data, error } = await ctx.supabase
    .from('fields')
    .select('id')
    .eq('farm_id', ctx.farmId)
    .is('deleted_at', null)
    .ilike('name', `%${escapeIlike(fieldName)}%`)
    .order('id', { ascending: true })
    .limit(101);
  if (error) return { error: error.message };
  const ids = (data ?? [])
    .map(row => isPlainObject(row) && typeof row.id === 'string' ? row.id : '')
    .filter(Boolean);
  if (ids.length > 100) return { error: 'too many matching fields; use a more specific field name' };
  return { ids };
}

function buildFarmQuery(
  args: Omit<QueryRecordArgs, 'limit'>,
  ctx: ToolContext,
  fieldIds?: readonly string[],
): FarmQueryBuilder {
  const spec = FARM_ENTITY_REGISTRY[args.entity];
  let query = ctx.supabase
    .from(spec.table)
    .select(spec.listSelect ?? '*') as unknown as FarmQueryBuilder;

  if (spec.farmScope === 'farm_primary_key') query = query.eq('id', ctx.farmId);
  if (spec.farmScope === 'farm_id') query = query.eq('farm_id', ctx.farmId);
  if (spec.farmScope === 'field_relation') query = query.eq('fields.farm_id', ctx.farmId);
  if (spec.softDelete) query = query.is('deleted_at', null);
  if (args.seasonYear !== undefined && spec.seasonColumn) {
    query = query.eq(spec.seasonColumn, args.seasonYear);
  }
  if (args.fieldName && spec.fieldNameColumn) {
    query = query.ilike(spec.fieldNameColumn, `%${escapeIlike(args.fieldName)}%`);
  }
  if (args.fieldName && spec.fieldIdColumn && fieldIds) {
    query = query.in(spec.fieldIdColumn, fieldIds);
  }
  if (args.dateFrom && spec.dateColumn) query = query.gte(spec.dateColumn, args.dateFrom);
  if (args.dateTo && spec.dateColumn) {
    const upperBound = spec.dateTimeColumn && args.dateTo.length === 10
      ? `${args.dateTo}T23:59:59.999Z`
      : args.dateTo;
    query = query.lte(spec.dateColumn, upperBound);
  }
  if (args.recordId) query = query.eq('id', args.recordId);
  if (args.afterId) query = query.gt('id', args.afterId);
  return query.order(spec.orderColumn, { ascending: true });
}

async function prepareFieldIds(
  args: Omit<QueryRecordArgs, 'limit'>,
  ctx: ToolContext,
): Promise<{ ids?: string[] } | { error: string }> {
  const spec = FARM_ENTITY_REGISTRY[args.entity];
  if (!args.fieldName || !spec.fieldIdColumn) return {};
  const resolved = await resolveFieldIds(ctx, args.fieldName);
  if ('error' in resolved) return resolved;
  return { ids: resolved.ids };
}

function describeFilters(args: Omit<QueryRecordArgs, 'limit'>): string {
  const filters: string[] = [];
  if (args.seasonYear !== undefined) filters.push(`season ${args.seasonYear}`);
  if (args.fieldName) filters.push(`field matching "${args.fieldName}"`);
  if (args.dateFrom) filters.push(`from ${args.dateFrom}`);
  if (args.dateTo) filters.push(`through ${args.dateTo}`);
  if (args.recordId) filters.push(`record ${args.recordId}`);
  return filters.length > 0 ? ` (${filters.join(', ')})` : ' (all seasons)';
}

async function fetchAllEntityRows(
  args: Omit<QueryRecordArgs, 'limit' | 'afterId'>,
  ctx: ToolContext,
): Promise<{ rows: Record<string, unknown>[] } | { error: string }> {
  const prepared = await prepareFieldIds(args, ctx);
  if ('error' in prepared) return prepared;
  if (args.fieldName && FARM_ENTITY_REGISTRY[args.entity].fieldIdColumn && prepared.ids?.length === 0) {
    return { rows: [] };
  }
  return pageAll<Record<string, unknown>>((from, to) =>
    buildFarmQuery(args, ctx, prepared.ids).range(from, to),
  );
}

async function executeQueryFarmRecords(args: QueryRecordArgs, ctx: ToolContext): Promise<ToolResult> {
  const spec = FARM_ENTITY_REGISTRY[args.entity];
  const filterArgs: Omit<QueryRecordArgs, 'limit'> = { ...args };
  delete (filterArgs as { limit?: number }).limit;
  const prepared = await prepareFieldIds(filterArgs, ctx);
  const lookup = `Active ${spec.label}${describeFilters(filterArgs)}, ordered by ${spec.orderColumn}; limit ${args.limit}.`;
  if ('error' in prepared) return { lookup, error: prepared.error };
  if (args.fieldName && spec.fieldIdColumn && prepared.ids?.length === 0) {
    return { lookup, rows: [] };
  }
  const { data, error } = await buildFarmQuery(filterArgs, ctx, prepared.ids).limit(args.limit + 1);
  if (error) return { lookup, error: error.message };
  const rawRows = data ?? [];
  const truncated = rawRows.length > args.limit;
  const visibleRows = rawRows.slice(0, args.limit);
  const last = visibleRows[visibleRows.length - 1];
  const nextCursor = truncated && spec.orderColumn === 'id' && typeof last?.id === 'string' ? last.id : undefined;
  const budgeted = applyResultBudget('listing', {
    lookup,
    rows: sanitizeForModel(visibleRows),
    ...(truncated ? { truncated: true } : {}),
    ...(nextCursor ? { nextCursor } : {}),
  });
  if (budgeted.truncated && spec.orderColumn === 'id' && Array.isArray(budgeted.rows)) {
    const budgetLast = budgeted.rows[budgeted.rows.length - 1];
    if (isPlainObject(budgetLast) && typeof budgetLast.id === 'string') {
      return { ...budgeted, nextCursor: budgetLast.id };
    }
    const withoutCursor = { ...budgeted };
    delete withoutCursor.nextCursor;
    return withoutCursor;
  }
  return budgeted;
}

function recordContainsText(record: Record<string, unknown>, needle: string): boolean {
  return JSON.stringify(sanitizeForModel(record)).toLocaleLowerCase().includes(needle);
}

async function executeSearchFarmRecords(args: SearchFarmRecordsArgs, ctx: ToolContext): Promise<ToolResult> {
  const lookup = `Text search for "${args.query}" across ${args.entities.join(', ')}${args.seasonYear !== undefined ? ` in season ${args.seasonYear}` : ' across all seasons'}; limit ${args.limit}.`;
  const needle = args.query.toLocaleLowerCase();
  const matches: Array<{ entity: FarmEntityName; record: unknown }> = [];
  let truncated = false;

  for (const entity of args.entities) {
    const paged = await fetchAllEntityRows({
      entity,
      ...(args.seasonYear !== undefined ? { seasonYear: args.seasonYear } : {}),
    }, ctx);
    if ('error' in paged) return { lookup, error: paged.error };
    for (const record of paged.rows) {
      if (!recordContainsText(record, needle)) continue;
      if (matches.length >= args.limit) {
        truncated = true;
        break;
      }
      matches.push({ entity, record: sanitizeForModel(record) });
    }
    if (truncated) break;
  }

  return applyResultBudget('listing', {
    lookup,
    rows: matches,
    ...(truncated ? { truncated: true } : {}),
  });
}

function aggregateValues(operation: AggregateOperation, values: number[], rowCount: number): number {
  if (operation === 'count') return rowCount;
  if (values.length === 0) return 0;
  if (operation === 'sum') return values.reduce((total, value) => total + value, 0);
  if (operation === 'average') return values.reduce((total, value) => total + value, 0) / values.length;
  if (operation === 'minimum') return Math.min(...values);
  return Math.max(...values);
}

async function executeAggregateFarmRecords(args: AggregateFarmRecordsArgs, ctx: ToolContext): Promise<ToolResult> {
  const spec = FARM_ENTITY_REGISTRY[args.entity];
  const queryArgs = {
    entity: args.entity,
    ...(args.seasonYear !== undefined ? { seasonYear: args.seasonYear } : {}),
    ...(args.fieldName ? { fieldName: args.fieldName } : {}),
    ...(args.dateFrom ? { dateFrom: args.dateFrom } : {}),
    ...(args.dateTo ? { dateTo: args.dateTo } : {}),
  };
  const lookup = `${args.operation} of ${args.numericField ?? 'records'} for active ${spec.label}${describeFilters(queryArgs)}${args.groupBy ? `, grouped by ${args.groupBy}` : ''}.`;
  const paged = await fetchAllEntityRows(queryArgs, ctx);
  if ('error' in paged) return { lookup, error: paged.error };

  const groups = new Map<string, { group: unknown; values: number[]; rowCount: number }>();
  for (const row of paged.rows) {
    const rawGroup = args.groupBy ? row[args.groupBy] : 'all';
    const groupKey = JSON.stringify(rawGroup ?? null);
    const entry = groups.get(groupKey) ?? { group: rawGroup ?? null, values: [], rowCount: 0 };
    entry.rowCount += 1;
    if (args.numericField) {
      const value = row[args.numericField];
      if (typeof value === 'number' && Number.isFinite(value)) entry.values.push(value);
    }
    groups.set(groupKey, entry);
  }

  if (groups.size === 0 && !args.groupBy) {
    groups.set('"all"', { group: 'all', values: [], rowCount: 0 });
  }
  const rows = Array.from(groups.values()).map(entry => ({
    ...(args.groupBy ? { group: entry.group } : {}),
    value: aggregateValues(args.operation, entry.values, entry.rowCount),
    recordCount: entry.rowCount,
    numericValueCount: entry.values.length,
  }));
  return applyResultBudget('aggregating', { lookup, rows });
}

async function executeFarmOverview(ctx: ToolContext): Promise<ToolResult> {
  const lookup = 'Current farm, profile, active fields, and grain bins, plus the complete assistant record catalog.';
  const [farm, profile, fields, bins] = await Promise.all([
    executeQueryFarmRecords({ entity: 'farm', limit: 2 }, ctx),
    executeQueryFarmRecords({ entity: 'profile', limit: 2 }, ctx),
    executeQueryFarmRecords({ entity: 'fields', limit: 100 }, ctx),
    executeQueryFarmRecords({ entity: 'bins', limit: 100 }, ctx),
  ]);
  const failed = [farm, profile, fields, bins].find(result => result.error);
  if (failed?.error) return { lookup, error: failed.error };
  const availableRecordTypes = FARM_ENTITY_NAMES.map(entity => {
    const spec = FARM_ENTITY_REGISTRY[entity];
    return {
      entity,
      description: spec.label,
      seasonField: spec.seasonColumn ?? null,
      dateField: spec.dateColumn ?? null,
      supportsFieldName: Boolean(spec.fieldNameColumn || spec.fieldIdColumn),
      numericFields: spec.numericFields,
      groupFields: spec.groupFields,
    };
  });
  let overviewFields = Array.isArray(fields.rows) ? fields.rows : [];
  let overviewBins = Array.isArray(bins.rows) ? bins.rows : [];
  let truncated = Boolean(fields.truncated || bins.truncated);
  const buildOverview = () => ({
    farm: farm.rows,
    profile: profile.rows,
    fields: overviewFields,
    bins: overviewBins,
    availableRecordTypes,
  });
  while (overviewFields.length > 0 && JSON.stringify({ lookup, rows: buildOverview() }).length > RESULT_JSON_BUDGET) {
    overviewFields = overviewFields.slice(0, Math.floor(overviewFields.length / 2));
    truncated = true;
  }
  while (overviewBins.length > 0 && JSON.stringify({ lookup, rows: buildOverview() }).length > RESULT_JSON_BUDGET) {
    overviewBins = overviewBins.slice(0, Math.floor(overviewBins.length / 2));
    truncated = true;
  }
  if (JSON.stringify({ lookup, rows: buildOverview() }).length > RESULT_JSON_BUDGET) {
    return { lookup, error: TOO_MANY_ROWS_ERROR };
  }
  return {
    lookup,
    rows: buildOverview(),
    ...(truncated ? { truncated: true } : {}),
  };
}

const ACTIVITY_ENTITIES: readonly FarmEntityName[] = [
  'plant_records',
  'spray_records',
  'custom_spray_records',
  'fertilizer_applications',
  'tillage_records',
  'harvest_records',
  'hay_harvest_records',
  'grain_movements',
];

async function executeActivityTimeline(args: QueryRecordArgs, ctx: ToolContext): Promise<ToolResult> {
  const seasonYear = args.seasonYear ?? ctx.seasonYear;
  const lookup = `Combined active farm activity timeline for season ${seasonYear}${args.fieldName ? `, field matching "${args.fieldName}"` : ''}${args.dateFrom ? `, from ${args.dateFrom}` : ''}${args.dateTo ? `, through ${args.dateTo}` : ''}; newest first, limit ${args.limit}.`;
  const timeline: Array<{ entity: FarmEntityName; date: unknown; record: unknown }> = [];
  for (const entity of ACTIVITY_ENTITIES) {
    const spec = FARM_ENTITY_REGISTRY[entity];
    if (args.fieldName && !spec.fieldNameColumn && !spec.fieldIdColumn && entity === 'grain_movements') continue;
    const paged = await fetchAllEntityRows({
      entity,
      seasonYear,
      ...(args.fieldName ? { fieldName: args.fieldName } : {}),
      ...(args.dateFrom ? { dateFrom: args.dateFrom } : {}),
      ...(args.dateTo ? { dateTo: args.dateTo } : {}),
    }, ctx);
    if ('error' in paged) return { lookup, error: paged.error };
    for (const record of paged.rows) {
      const date = spec.dateColumn ? record[spec.dateColumn] : undefined;
      timeline.push({ entity, date, record: sanitizeForModel(record) });
    }
  }
  timeline.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const truncated = timeline.length > args.limit;
  return applyResultBudget('listing', {
    lookup,
    rows: timeline.slice(0, args.limit),
    ...(truncated ? { truncated: true } : {}),
  });
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
    .eq('farm_id', ctx.farmId)
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
      .eq('farm_id', ctx.farmId)
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
      .eq('farm_id', ctx.farmId)
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
    .eq('farm_id', ctx.farmId)
    .is('deleted_at', null);

  if (binError) return { lookup, error: binError.message };

  const bins = (binData ?? []) as BinRow[];
  const paged = await pageAll<MovementRow>((from, to) =>
    ctx.supabase
      .from('grain_movements')
      .select('bin_id, type, bushels')
      .eq('farm_id', ctx.farmId)
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
    .eq('farm_id', ctx.farmId)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(LISTING_LIMIT_SEEDS + 1);

  if (error) return { lookup, error: error.message };
  const rows = data ?? [];
  const truncated = rows.length > LISTING_LIMIT_SEEDS;
  return applyResultBudget('listing', {
    lookup,
    rows: rows.slice(0, LISTING_LIMIT_SEEDS),
    ...(truncated ? { truncated: true } : {}),
  });
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'farm_overview',
    description:
      'Read the current farm, user profile season, every active field and bin, and the catalog of record types available to the assistant. Use this to discover the farm before broad or ambiguous questions.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'query_farm_records',
    description:
      'Read complete active records from one allowlisted farm data type. Omit seasonYear only when the user asks for all seasons or the entity is not season-scoped. Use afterId to continue a truncated ID-ordered result when nextCursor is returned.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        entity: { type: 'string', enum: FARM_ENTITY_NAMES, description: 'Farm record type to read.' },
        seasonYear: { type: 'integer', description: 'Optional crop year. Use the current viewing season unless the user requests all seasons or another year.' },
        fieldName: { type: 'string', description: 'Optional partial field-name filter, only for field-linked entities.' },
        dateFrom: { type: 'string', description: 'Optional inclusive ISO date or timestamp lower bound, only for dated entities.' },
        dateTo: { type: 'string', description: 'Optional inclusive ISO date or timestamp upper bound, only for dated entities.' },
        recordId: { type: 'string', description: 'Optional exact record ID.' },
        afterId: { type: 'string', description: 'Optional cursor returned by a prior ID-ordered query.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum records to return; defaults to 50.' },
      },
      required: ['entity'],
    },
  },
  {
    type: 'function',
    name: 'get_record_details',
    description:
      'Read one complete active farm record by its type and exact ID. Use when another tool returns a record ID and all recorded details, products, notes, or nested work-request data are needed.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        entity: { type: 'string', enum: FARM_ENTITY_NAMES, description: 'Farm record type.' },
        recordId: { type: 'string', description: 'Exact record ID.' },
      },
      required: ['entity', 'recordId'],
    },
  },
  {
    type: 'function',
    name: 'search_farm_records',
    description:
      'Search text and nested JSON content—including notes, memos, products, recipes, suppliers, destinations, and work requests—across one to six chosen active farm record types.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Text to find, case-insensitive.' },
        entities: {
          type: 'array', minItems: 1, maxItems: 6, uniqueItems: true,
          items: { type: 'string', enum: FARM_ENTITY_NAMES },
          description: 'Record types to search. Choose the most relevant types rather than searching the whole database.',
        },
        seasonYear: { type: 'integer', description: 'Optional crop year; every selected entity must support seasons.' },
        limit: { type: 'integer', minimum: 1, maximum: 60, description: 'Maximum matches; defaults to 30.' },
      },
      required: ['query', 'entities'],
    },
  },
  {
    type: 'function',
    name: 'aggregate_farm_records',
    description:
      `Calculate an exact count, sum, average, minimum, or maximum over active farm records, optionally grouped by an allowlisted field. Use this for totals and comparisons instead of adding rows yourself. Allowed fields: ${AGGREGATE_FIELD_GUIDE}`,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        entity: { type: 'string', enum: FARM_ENTITY_NAMES, description: 'Farm record type to aggregate.' },
        operation: { type: 'string', enum: ['count', 'sum', 'average', 'minimum', 'maximum'] },
        numericField: { type: 'string', description: 'Numeric database field. Required except for count; invalid fields fail closed.' },
        groupBy: { type: 'string', description: 'Optional allowlisted grouping field for this record type.' },
        seasonYear: { type: 'integer', description: 'Optional crop year.' },
        fieldName: { type: 'string', description: 'Optional partial field-name filter.' },
        dateFrom: { type: 'string', description: 'Optional inclusive ISO date or timestamp lower bound.' },
        dateTo: { type: 'string', description: 'Optional inclusive ISO date or timestamp upper bound.' },
      },
      required: ['entity', 'operation'],
    },
  },
  {
    type: 'function',
    name: 'activity_timeline',
    description:
      'Combine planting, spray, custom spray, fertilizer, tillage, harvest, hay, and grain activity into one newest-first timeline. Defaults to the current viewing season.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        seasonYear: { type: 'integer', description: 'Optional crop year; defaults to the current viewing season.' },
        fieldName: { type: 'string', description: 'Optional partial field-name filter.' },
        dateFrom: { type: 'string', description: 'Optional inclusive ISO date or timestamp lower bound.' },
        dateTo: { type: 'string', description: 'Optional inclusive ISO date or timestamp upper bound.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum activities; defaults to 50.' },
      },
    },
  },
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
    name !== 'farm_overview'
    && name !== 'query_farm_records'
    && name !== 'get_record_details'
    && name !== 'search_farm_records'
    && name !== 'aggregate_farm_records'
    && name !== 'activity_timeline'
    && name !== 'earliest_planting'
    && name !== 'planted_acres_by_crop'
    && name !== 'sprays_for_season'
    && name !== 'bin_inventory'
    && name !== 'seed_library'
  ) {
    return { error: UNKNOWN_TOOL_ERROR };
  }

  const parsed = parseArgsJson(rawArgs);
  if (!parsed) return { error: INVALID_ARGS_ERROR };

  if (name === 'farm_overview') {
    const args = validateEmptyObject(parsed);
    if ('error' in args) return args;
    return executeFarmOverview(ctx);
  }

  if (name === 'query_farm_records') {
    const args = validateQueryRecordArgs(parsed);
    if ('error' in args) return args;
    return executeQueryFarmRecords(args, ctx);
  }

  if (name === 'get_record_details') {
    if (!hasOnlyKeys(parsed, ['entity', 'recordId']) || !parsed.recordId) {
      return { error: INVALID_ARGS_ERROR };
    }
    const args = validateQueryRecordArgs({ ...parsed, limit: 1 });
    if ('error' in args || !args.recordId) return { error: INVALID_ARGS_ERROR };
    return executeQueryFarmRecords(args, ctx);
  }

  if (name === 'search_farm_records') {
    const args = validateSearchFarmRecordsArgs(parsed);
    if ('error' in args) return args;
    return executeSearchFarmRecords(args, ctx);
  }

  if (name === 'aggregate_farm_records') {
    const args = validateAggregateFarmRecordsArgs(parsed);
    if ('error' in args) return args;
    return executeAggregateFarmRecords(args, ctx);
  }

  if (name === 'activity_timeline') {
    if (!hasOnlyKeys(parsed, ['seasonYear', 'fieldName', 'dateFrom', 'dateTo', 'limit'])) {
      return { error: INVALID_ARGS_ERROR };
    }
    const args = validateQueryRecordArgs({ entity: 'plant_records', ...parsed });
    if ('error' in args) return args;
    return executeActivityTimeline(args, ctx);
  }

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
