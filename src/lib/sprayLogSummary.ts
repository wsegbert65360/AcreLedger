import type { SprayRecord } from '@/types/farm';
import { calculateTotalAmount } from '@/utils/unitConversion';
import { cleanName } from '@/utils/text';
import { areaForProductTotal } from './sprayExportFormatters';

/**
 * Report-only helpers for the spray log PDF: the summary page, review flags,
 * and display clean-up. Nothing here changes stored records; every value is
 * worked out from the records at export time.
 */

type SprayProduct = NonNullable<SprayRecord['products']>[number];
type Dimension = 'liquid' | 'dry' | 'metricLiquid' | 'metricDry';

/** Size of each total unit in its dimension's base unit (fl oz, oz, mL, g). */
const UNIT_SIZES: Record<string, { dimension: Dimension; size: number }> = {
  'fl oz': { dimension: 'liquid', size: 1 },
  pt: { dimension: 'liquid', size: 16 },
  qt: { dimension: 'liquid', size: 32 },
  gal: { dimension: 'liquid', size: 128 },
  oz: { dimension: 'dry', size: 1 },
  lb: { dimension: 'dry', size: 16 },
  mL: { dimension: 'metricLiquid', size: 1 },
  L: { dimension: 'metricLiquid', size: 1000 },
  g: { dimension: 'metricDry', size: 1 },
  kg: { dimension: 'metricDry', size: 1000 },
};

/** Display unit for a base amount: the largest unit the amount fills. */
const DISPLAY_LADDER: Record<Dimension, string[]> = {
  liquid: ['gal', 'qt', 'pt', 'fl oz'],
  dry: ['lb', 'oz'],
  metricLiquid: ['L', 'mL'],
  metricDry: ['kg', 'g'],
};

export interface BaseAmount {
  dimension: Dimension;
  /** Amount in the dimension's base unit (fl oz, oz, mL or g). */
  value: number;
}

function toBase(value: number, unit: string): BaseAmount | null {
  const known = UNIT_SIZES[unit];
  if (!known || !Number.isFinite(value) || value <= 0) return null;
  return { dimension: known.dimension, value: value * known.size };
}

/** Largest unit in the dimension that the amount reaches at least 1 of. */
export function displayUnitFor(amount: BaseAmount): string {
  const ladder = DISPLAY_LADDER[amount.dimension];
  return ladder.find(unit => amount.value >= UNIT_SIZES[unit].size) ?? ladder[ladder.length - 1];
}

export function formatBaseAmount(amount: BaseAmount, unit = displayUnitFor(amount)): string {
  const size = UNIT_SIZES[unit];
  if (!size || size.dimension !== amount.dimension) return '—';
  const value = amount.value / size.size;
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
}

/**
 * A product's total for one record, in base units. Worked out from the rate
 * and treated area the same way the product table does; a stored total is the
 * fallback for legacy rows with no usable rate.
 */
export function productBaseAmount(
  product: SprayProduct,
  treatedArea: number | null | undefined,
  treatedAreaUnit: string | undefined,
  profile?: string | null,
): BaseAmount | null {
  const rate = typeof product.rate === 'number' ? product.rate : parseFloat(product.rate || '');
  const area = areaForProductTotal(treatedArea, treatedAreaUnit, product.rateUnit, profile);
  if (Number.isFinite(rate) && rate > 0 && area != null && Number.isFinite(area) && area > 0) {
    const { value, unit } = calculateTotalAmount(rate, area, product.rateUnit || '');
    return toBase(value, unit);
  }
  const stored = parseFloat(product.totalProductAmount || '');
  return product.totalProductUnit ? toBase(stored, product.totalProductUnit) : null;
}

/** Spellings that name the same product. Keys are productKey() output. */
const PRODUCT_ALIASES: Record<string, string> = {
  ammoniasulfate: 'ammoniumsulfate',
  ams: 'ammoniumsulfate',
};

/** Groups product names that differ only by case, spacing or punctuation. */
export function productKey(name: string | undefined): string {
  const key = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRODUCT_ALIASES[key] ?? key;
}

/**
 * The spelling used most often. Ties go to the longer spelling (so a plural
 * crop name wins), then to the first seen.
 */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  let best = values[0] ?? '';
  counts.forEach((count, value) => {
    const bestCount = counts.get(best) ?? 0;
    if (count > bestCount || (count === bestCount && value.length > best.length)) best = value;
  });
  return best;
}

/** Capitalizes words typed all in lower case: "william egbert" → "William Egbert". */
export function displayPersonName(name: string | undefined | null): string {
  if (!name) return '';
  return name.trim().replace(/\b([a-z])([a-z'-]*)\b/g, (_match, first: string, rest: string) => first.toUpperCase() + rest);
}

/** EPA/APVMA number for display; "none", "n/a" and blanks read the same way. */
export function displayRegNumber(value: string | undefined | null): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '-';
  if (/^(none|n\/?a|na)$/i.test(trimmed)) return 'None';
  return trimmed;
}

function cropKey(crop: string): string {
  return crop.trim().toLowerCase().replace(/s$/, '');
}

/**
 * One spelling per crop for the whole report, so "Soybean" and "Soybeans"
 * print the same. The most-used spelling wins, first letter capitalized.
 */
export function buildCropNames(records: SprayRecord[]): (crop: string | undefined) => string {
  const variants = new Map<string, string[]>();
  records.forEach(record => {
    const crop = record.cropOrSiteTreated?.trim();
    if (!crop) return;
    const key = cropKey(crop);
    variants.set(key, [...(variants.get(key) ?? []), crop]);
  });
  const chosen = new Map<string, string>();
  variants.forEach((list, key) => {
    const best = mostCommon(list);
    chosen.set(key, best.charAt(0).toUpperCase() + best.slice(1));
  });
  return (crop) => {
    const trimmed = crop?.trim();
    if (!trimmed) return '';
    return chosen.get(cropKey(trimmed)) ?? trimmed;
  };
}

export interface RecordArea {
  area: number | null | undefined;
  unit: string;
}

export interface ProductTotalRow {
  key: string;
  name: string;
  regNumbers: string[];
  uses: number;
  total: BaseAmount | null;
  /** Unit every record's total for this product is printed in. */
  displayUnit: string | null;
}

export interface CropRow {
  crop: string;
  applications: number;
  fields: number;
  acres: number;
}

export interface FieldRow {
  field: string;
  crops: string[];
  acres: number | null;
  passes: number;
  dates: string[];
}

export interface SprayLogSummary {
  products: ProductTotalRow[];
  crops: CropRow[];
  fields: FieldRow[];
}

/**
 * Totals for the summary page. `areaOf` returns the treated area the record
 * table prints, so the summary and the records always agree.
 */
export function buildSprayLogSummary(
  records: SprayRecord[],
  areaOf: (record: SprayRecord) => RecordArea,
  areaInReportUnit: (record: SprayRecord) => number,
  profile?: string | null,
): SprayLogSummary {
  const cropName = buildCropNames(records);
  const products = new Map<string, { names: string[]; regs: Set<string>; uses: number; total: BaseAmount | null; mixed: boolean }>();
  const crops = new Map<string, { applications: number; fields: Set<string>; acres: number }>();
  const fields = new Map<string, FieldRow>();

  records.forEach(record => {
    const { area, unit } = areaOf(record);
    const reportArea = areaInReportUnit(record);
    const crop = cropName(record.cropOrSiteTreated) || 'Not recorded';
    const fieldName = cleanName(record.fieldName || '') || 'Unnamed field';
    const fieldKey = record.fieldId || fieldName.toLowerCase();

    const cropRow = crops.get(crop) ?? { applications: 0, fields: new Set<string>(), acres: 0 };
    cropRow.applications += 1;
    cropRow.fields.add(fieldKey);
    cropRow.acres += reportArea;
    crops.set(crop, cropRow);

    const fieldRow = fields.get(fieldKey) ?? { field: fieldName, crops: [], acres: null, passes: 0, dates: [] };
    fieldRow.passes += 1;
    if (!fieldRow.crops.includes(crop)) fieldRow.crops.push(crop);
    if (reportArea > 0) fieldRow.acres = reportArea;
    if (record.sprayDate) fieldRow.dates.push(record.sprayDate);
    fields.set(fieldKey, fieldRow);

    (record.products ?? []).forEach(product => {
      const key = productKey(product.product);
      if (!key) return;
      const row = products.get(key) ?? { names: [], regs: new Set<string>(), uses: 0, total: null, mixed: false };
      row.names.push(product.product.trim());
      const reg = displayRegNumber(product.epaRegNumber);
      if (reg !== '-' && reg !== 'None') row.regs.add(reg);
      row.uses += 1;
      const amount = productBaseAmount(product, area, unit, profile);
      if (amount) {
        if (!row.total) row.total = { ...amount };
        else if (row.total.dimension === amount.dimension) row.total.value += amount.value;
        else row.mixed = true;
      }
      products.set(key, row);
    });
  });

  return {
    products: [...products.entries()]
      .map(([key, row]) => ({
        key,
        name: mostCommon(row.names),
        regNumbers: [...row.regs],
        uses: row.uses,
        total: row.mixed ? null : row.total,
        displayUnit: !row.mixed && row.total ? displayUnitFor(row.total) : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    crops: [...crops.entries()]
      .map(([crop, row]) => ({ crop, applications: row.applications, fields: row.fields.size, acres: row.acres }))
      .sort((a, b) => a.crop.localeCompare(b.crop)),
    fields: [...fields.values()].sort((a, b) => a.field.localeCompare(b.field)),
  };
}

function minutesOf(time?: string | null): number | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function mixSignature(record: SprayRecord): string {
  return (record.products ?? [])
    .map(product => `${productKey(product.product)}@${String(product.rate ?? '').trim()}${product.rateUnit ?? ''}`)
    .sort()
    .join('|');
}

export interface ReviewFlagOptions {
  /** Formats a wind speed stored in MPH for this report (MPH or km/h). */
  formatWind: (mph: number) => string;
  formatDate: (iso?: string | null) => string;
  formatTime: (time?: string | null) => string;
  rateLabel: (unit: string) => string;
}

const NIGHT_START = 21 * 60;
const NIGHT_END = 5 * 60;
const LOW_WIND_MPH = 2;
const HIGH_WIND_MPH = 10;
const RATE_OUTLIER_SHARE = 0.4;
const RATE_OUTLIER_MIN_USES = 4;
const SAME_WEATHER_GAP_MINUTES = 120;

/**
 * Things worth a second look, worked out from the records only. These are
 * prompts for the farmer, not compliance failures, and never change a record.
 * Records must be in chronological order.
 */
export function buildReviewFlags(records: SprayRecord[], options: ReviewFlagOptions): Map<string, string[]> {
  const flags = new Map<string, string[]>();
  const add = (record: SprayRecord, message: string) => {
    flags.set(record.id, [...(flags.get(record.id) ?? []), message]);
  };

  // Usual rate per product and rate unit, from every use in the report.
  const rates = new Map<string, number[]>();
  records.forEach(record => (record.products ?? []).forEach(product => {
    const rate = parseFloat(String(product.rate ?? ''));
    if (!Number.isFinite(rate) || rate <= 0 || !product.rateUnit) return;
    const key = `${productKey(product.product)}|${product.rateUnit}`;
    rates.set(key, [...(rates.get(key) ?? []), rate]);
  }));
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  records.forEach((record, index) => {
    // A rate used only once that is far from the product's usual rate.
    (record.products ?? []).forEach(product => {
      const rate = parseFloat(String(product.rate ?? ''));
      if (!Number.isFinite(rate) || rate <= 0 || !product.rateUnit) return;
      const all = rates.get(`${productKey(product.product)}|${product.rateUnit}`) ?? [];
      if (all.length < RATE_OUTLIER_MIN_USES) return;
      if (all.filter(value => value === rate).length > 1) return;
      const usual = median(all);
      if (Math.abs(rate - usual) / usual <= RATE_OUTLIER_SHARE) return;
      const unit = options.rateLabel(product.rateUnit);
      add(record, `${product.product.trim()} rate ${rate} ${unit} differs from the usual ${usual} ${unit}`);
    });

    // Spray time at night.
    const start = minutesOf(record.startTime);
    const end = minutesOf(record.endTime);
    const atNight = (minutes: number | null) => minutes != null && (minutes >= NIGHT_START || minutes < NIGHT_END);
    if (atNight(start) || atNight(end)) {
      add(record, `Sprayed at night (${options.formatTime(record.startTime)} to ${options.formatTime(record.endTime)})`);
    }

    // Wind outside the usual window.
    if (record.windSpeed != null && Number.isFinite(record.windSpeed)) {
      if (record.windSpeed < LOW_WIND_MPH) {
        add(record, `Wind ${options.formatWind(record.windSpeed)} is very light; check for a temperature inversion`);
      } else if (record.windSpeed > HIGH_WIND_MPH) {
        add(record, `Wind ${options.formatWind(record.windSpeed)} is high; check the label's drift limit`);
      }
    }

    // Same tank mix on the same field as an earlier record.
    const signature = mixSignature(record);
    if (signature) {
      const fieldKey = record.fieldId || cleanName(record.fieldName || '').toLowerCase();
      const earlier = records.slice(0, index).reverse().find(other =>
        (other.fieldId || cleanName(other.fieldName || '').toLowerCase()) === fieldKey && mixSignature(other) === signature
      );
      if (earlier) {
        add(record, `Same products and rates as the ${options.formatDate(earlier.sprayDate)} record on this field; confirm it is a separate pass`);
      }
    }

    // The same weather reading as a pass hours earlier the same day.
    if (start != null && record.temperature != null && record.relativeHumidity != null) {
      const match = records.slice(0, index).find(other => {
        const otherStart = minutesOf(other.startTime);
        return other.sprayDate === record.sprayDate
          && otherStart != null
          && Math.abs(start - otherStart) >= SAME_WEATHER_GAP_MINUTES
          && other.temperature === record.temperature
          && other.relativeHumidity === record.relativeHumidity;
      });
      if (match) {
        add(record, `Same temperature and humidity as ${cleanName(match.fieldName || '')} at ${options.formatTime(match.startTime)}; check the weather was recorded for this pass`);
      }
    }
  });

  return flags;
}
