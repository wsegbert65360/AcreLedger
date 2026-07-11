import type {
  CustomSprayRecord,
  FertilizerApplication,
  Field,
  HarvestRecord,
  PlantRecord,
  SprayRecord,
  TillageRecord,
} from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';
import { parseLocalDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';

/**
 * Landlord Summary — a richer per-landlord report than LandlordStatement.
 *
 * A landlord's fields are resolved from the field-level `landlordName`. All
 * season-scoped activity on those fields (plant, spray, custom spray,
 * fertilizer, tillage, harvest) is aggregated into an activity timeline, and
 * each field gets a per-field yield summary (bushels + bu/acre + landlord
 * crop-share from harvest records).
 */

export type LandlordActivityType =
  | 'plant'
  | 'spray'
  | 'customSpray'
  | 'fertilizer'
  | 'tillage'
  | 'harvest';

export type LandlordFieldSummary = {
  fieldId: string;
  fieldName: string;
  acres: number;
  crop: string | null;
  totalBushels: number;
  buPerAcre: number | null;
  landlordShareBushels: number;
};

export type LandlordActivityRow = {
  /** Sort key — epoch ms. */
  sortKey: number;
  /** Display date formatted MM/DD/YYYY. */
  date: string;
  fieldName: string;
  activityType: LandlordActivityType;
  crop: string | null;
  /** Human-readable one-line detail, e.g. "Seed: Pioneer P1197" or "Corn — 4,200 bu". */
  detail: string;
};

export type LandlordSummary = {
  landlordName: string;
  generatedAt: string; // ISO timestamp
  seasonYear: number | null;
  fields: LandlordFieldSummary[];
  activity: LandlordActivityRow[];
  totals: {
    acres: number;
    totalBushels: number;
    landlordShareBushels: number;
  };
};

export interface GenerateLandlordSummaryParams {
  landlordName: string;
  fields: Field[];
  cluAssignments: FieldCluAssignment[];
  plantRecords: PlantRecord[];
  sprayRecords: SprayRecord[];
  customSprayRecords: CustomSprayRecord[];
  fertilizerApplications: FertilizerApplication[];
  tillageRecords: TillageRecord[];
  harvestRecords: HarvestRecord[];
  /** Optional season tag for display/exports; does not filter records (caller pre-scopes). */
  seasonYear?: number;
}

/**
 * Unique, sorted landlord names derived from the field-level `landlordName`.
 * A landlord appears only if they still own at least one non-deleted field,
 * so a landlord whose only fields are soft-deleted is not selectable.
 */
export function getFieldLandlordNames(fields: Field[]): string[] {
  const names = fields
    .filter(f => !f.deleted_at)
    .map(f => f.landlordName?.trim())
    .filter((n): n is string => !!n);
  return [...new Set(names)].sort();
}

/** Case-insensitive, trimmed landlord match. */
function isLandlordField(field: Field, landlordName: string): boolean {
  const name = field.landlordName?.trim()?.toLowerCase() ?? '';
  return name === landlordName.trim().toLowerCase();
}

/**
 * Format a record date (date-only ISO or full ISO) as MM/DD/YYYY, parsing the
 * date part as local midnight to avoid the one-day-early UTC shift that
 * `new Date('YYYY-MM-DD')` causes in negative-UTC timezones.
 */
function formatDate(iso: string | undefined): string {
  if (!iso) return 'N/A';
  const d = parseLocalDate(iso.split('T')[0]);
  if (isNaN(d.getTime())) return 'N/A';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Parses any record date into an epoch-ms sort key (0 when missing/invalid). */
function dateSortKey(iso: string | undefined, fallbackTimestamp?: number): number {
  if (iso) {
    const t = new Date(iso).getTime();
    if (!isNaN(t)) return t;
  }
  return typeof fallbackTimestamp === 'number' ? fallbackTimestamp : 0;
}

function buildFieldSummaries(
  landlordFields: Field[],
  cluAssignments: FieldCluAssignment[],
  harvestRecords: HarvestRecord[],
  plantRecords: PlantRecord[],
): LandlordFieldSummary[] {
  return landlordFields.map(field => {
    const acres = getDisplayFieldAcres(field, cluAssignments);
    const fieldHarvests = harvestRecords.filter(h => h.fieldId === field.id);
    const totalBushels = roundTo(
      fieldHarvests.reduce((sum, h) => sum + (h.bushels || 0), 0),
      2,
    );
    const landlordShareBushels = roundTo(
      fieldHarvests.reduce((sum, h) => sum + (h.bushels || 0) * ((h.landlordSplitPercent || 0) / 100), 0),
      2,
    );
    const buPerAcre = acres > 0 ? roundTo(totalBushels / acres, 2) : null;

    // Crop: prefer the latest harvest crop, then the latest plant crop.
    const latestHarvestCrop = [...fieldHarvests]
      .sort((a, b) => dateSortKey(b.harvestDate, b.timestamp) - dateSortKey(a.harvestDate, a.timestamp))
      .map(h => h.crop?.trim())
      .find(c => !!c);
    const latestPlantCrop = [...plantRecords]
      .filter(p => p.fieldId === field.id)
      .sort((a, b) => dateSortKey(b.plantDate, b.timestamp) - dateSortKey(a.plantDate, a.timestamp))
      .map(p => p.crop?.trim())
      .find(c => !!c);
    const crop = latestHarvestCrop || latestPlantCrop || null;

    return {
      fieldId: field.id,
      fieldName: field.name,
      acres,
      crop,
      totalBushels,
      buPerAcre,
      landlordShareBushels,
    };
  });
}

function summarizeProducts(products: SprayRecord['products']): string {
  if (!products || products.length === 0) return 'No products logged';
  return products
    .map(p => {
      const rate = p.rate && p.rateUnit ? ` ${p.rate}${p.rateUnit}` : '';
      return `${p.product}${rate}`;
    })
    .join(' + ');
}

function buildActivityRows(
  landlordFieldIds: Set<string>,
  plantRecords: PlantRecord[],
  sprayRecords: SprayRecord[],
  customSprayRecords: CustomSprayRecord[],
  fertilizerApplications: FertilizerApplication[],
  tillageRecords: TillageRecord[],
  harvestRecords: HarvestRecord[],
  fieldNameById: Map<string, string>,
): LandlordActivityRow[] {
  const rows: LandlordActivityRow[] = [];

  for (const r of plantRecords) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    rows.push({
      sortKey: dateSortKey(r.plantDate, r.timestamp),
      date: formatDate(r.plantDate),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'plant',
      crop: r.crop?.trim() || null,
      detail: r.seedVariety ? `Seed: ${r.seedVariety}` : 'Planted',
    });
  }

  for (const r of sprayRecords) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    rows.push({
      sortKey: dateSortKey(r.sprayDate, r.timestamp),
      date: formatDate(r.sprayDate),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'spray',
      crop: r.cropOrSiteTreated?.trim() || null,
      detail: summarizeProducts(r.products),
    });
  }

  for (const r of customSprayRecords) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    rows.push({
      sortKey: dateSortKey(r.date, r.timestamp),
      date: formatDate(r.date),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'customSpray',
      crop: null,
      detail: r.recipe?.trim() || r.applicator || 'Custom application',
    });
  }

  for (const r of fertilizerApplications) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    rows.push({
      sortKey: dateSortKey(r.date, r.timestamp),
      date: formatDate(r.date),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'fertilizer',
      crop: null,
      detail: r.fertilizer_formula || 'Fertilizer applied',
    });
  }

  for (const r of tillageRecords) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    rows.push({
      sortKey: dateSortKey(r.date, r.timestamp),
      date: formatDate(r.date),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'tillage',
      crop: null,
      detail: r.implementType || 'Tillage',
    });
  }

  for (const r of harvestRecords) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    rows.push({
      sortKey: dateSortKey(r.harvestDate, r.timestamp),
      date: formatDate(r.harvestDate),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'harvest',
      crop: r.crop?.trim() || null,
      detail: `${(r.bushels || 0).toLocaleString()} bu`,
    });
  }

  return rows.sort((a, b) => a.sortKey - b.sortKey);
}

export function generateLandlordSummary(params: GenerateLandlordSummaryParams): LandlordSummary {
  const {
    landlordName,
    fields,
    cluAssignments,
    plantRecords,
    sprayRecords,
    customSprayRecords,
    fertilizerApplications,
    tillageRecords,
    harvestRecords,
    seasonYear,
  } = params;

  const landlordFields = fields.filter(f => !f.deleted_at && isLandlordField(f, landlordName));
  const landlordFieldIds = new Set(landlordFields.map(f => f.id));
  const fieldNameById = new Map(landlordFields.map(f => [f.id, f.name]));

  const fieldSummaries = buildFieldSummaries(landlordFields, cluAssignments, harvestRecords, plantRecords);
  const activity = buildActivityRows(
    landlordFieldIds,
    plantRecords,
    sprayRecords,
    customSprayRecords,
    fertilizerApplications,
    tillageRecords,
    harvestRecords,
    fieldNameById,
  );

  const totalAcres = roundTo(fieldSummaries.reduce((sum, f) => sum + (f.acres || 0), 0), 2);
  const totalBushels = roundTo(fieldSummaries.reduce((sum, f) => sum + f.totalBushels, 0), 2);
  const totalLandlordShareBushels = roundTo(fieldSummaries.reduce((sum, f) => sum + f.landlordShareBushels, 0), 2);

  return {
    landlordName,
    generatedAt: new Date().toISOString(),
    seasonYear: typeof seasonYear === 'number' ? seasonYear : null,
    fields: fieldSummaries,
    activity,
    totals: {
      acres: totalAcres,
      totalBushels,
      landlordShareBushels: totalLandlordShareBushels,
    },
  };
}

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    str = `'${str}`;
  }
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Flat per-field CSV with a totals row. Each row is one field; the activity
 * timeline is intentionally not flattened here (it lives in the on-screen UI
 * and the PDF), keeping the CSV a clean numeric summary a landlord can read.
 */
export function generateLandlordSummaryCSV(summary: LandlordSummary): string {
  const headers = [
    'Field',
    'Crop',
    'Acres',
    'Total Bushels',
    'Bu/Acre',
    'Landlord Share (Bu)',
  ];

  const dataRows = summary.fields.map(f => [
    f.fieldName,
    f.crop || '',
    String(f.acres),
    String(f.totalBushels),
    f.buPerAcre != null ? String(f.buPerAcre) : '',
    String(f.landlordShareBushels),
  ]);

  const totalsRow = [
    'TOTAL',
    '',
    String(summary.totals.acres),
    String(summary.totals.totalBushels),
    summary.totals.acres > 0
      ? String(roundTo(summary.totals.totalBushels / summary.totals.acres, 2))
      : '',
    String(summary.totals.landlordShareBushels),
  ];

  const allRows = [headers, ...dataRows, totalsRow];
  return allRows.map(row => row.map(cell => escapeCsvCell(cell)).join(',')).join('\n');
}
