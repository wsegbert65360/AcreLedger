import { parseLocalDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';

import type {
  LandlordActivityRow,
  LandlordActivityType,
  LandlordCropTotal,
  LandlordFieldSummary,
  LandlordSummary,
} from './generateLandlordSummary';

/**
 * Print layout for the Farm Owner Summary PDF.
 *
 * Pure view-model over a farm-wide `LandlordSummary`: grain rows grouped by
 * crop (crops are never added together), a hay table, the fields with no
 * production, and a condensed activity timeline. Identical applications made
 * within a few days share one line, and harvest loads roll up to one line per
 * field per crop.
 */

/** Same detail on the same activity type within this many days shares one timeline line. */
export const OWNER_TIMELINE_GROUP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OwnerGrainRow = {
  fieldId: string;
  fieldName: string;
  acres: number;
  totalBushels: number;
  buPerAcre: number | null;
  /** Landlord bushels ÷ total bushels × 100; null when nothing was harvested. */
  sharePercent: number | null;
  /** No landlord on the field and no landlord bushels. */
  owned: boolean;
  landlordShareBushels: number;
  ownerBushels: number;
  /** MM/DD/YYYY of the earliest planting of this crop, or null. */
  plantedDate: string | null;
  variety: string | null;
  harvestStart: string | null;
  harvestEnd: string | null;
};

export type OwnerGrainTotal = LandlordCropTotal & {
  sharePercent: number | null;
  ownerBushels: number;
};

export type OwnerGrainSection = {
  crop: string;
  rows: OwnerGrainRow[];
  total: OwnerGrainTotal;
};

export type OwnerHayRow = {
  fieldId: string;
  fieldName: string;
  acres: number;
  cuttings: number;
  lastCutDate: string | null;
  totalBales: number;
  balesPerAcre: number | null;
};

export type OwnerIdleRow = {
  fieldId: string;
  fieldName: string;
  acres: number;
};

export type OwnerTimelineGroup = {
  activityType: LandlordActivityType;
  startDate: string;
  endDate: string;
  fieldNames: string[];
  recordCount: number;
  detail: string;
};

export type OwnerTimelineSection = {
  activityType: LandlordActivityType;
  groups: OwnerTimelineGroup[];
};

export type OwnerHarvestRollup = {
  fieldId: string;
  fieldName: string;
  crop: string | null;
  startDate: string;
  endDate: string;
  days: number;
  loads: number;
  bushels: number;
};

export type OwnerSummaryLayout = {
  grainSections: OwnerGrainSection[];
  hayRows: OwnerHayRow[];
  hayTotal: { acres: number; cuttings: number; totalBales: number; balesPerAcre: number | null } | null;
  idleRows: OwnerIdleRow[];
  idleAcres: number;
  timeline: OwnerTimelineSection[];
  harvestRollups: OwnerHarvestRollup[];
  /** MM/DD/YYYY of the newest grain harvest load, or null. */
  latestHarvestDate: string | null;
};

/** Timeline sections in print order. Grain harvest is a rollup; hay cuttings are in the hay table. */
export const OWNER_TIMELINE_ORDER: LandlordActivityType[] = ['plant', 'tillage', 'fertilizer', 'spray', 'customSpray'];

const HAY = 'hay';

function cropWord(crop: string | null): string {
  return (crop ?? '').trim().toLowerCase();
}

/** Loose match for linking plantings to a harvest crop: "Soybean" and "Soybeans" are the same crop. */
function sameCrop(a: string | null, b: string | null): boolean {
  const singular = (crop: string | null) => cropWord(crop).replace(/s$/, '');
  return singular(a) === singular(b);
}

/** Activity dates are MM/DD/YYYY; compare by calendar day. */
function dateKey(display: string): number {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return 0;
  return parseLocalDate(`${match[3]}-${match[1]}-${match[2]}`).getTime();
}

function buildGrainRow(
  field: LandlordFieldSummary,
  activity: LandlordActivityRow[],
  grainRowsOnField: number,
): OwnerGrainRow {
  const fieldActivity = activity.filter(a => a.fieldId === field.fieldId);
  const allPlantings = fieldActivity.filter(a => a.activityType === 'plant');
  const cropPlantings = allPlantings.filter(a => !a.crop || sameCrop(a.crop, field.crop));
  // With one grain crop on the field, a planting with a misspelled crop still belongs to it.
  const plantings = cropPlantings.length > 0 || grainRowsOnField > 1 ? cropPlantings : allPlantings;
  const firstPlanting = plantings[0] ?? null;
  const harvests = fieldActivity.filter(a => a.activityType === 'harvest' && (!a.crop || sameCrop(a.crop, field.crop)));
  const owned = !field.landlordName && field.landlordShareBushels === 0;
  return {
    fieldId: field.fieldId,
    fieldName: field.fieldName,
    acres: field.acres,
    totalBushels: field.totalBushels,
    buPerAcre: field.buPerAcre,
    sharePercent: field.totalBushels > 0 ? roundTo((field.landlordShareBushels / field.totalBushels) * 100, 1) : null,
    owned,
    landlordShareBushels: field.landlordShareBushels,
    ownerBushels: roundTo(field.totalBushels - field.landlordShareBushels, 2),
    plantedDate: firstPlanting?.date ?? null,
    variety: firstPlanting && firstPlanting.detail.startsWith('Seed: ') ? firstPlanting.detail.slice(6) : null,
    harvestStart: harvests[0]?.date ?? null,
    harvestEnd: harvests[harvests.length - 1]?.date ?? null,
  };
}

function buildTimeline(activity: LandlordActivityRow[]): OwnerTimelineSection[] {
  return OWNER_TIMELINE_ORDER.map(activityType => {
    const rows = activity
      .filter(a => a.activityType === activityType)
      .sort((a, b) => a.sortKey - b.sortKey);
    const groups: (OwnerTimelineGroup & { startKey: number })[] = [];
    for (const row of rows) {
      const key = dateKey(row.date);
      const detail = row.detail.trim();
      const open = groups.find(g =>
        g.detail.toLowerCase() === detail.toLowerCase() && key - g.startKey <= OWNER_TIMELINE_GROUP_DAYS * DAY_MS);
      if (open) {
        if (!open.fieldNames.includes(row.fieldName)) open.fieldNames.push(row.fieldName);
        open.recordCount += 1;
        open.endDate = row.date;
      } else {
        groups.push({
          activityType,
          startDate: row.date,
          endDate: row.date,
          startKey: key,
          fieldNames: [row.fieldName],
          recordCount: 1,
          detail,
        });
      }
    }
    return {
      activityType,
      groups: groups.map(({ startKey: _startKey, ...group }) => group),
    };
  }).filter(section => section.groups.length > 0);
}

function buildHarvestRollups(activity: LandlordActivityRow[]): OwnerHarvestRollup[] {
  const byFieldCrop = new Map<string, OwnerHarvestRollup & { dayKeys: Set<string> }>();
  for (const row of activity) {
    if (row.activityType !== 'harvest') continue;
    const key = `${row.fieldId}::${cropWord(row.crop)}`;
    const rollup = byFieldCrop.get(key) ?? {
      fieldId: row.fieldId,
      fieldName: row.fieldName,
      crop: row.crop,
      startDate: row.date,
      endDate: row.date,
      days: 0,
      loads: 0,
      bushels: 0,
      dayKeys: new Set<string>(),
    };
    rollup.endDate = row.date;
    rollup.loads += 1;
    rollup.bushels += row.quantity ?? 0;
    rollup.dayKeys.add(row.date);
    byFieldCrop.set(key, rollup);
  }
  return [...byFieldCrop.values()]
    .map(({ dayKeys, ...rollup }) => ({ ...rollup, days: dayKeys.size, bushels: roundTo(rollup.bushels, 2) }))
    .sort((a, b) => cropWord(a.crop).localeCompare(cropWord(b.crop)) || dateKey(a.startDate) - dateKey(b.startDate));
}

export function buildOwnerSummaryLayout(summary: LandlordSummary): OwnerSummaryLayout {
  // Activity is already sorted by work date; keep that order for first/last lookups.
  const activity = [...summary.activity].sort((a, b) => a.sortKey - b.sortKey);

  const grainFields = summary.fields.filter(f => f.totalBushels > 0 && cropWord(f.crop) !== HAY);
  const grainSections: OwnerGrainSection[] = summary.cropTotals
    .filter(total => total.totalBushels > 0 && cropWord(total.crop) !== HAY)
    .map(total => {
      const rows = grainFields
        // Exact crop key, matching how cropTotals grouped these rows.
        .filter(f => cropWord(f.crop) === cropWord(total.crop))
        .map(f => buildGrainRow(f, activity, grainFields.filter(g => g.fieldId === f.fieldId).length))
        .sort((a, b) => a.fieldName.localeCompare(b.fieldName));
      return {
        crop: total.crop,
        rows,
        total: {
          ...total,
          sharePercent: total.totalBushels > 0 ? roundTo((total.landlordShareBushels / total.totalBushels) * 100, 1) : null,
          ownerBushels: roundTo(total.totalBushels - total.landlordShareBushels, 2),
        },
      };
    });

  const hayRows: OwnerHayRow[] = summary.fields
    .filter(f => f.totalBales > 0)
    .map(f => {
      const cuts = activity.filter(a => a.activityType === 'hay' && a.fieldId === f.fieldId);
      return {
        fieldId: f.fieldId,
        fieldName: f.fieldName,
        acres: f.acres,
        cuttings: cuts.length,
        lastCutDate: cuts[cuts.length - 1]?.date ?? null,
        totalBales: f.totalBales,
        balesPerAcre: f.acres > 0 ? roundTo(f.totalBales / f.acres, 1) : null,
      };
    })
    .sort((a, b) => a.fieldName.localeCompare(b.fieldName));
  const hayAcres = roundTo(hayRows.reduce((sum, r) => sum + r.acres, 0), 2);
  const hayBales = hayRows.reduce((sum, r) => sum + r.totalBales, 0);
  const hayTotal = hayRows.length > 0
    ? {
      acres: hayAcres,
      cuttings: hayRows.reduce((sum, r) => sum + r.cuttings, 0),
      totalBales: hayBales,
      balesPerAcre: hayAcres > 0 ? roundTo(hayBales / hayAcres, 1) : null,
    }
    : null;

  // A field with any grain or hay row is not idle, even if another row is empty.
  const producingIds = new Set(summary.fields.filter(f => f.totalBushels > 0 || f.totalBales > 0).map(f => f.fieldId));
  const idleSeen = new Set<string>();
  const idleRows: OwnerIdleRow[] = [];
  for (const f of summary.fields) {
    if (producingIds.has(f.fieldId) || idleSeen.has(f.fieldId)) continue;
    idleSeen.add(f.fieldId);
    idleRows.push({ fieldId: f.fieldId, fieldName: f.fieldName, acres: f.acres });
  }
  idleRows.sort((a, b) => a.fieldName.localeCompare(b.fieldName));

  const harvestRows = activity.filter(a => a.activityType === 'harvest');
  const latest = harvestRows.reduce<LandlordActivityRow | null>(
    (newest, row) => (!newest || row.sortKey >= newest.sortKey ? row : newest),
    null,
  );

  return {
    grainSections,
    hayRows,
    hayTotal,
    idleRows,
    idleAcres: roundTo(idleRows.reduce((sum, r) => sum + r.acres, 0), 2),
    timeline: buildTimeline(activity),
    harvestRollups: buildHarvestRollups(activity),
    latestHarvestDate: latest?.date ?? null,
  };
}

/** "MM/DD/YYYY" or "MM/DD/YYYY – MM/DD/YYYY". */
export function formatOwnerDateRange(start: string | null, end: string | null): string {
  if (!start) return '—';
  if (!end || end === start) return start;
  return `${start} – ${end}`;
}
