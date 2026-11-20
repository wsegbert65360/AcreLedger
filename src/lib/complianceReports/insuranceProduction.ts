import { allocateProduction } from '@/lib/county/allocation';
import { countyLabel } from '@/lib/county/resolve';
import type { CountyShare } from '@/lib/county/types';
import type { Field, HarvestRecord, PlantRecord } from '@/types/farm';
import { toLocalIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { COUNTY_UNKNOWN_LABEL, type ReportCountyContext } from './fsaReports';

/**
 * Crop insurance production worksheet (APH production report support).
 *
 * Enterprise units: one unit per crop per county. Production is 100% of all
 * shares (landlord share included). Yield = production / planted acres, as in
 * the Basic Provisions. Bushels are taken as entered (field-entered, not
 * shrunk); moisture is shown for information only. Pure: no PDF, no I/O.
 */

export type InsurancePractice = 'Irrigated' | 'Non-Irrigated';

export interface InsuranceLoad {
  id: string;
  date: string;
  fieldId: string;
  fieldName: string;
  crop: string;
  farmNumber: string;
  tractNumber: string;
  practice: InsurancePractice;
  disposition: 'Sold' | 'Stored';
  /** Scale ticket for town loads, bin name for bin loads. */
  reference: string;
  moisturePercent?: number;
  /** Bushels in this unit (a share of the load when the field spans counties). */
  bushels: number;
  /** The whole load before any county split. */
  loadBushels: number;
  estimated: boolean;
}

export interface InsuranceFarmBreakdown {
  farmNumber: string;
  tracts: string[];
  plantedAcres: number;
  production: number;
  yield: number | null;
}

export interface InsurancePracticeTotal {
  practice: InsurancePractice;
  plantedAcres: number;
  harvestedAcres: number;
  production: number;
  yield: number | null;
}

export interface InsuranceUnit {
  key: string;
  county: string;
  countyFips: string | null;
  crop: string;
  plantedAcres: number;
  harvestedAcres: number;
  preventedAcres: number;
  production: number;
  soldBushels: number;
  storedBushels: number;
  yield: number | null;
  /** Load-weighted average moisture as entered; information only. */
  averageMoisture: number | null;
  /** Some acres or bushels are divided between counties by mapped share. */
  estimated: boolean;
  types: string[];
  practices: InsurancePracticeTotal[];
  farms: InsuranceFarmBreakdown[];
  loads: InsuranceLoad[];
}

export interface InsuranceIssue {
  id: string;
  severity: 'error' | 'warning';
  kind: 'harvest-no-planting' | 'harvest-no-crop' | 'not-harvested' | 'failed-appraisal' | 'county-unknown' | 'bin-mixed-units';
  message: string;
  fieldId?: string;
  recordId?: string;
}

export interface InsuranceProductionReport {
  cropYear: number;
  units: InsuranceUnit[];
  issues: InsuranceIssue[];
}

const UNKNOWN_SHARES: CountyShare[] = [{ countyFips: null, countyName: null, stateAbbr: null, fraction: 1 }];

function cropKey(crop: string | undefined): string {
  return (crop || '').trim().toLowerCase();
}

function practiceOf(plant: PlantRecord | undefined, field: Field | undefined): InsurancePractice {
  return (plant?.irrigationPractice || field?.irrigationPractice) === 'Irrigated' ? 'Irrigated' : 'Non-Irrigated';
}

function isPlantedForInsurance(plant: PlantRecord): boolean {
  const status = plant.cropStatus || 'Planted';
  return status === 'Planted' || status === 'Failed';
}

function safeYield(production: number, acres: number): number | null {
  return acres > 0 ? roundTo(production / acres, 1) : null;
}

interface UnitAccumulator {
  unit: Omit<InsuranceUnit, 'practices' | 'farms' | 'types' | 'averageMoisture' | 'yield'>;
  types: Set<string>;
  practices: Map<InsurancePractice, { plantedAcres: number; harvestedAcres: number; production: number }>;
  farms: Map<string, { tracts: Set<string>; plantedAcres: number; production: number }>;
  moistureWeight: number;
  moistureBushels: number;
}

/**
 * Builds the worksheet for one crop year. `plantRecords` and `harvestRecords`
 * must already be the active (non-deleted) records of that season.
 */
export function buildInsuranceProductionReport({
  plantRecords,
  harvestRecords,
  fields,
  counties,
  binNames = new Map(),
  cropYear,
}: {
  plantRecords: PlantRecord[];
  harvestRecords: HarvestRecord[];
  fields: Field[];
  counties?: ReportCountyContext;
  binNames?: Map<string, string>;
  cropYear: number;
}): InsuranceProductionReport {
  const fieldById = new Map(fields.map(field => [field.id, field]));
  const issues: InsuranceIssue[] = [];
  const units = new Map<string, UnitAccumulator>();
  const countyWarned = new Set<string>();

  const sharesFor = (fieldId: string): { shares: CountyShare[]; estimated: boolean } => {
    const resolved = counties?.sharesForField(fieldId);
    const shares = resolved?.shares?.length ? resolved.shares : UNKNOWN_SHARES;
    if (shares.every(share => !share.countyName) && !countyWarned.has(fieldId)) {
      countyWarned.add(fieldId);
      const name = fieldById.get(fieldId)?.name || 'A field';
      issues.push({
        id: `county-${fieldId}`, severity: 'warning', kind: 'county-unknown', fieldId,
        message: `${name} has no identified county; its acres and bushels are listed under ${COUNTY_UNKNOWN_LABEL}.`,
      });
    }
    return { shares, estimated: Boolean(resolved?.estimated) || shares.length > 1 };
  };

  const unitFor = (share: CountyShare, crop: string): UnitAccumulator => {
    const county = share.countyName ? countyLabel(share) : COUNTY_UNKNOWN_LABEL;
    const key = `${share.countyFips ?? 'unknown'}|${cropKey(crop)}`;
    let acc = units.get(key);
    if (!acc) {
      acc = {
        unit: {
          key, county, countyFips: share.countyFips, crop,
          plantedAcres: 0, harvestedAcres: 0, preventedAcres: 0,
          production: 0, soldBushels: 0, storedBushels: 0, estimated: false, loads: [],
        },
        types: new Set(), practices: new Map(), farms: new Map(),
        moistureWeight: 0, moistureBushels: 0,
      };
      units.set(key, acc);
    }
    return acc;
  };

  const practiceTotals = (acc: UnitAccumulator, practice: InsurancePractice) => {
    let total = acc.practices.get(practice);
    if (!total) {
      total = { plantedAcres: 0, harvestedAcres: 0, production: 0 };
      acc.practices.set(practice, total);
    }
    return total;
  };

  const farmTotals = (acc: UnitAccumulator, farmNumber: string) => {
    let total = acc.farms.get(farmNumber);
    if (!total) {
      total = { tracts: new Set(), plantedAcres: 0, production: 0 };
      acc.farms.set(farmNumber, total);
    }
    return total;
  };

  // Plantings by field + crop, so loads can find their acres and practice.
  const plantingsByFieldCrop = new Map<string, PlantRecord[]>();
  for (const plant of plantRecords) {
    if (!cropKey(plant.crop)) continue;
    const key = `${plant.fieldId}|${cropKey(plant.crop)}`;
    plantingsByFieldCrop.set(key, [...(plantingsByFieldCrop.get(key) || []), plant]);
  }
  const loadsByFieldCrop = new Map<string, HarvestRecord[]>();

  // Resolve each load's crop: the record's crop, else the field's only planted crop.
  const cropsPlantedOnField = (fieldId: string) => [...new Set(plantRecords
    .filter(plant => plant.fieldId === fieldId && isPlantedForInsurance(plant) && cropKey(plant.crop))
    .map(plant => plant.crop!.trim()))];

  for (const load of harvestRecords) {
    let crop = (load.crop || '').trim();
    if (!crop) {
      const planted = cropsPlantedOnField(load.fieldId);
      if (planted.length === 1) crop = planted[0];
    }
    if (!crop) {
      issues.push({
        id: `nocrop-${load.id}`, severity: 'error', kind: 'harvest-no-crop', fieldId: load.fieldId, recordId: load.id,
        message: `${load.fieldName || 'A harvest load'} on ${load.harvestDate || toLocalIsoDate(load.timestamp)} has no crop, so it is not in any unit.`,
      });
      continue;
    }
    const key = `${load.fieldId}|${cropKey(crop)}`;
    loadsByFieldCrop.set(key, [...(loadsByFieldCrop.get(key) || []), { ...load, crop }]);
  }

  // Planted, prevented and harvested acres.
  for (const [key, plantings] of plantingsByFieldCrop) {
    const field = fieldById.get(plantings[0].fieldId);
    const { shares, estimated } = sharesFor(plantings[0].fieldId);
    const harvested = loadsByFieldCrop.has(key);
    const plantedHere = plantings.filter(isPlantedForInsurance);
    const plantedAcres = plantedHere.reduce((sum, plant) => sum + (Number.isFinite(plant.acreage) ? plant.acreage : 0), 0);
    const preventedAcres = plantings
      .filter(plant => plant.cropStatus === 'Prevented Planting')
      .reduce((sum, plant) => sum + (Number.isFinite(plant.acreage) ? plant.acreage : 0), 0);
    const crop = plantings[0].crop!.trim();
    const practice = practiceOf(plantedHere[0] ?? plantings[0], field);
    const farmNumber = (plantings[0].fsaFarmNumber || field?.fsaFarmNumber || '').trim();
    const tractNumber = (plantings[0].fsaTractNumber || field?.fsaTractNumber || '').trim();

    for (const share of shares) {
      const acc = unitFor(share, crop);
      const planted = plantedAcres * share.fraction;
      acc.unit.plantedAcres += planted;
      acc.unit.preventedAcres += preventedAcres * share.fraction;
      if (harvested) acc.unit.harvestedAcres += planted;
      acc.unit.estimated ||= estimated && shares.length > 1;
      plantedHere.forEach(plant => { if (plant.seedVariety?.trim() && plant.seedVariety !== 'N/A') acc.types.add(plant.seedVariety.trim()); });
      const p = practiceTotals(acc, practice);
      p.plantedAcres += planted;
      if (harvested) p.harvestedAcres += planted;
      const farm = farmTotals(acc, farmNumber);
      farm.plantedAcres += planted;
      if (tractNumber) farm.tracts.add(tractNumber);
    }

    const name = field?.name || plantings[0].fieldName;
    if (plantedAcres > 0 && !harvested) {
      issues.push({
        id: `noharvest-${key}`, severity: 'warning', kind: 'not-harvested', fieldId: plantings[0].fieldId,
        message: `${name}: ${crop} was planted but has no harvest loads. Tell your agent; an appraisal may be needed.`,
      });
    }
    if (plantings.some(plant => plant.cropStatus === 'Failed')) {
      issues.push({
        id: `failed-${key}`, severity: 'warning', kind: 'failed-appraisal', fieldId: plantings[0].fieldId,
        message: `${name}: ${crop} is marked failed. Its acres count as planted; appraised production comes from your adjuster.`,
      });
    }
  }

  // Production.
  const binUnits = new Map<string, Set<string>>();
  for (const [key, loads] of loadsByFieldCrop) {
    const fieldId = loads[0].fieldId;
    const field = fieldById.get(fieldId);
    const plantings = plantingsByFieldCrop.get(key);
    const crop = loads[0].crop!;
    if (!plantings?.some(isPlantedForInsurance)) {
      issues.push({
        id: `noplant-${key}`, severity: 'error', kind: 'harvest-no-planting', fieldId,
        message: `${field?.name || loads[0].fieldName}: ${crop} has harvest loads but no planting, so its yield has no acres.`,
      });
    }
    const practice = practiceOf(plantings?.find(isPlantedForInsurance), field);
    const { shares, estimated } = sharesFor(fieldId);

    for (const load of loads) {
      const bushels = Number.isFinite(load.bushels) ? load.bushels : 0;
      const farmNumber = (load.fsaFarmNumber || plantings?.[0]?.fsaFarmNumber || field?.fsaFarmNumber || '').trim();
      const tractNumber = (load.fsaTractNumber || plantings?.[0]?.fsaTractNumber || field?.fsaTractNumber || '').trim();
      const disposition = load.destination === 'bin' ? 'Stored' : 'Sold';
      const reference = load.destination === 'bin'
        ? (load.binId ? binNames.get(load.binId) || 'Bin' : 'Bin')
        : (load.scaleTicketNumber || '').trim();
      const parts = allocateProduction(bushels, shares, { decimals: 2 });

      for (const part of parts) {
        if (part.amount === 0 && parts.length > 1) continue;
        const share = shares.find(s => s.countyFips === part.countyFips) ?? shares[0];
        const acc = unitFor(share, crop);
        acc.unit.production += part.amount;
        if (disposition === 'Sold') acc.unit.soldBushels += part.amount; else acc.unit.storedBushels += part.amount;
        if (Number.isFinite(load.moisturePercent) && load.moisturePercent > 0) {
          acc.moistureWeight += load.moisturePercent * part.amount;
          acc.moistureBushels += part.amount;
        }
        const splitHere = estimated && parts.length > 1;
        acc.unit.estimated ||= splitHere;
        practiceTotals(acc, practice).production += part.amount;
        const farm = farmTotals(acc, farmNumber);
        farm.production += part.amount;
        if (tractNumber) farm.tracts.add(tractNumber);
        acc.unit.loads.push({
          id: load.id,
          date: load.harvestDate || toLocalIsoDate(load.timestamp),
          fieldId,
          fieldName: load.fieldName || field?.name || '',
          crop,
          farmNumber,
          tractNumber,
          practice,
          disposition,
          reference,
          moisturePercent: Number.isFinite(load.moisturePercent) ? load.moisturePercent : undefined,
          bushels: part.amount,
          loadBushels: bushels,
          estimated: splitHere,
        });
      }
      // A load is one physical load: a county split of the same field is not a mixed bin.
      // Count each load once, under the unit with its largest share.
      if (load.destination === 'bin' && load.binId) {
        const main = [...parts].sort((a, b) => b.amount - a.amount)[0];
        const mainShare = shares.find(s => s.countyFips === main?.countyFips) ?? shares[0];
        const set = binUnits.get(load.binId) ?? new Set<string>();
        set.add(unitFor(mainShare, crop).unit.key);
        binUnits.set(load.binId, set);
      }
    }
  }

  for (const [binId, keys] of binUnits) {
    if (keys.size < 2) continue;
    const names = [...keys].map(key => {
      const unit = units.get(key)!.unit;
      return `${unit.crop} ${unit.county}`;
    });
    issues.push({
      id: `bin-${binId}`, severity: 'warning', kind: 'bin-mixed-units',
      message: `${binNames.get(binId) || 'A bin'} holds loads from more than one unit (${names.join(', ')}). Ask your agent about a bin measurement or keep load records by unit.`,
    });
  }

  const unknownLast = (unit: InsuranceUnit) => Number(unit.countyFips == null);
  const result = [...units.values()].map(acc => {
    const u = acc.unit;
    const production = roundTo(u.production, 2);
    const plantedAcres = roundTo(u.plantedAcres, 2);
    return {
      ...u,
      plantedAcres,
      harvestedAcres: roundTo(u.harvestedAcres, 2),
      preventedAcres: roundTo(u.preventedAcres, 2),
      production,
      soldBushels: roundTo(u.soldBushels, 2),
      storedBushels: roundTo(u.storedBushels, 2),
      // No loads at all: leave yield blank rather than print 0 (the agent decides on appraisal).
      yield: u.loads.length > 0 ? safeYield(production, plantedAcres) : null,
      averageMoisture: acc.moistureBushels > 0 ? roundTo(acc.moistureWeight / acc.moistureBushels, 1) : null,
      types: [...acc.types].sort(),
      practices: [...acc.practices.entries()]
        .map(([practice, t]) => ({
          practice,
          plantedAcres: roundTo(t.plantedAcres, 2),
          harvestedAcres: roundTo(t.harvestedAcres, 2),
          production: roundTo(t.production, 2),
          yield: t.harvestedAcres > 0 ? safeYield(t.production, t.plantedAcres) : null,
        }))
        .sort((a, b) => a.practice.localeCompare(b.practice)),
      farms: [...acc.farms.entries()]
        .map(([farmNumber, t]) => ({
          farmNumber,
          tracts: [...t.tracts].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
          plantedAcres: roundTo(t.plantedAcres, 2),
          production: roundTo(t.production, 2),
          yield: t.production > 0 ? safeYield(t.production, t.plantedAcres) : null,
        }))
        .sort((a, b) => Number(!a.farmNumber) - Number(!b.farmNumber)
          || a.farmNumber.localeCompare(b.farmNumber, undefined, { numeric: true })),
      loads: [...u.loads].sort((a, b) => a.date.localeCompare(b.date) || a.fieldName.localeCompare(b.fieldName)),
    } satisfies InsuranceUnit;
  }).sort((a, b) => unknownLast(a) - unknownLast(b)
    || a.county.localeCompare(b.county)
    || a.crop.localeCompare(b.crop));

  return { cropYear, units: result, issues };
}
