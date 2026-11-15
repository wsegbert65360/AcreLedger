import { getLandlordSplitPercent } from '@/lib/cropShare';
import { sanitizeCsvValue } from '@/utils/csv';
import type {
  CustomSprayRecord,
  FertilizerApplication,
  Field,
  HarvestRecord,
  HayHarvestRecord,
  PlantRecord,
  SprayRecord,
  TillageRecord,
} from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';
import { getWorkDateMs, parseLocalDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';

/**
 * Landlord Summary — a richer per-landlord report than LandlordStatement.
 *
 * A landlord's fields are resolved from the field-level `landlordName`. All
 * season-scoped activity on those fields (plant, spray, custom spray,
 * fertilizer, tillage, grain harvest, hay harvest) is aggregated into an
 * activity timeline, and each field gets a per-field production summary
 * (bushels + bu/acre + bales + landlord crop-share from grain harvests), one
 * row per crop so crops are never blended.
 */

export type LandlordActivityType =
  | 'plant'
  | 'spray'
  | 'customSpray'
  | 'fertilizer'
  | 'tillage'
  | 'harvest'
  | 'hay';

export const LANDLORD_ACTIVITY_LABELS: Record<LandlordActivityType, string> = {
  plant: 'Plant',
  spray: 'Spray',
  customSpray: 'Custom Spray',
  fertilizer: 'Fertilizer',
  tillage: 'Tillage',
  harvest: 'Harvest',
  hay: 'Hay Harvest',
};

/**
 * One row per field per crop. A field with two crops in a season (double-crop,
 * or corn plus hay) has two rows; `acres` is the field's acreage on each row
 * because each crop is produced on those acres.
 */
export type LandlordFieldSummary = {
  fieldId: string;
  fieldName: string;
  acres: number;
  producerShare?: number;
  crop: string | null;
  totalBushels: number;
  buPerAcre: number | null;
  totalBales: number;
  landlordShareBushels: number;
};

export type LandlordActivityRow = {
  fieldId: string;
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

export type LandlordCropTotal = {
  crop: string;
  /** Sum of acres across this crop's rows. */
  acres: number;
  totalBushels: number;
  buPerAcre: number | null;
  totalBales: number;
  landlordShareBushels: number;
};

export type LandlordSummary = {
  landlordName: string;
  generatedAt: string; // ISO timestamp
  seasonYear: number | null;
  fields: LandlordFieldSummary[];
  activity: LandlordActivityRow[];
  /** Per-crop totals. Bushels of different crops are never added together. */
  cropTotals: LandlordCropTotal[];
  /** Grain harvests on these fields with no crop-share percent (counted as 0 share). */
  missingShareHarvests: number;
  totals: {
    /** Unique field acres (each field counted once). */
    acres: number;
    totalBales: number;
  };
};

export interface GenerateLandlordSummaryParams {
  landlordName: string;
  /** Farm-wide mode includes owned land as well as every landlord. */
  scope?: 'landlord' | 'farm';
  /** Required for farm-wide mode; missing farm fails closed. */
  farmId?: string;
  fields: Field[];
  cluAssignments: FieldCluAssignment[];
  plantRecords: PlantRecord[];
  sprayRecords: SprayRecord[];
  customSprayRecords: CustomSprayRecord[];
  fertilizerApplications: FertilizerApplication[];
  tillageRecords: TillageRecord[];
  harvestRecords: HarvestRecord[];
  hayHarvestRecords: HayHarvestRecord[];
  /** Season tag for display/exports; farm-wide mode also filters records by this season. */
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
  return getWorkDateMs({ date: iso, timestamp: fallbackTimestamp });
}

const HAY_LABEL = 'Hay';

/** True for a row or total that has bales but no grain, so bushel cells print blank instead of 0. */
export function isBaleOnly(item: { totalBushels: number; totalBales: number }): boolean {
  return item.totalBales > 0 && item.totalBushels === 0;
}

function buildFieldSummaries(
  landlordFields: Field[],
  cluAssignments: FieldCluAssignment[],
  harvestRecords: HarvestRecord[],
  hayHarvestRecords: HayHarvestRecord[],
  plantRecords: PlantRecord[],
): LandlordFieldSummary[] {
  const rows: LandlordFieldSummary[] = [];

  for (const field of landlordFields) {
    const acres = getDisplayFieldAcres(field, cluAssignments);
    const fieldHarvests = harvestRecords.filter(h => h.fieldId === field.id);
    const fieldHayHarvests = hayHarvestRecords.filter(h => h.fieldId === field.id);
    const totalBales = fieldHayHarvests.reduce((sum, h) => sum + (h.baleCount || 0), 0);

    const latestPlantCrop = [...plantRecords]
      .filter(p => p.fieldId === field.id)
      .sort((a, b) => dateSortKey(b.plantDate, b.timestamp) - dateSortKey(a.plantDate, a.timestamp))
      .map(p => p.crop?.trim())
      .find(c => !!c) || null;

    // Group grain harvests by crop so crops are never blended. A harvest with
    // no crop falls back to the field's latest planted crop.
    const groups = new Map<string, { label: string | null; harvests: HarvestRecord[]; latest: number }>();
    for (const h of fieldHarvests) {
      const label = h.crop?.trim() || latestPlantCrop;
      const key = (label ?? '').toLowerCase();
      const group = groups.get(key) ?? { label, harvests: [], latest: 0 };
      group.harvests.push(h);
      group.latest = Math.max(group.latest, dateSortKey(h.harvestDate, h.timestamp));
      groups.set(key, group);
    }

    const cropRows: LandlordFieldSummary[] = [...groups.values()]
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
      .map(group => {
        const totalBushels = roundTo(group.harvests.reduce((sum, h) => sum + (h.bushels || 0), 0), 2);
        const landlordShareBushels = roundTo(
          group.harvests.reduce((sum, h) => sum + (h.bushels || 0) * ((getLandlordSplitPercent(field, h.landlordSplitPercent) ?? 0) / 100), 0),
          2,
        );
        return {
          fieldId: field.id,
          fieldName: field.name,
          producerShare: field.producerShare,
          acres,
          crop: group.label,
          totalBushels,
          buPerAcre: acres > 0 ? roundTo(totalBushels / acres, 2) : null,
          totalBales: 0,
          landlordShareBushels,
        };
      });

    rows.push(...cropRows);

    // Bales go on their own Hay row, or onto a grain row already labelled Hay.
    const existingHayRow = cropRows.find(row => row.crop?.toLowerCase() === HAY_LABEL.toLowerCase());
    if (totalBales > 0 && existingHayRow) {
      existingHayRow.totalBales = totalBales;
    } else if (totalBales > 0) {
      rows.push({
        fieldId: field.id,
        fieldName: field.name,
        producerShare: field.producerShare,
        acres,
        crop: HAY_LABEL,
        totalBushels: 0,
        buPerAcre: null,
        totalBales,
        landlordShareBushels: 0,
      });
    }

    // Field with no production at all: keep one row so the field still appears.
    if (cropRows.length === 0 && totalBales === 0) {
      rows.push({
        fieldId: field.id,
        fieldName: field.name,
        producerShare: field.producerShare,
        acres,
        crop: latestPlantCrop,
        totalBushels: 0,
        buPerAcre: null,
        totalBales: 0,
        landlordShareBushels: 0,
      });
    }
  }

  return rows;
}

function buildCropTotals(rows: LandlordFieldSummary[]): LandlordCropTotal[] {
  const totals = new Map<string, LandlordCropTotal>();
  for (const row of rows) {
    if (!row.crop) continue;
    const key = row.crop.toLowerCase();
    const current = totals.get(key) ?? {
      crop: row.crop, acres: 0, totalBushels: 0, buPerAcre: null, totalBales: 0, landlordShareBushels: 0,
    };
    current.acres += row.acres || 0;
    current.totalBushels += row.totalBushels;
    current.totalBales += row.totalBales;
    current.landlordShareBushels += row.landlordShareBushels;
    totals.set(key, current);
  }
  return [...totals.values()]
    .map(t => {
      const acres = roundTo(t.acres, 2);
      const totalBushels = roundTo(t.totalBushels, 2);
      return {
        ...t,
        acres,
        totalBushels,
        landlordShareBushels: roundTo(t.landlordShareBushels, 2),
        buPerAcre: totalBushels > 0 && acres > 0 ? roundTo(totalBushels / acres, 2) : null,
      };
    })
    .sort((a, b) => {
      if (a.crop === HAY_LABEL) return 1;
      if (b.crop === HAY_LABEL) return -1;
      return a.crop.localeCompare(b.crop);
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
  hayHarvestRecords: HayHarvestRecord[],
  fieldNameById: Map<string, string>,
): LandlordActivityRow[] {
  const rows: LandlordActivityRow[] = [];

  for (const r of plantRecords) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    rows.push({
      fieldId: r.fieldId,
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
      fieldId: r.fieldId,
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
      fieldId: r.fieldId,
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
      fieldId: r.fieldId,
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
      fieldId: r.fieldId,
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
      fieldId: r.fieldId,
      sortKey: dateSortKey(r.harvestDate, r.timestamp),
      date: formatDate(r.harvestDate),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'harvest',
      crop: r.crop?.trim() || null,
      detail: `${(r.bushels || 0).toLocaleString()} bu`,
    });
  }

  for (const r of hayHarvestRecords) {
    if (!landlordFieldIds.has(r.fieldId)) continue;
    const baleLabel = r.baleCount === 1 ? 'bale' : 'bales';
    rows.push({
      fieldId: r.fieldId,
      sortKey: dateSortKey(r.date, r.timestamp),
      date: formatDate(r.date),
      fieldName: fieldNameById.get(r.fieldId) || r.fieldName,
      activityType: 'hay',
      crop: 'Hay',
      detail: `${(r.baleCount || 0).toLocaleString()} ${r.baleType.toLowerCase()} ${baleLabel} · Cutting ${r.cuttingNumber}`,
    });
  }

  return rows.sort((a, b) => a.sortKey - b.sortKey);
}

/** Farm-wide reports enforce tenant, season, and active-record scope before aggregation. */
function scopeFarmSummary(params: GenerateLandlordSummaryParams): GenerateLandlordSummaryParams {
  const activeFarmRecord = <T extends { farm_id?: string; deleted_at?: string | null }>(record: T) =>
    !!params.farmId && record.farm_id === params.farmId && !record.deleted_at;
  const seasonRecords = <T extends { farm_id?: string; deleted_at?: string | null; seasonYear?: number }>(records: T[]) =>
    records.filter(record => activeFarmRecord(record) && record.seasonYear === params.seasonYear);
  return {
    ...params,
    fields: params.fields.filter(activeFarmRecord),
    plantRecords: seasonRecords(params.plantRecords),
    sprayRecords: seasonRecords(params.sprayRecords),
    customSprayRecords: seasonRecords(params.customSprayRecords),
    fertilizerApplications: seasonRecords(params.fertilizerApplications),
    tillageRecords: seasonRecords(params.tillageRecords),
    harvestRecords: seasonRecords(params.harvestRecords),
    hayHarvestRecords: seasonRecords(params.hayHarvestRecords),
  };
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
    hayHarvestRecords,
    seasonYear,
  } = params.scope === 'farm' ? scopeFarmSummary(params) : params;

  const landlordFields = fields.filter(f => !f.deleted_at && (params.scope === 'farm' || isLandlordField(f, landlordName)));
  const landlordFieldIds = new Set(landlordFields.map(f => f.id));
  const fieldNameById = new Map(landlordFields.map(f => [f.id, f.name]));

  const fieldSummaries = buildFieldSummaries(landlordFields, cluAssignments, harvestRecords, hayHarvestRecords, plantRecords);
  const activity = buildActivityRows(
    landlordFieldIds,
    plantRecords,
    sprayRecords,
    customSprayRecords,
    fertilizerApplications,
    tillageRecords,
    harvestRecords,
    hayHarvestRecords,
    fieldNameById,
  );

  const totalAcres = roundTo(
    landlordFields.reduce((sum, f) => sum + (getDisplayFieldAcres(f, cluAssignments) || 0), 0),
    2,
  );
  const totalBales = fieldSummaries.reduce((sum, f) => sum + f.totalBales, 0);
  // Uses the same field-level fallback as the share math and the readiness check.
  const landlordFieldById = new Map(landlordFields.map(f => [f.id, f]));
  const missingShareHarvests = harvestRecords.filter(h => {
    const field = landlordFieldById.get(h.fieldId);
    if (!field) return false;
    const split = getLandlordSplitPercent(field, h.landlordSplitPercent);
    return split == null || !Number.isFinite(split);
  }).length;

  return {
    landlordName,
    generatedAt: new Date().toISOString(),
    seasonYear: typeof seasonYear === 'number' ? seasonYear : null,
    fields: fieldSummaries,
    activity,
    cropTotals: buildCropTotals(fieldSummaries),
    missingShareHarvests,
    totals: {
      acres: totalAcres,
      totalBales,
    },
  };
}


/**
 * Flat per-field-per-crop CSV with one totals row per crop (crops are never
 * summed together). Each row is one field and crop; the activity
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
    'Total Bales',
    'Landlord Share (Bu)',
  ];

  const dataRows = summary.fields.map(f => [
    f.fieldName,
    f.crop || '',
    String(f.acres),
    String(f.totalBushels),
    f.buPerAcre != null ? String(f.buPerAcre) : '',
    String(f.totalBales),
    String(f.landlordShareBushels),
  ]);

  const totalsRows = summary.cropTotals.map(t => [
    'TOTAL',
    t.crop,
    String(t.acres),
    isBaleOnly(t) ? '' : String(t.totalBushels),
    t.buPerAcre != null ? String(t.buPerAcre) : '',
    t.totalBales > 0 ? String(t.totalBales) : '',
    isBaleOnly(t) ? '' : String(t.landlordShareBushels),
  ]);

  const allRows = [headers, ...dataRows, ...totalsRows];
  return allRows.map(row => row.map(cell => sanitizeCsvValue(cell)).join(',')).join('\n');
}
