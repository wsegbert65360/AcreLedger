import { roundTo } from '@/utils/numbers';
import type { Fsa578ReportRow, FsaFallCountyContext } from './fsaReports';

/**
 * Physical county label(s) for a field from saved county assignments, e.g.
 * "Henry, MO" or "Henry, MO 60% / Benton, MO 40%". Empty when unknown.
 */
export function fsa578CountyLabel(fieldId: string, counties?: FsaFallCountyContext): string {
  if (!counties) return '';
  const shares = counties.sharesForField(fieldId).shares.filter(share => share.countyName);
  if (shares.length === 0) return '';
  const name = (share: typeof shares[number]) => [share.countyName, share.stateAbbr].filter(Boolean).join(', ');
  if (shares.length === 1) return name(shares[0]);
  return [...shares]
    .sort((a, b) => b.fraction - a.fraction)
    .map(share => `${name(share)} ${Math.round(share.fraction * 100)}%`)
    .join(' / ');
}

/**
 * Same word match as `isEstablishedForageLabel` in fsaReports.ts. Kept local so
 * fsaReports.ts (the CSV builder) can import this module without a cycle.
 */
function isEstablishedForageLabel(...values: Array<string | undefined>): boolean {
  return values.some(value => /\bhay\b|\bpasture\b/.test(value?.trim().toLowerCase() || ''));
}

/**
 * View-model that lays the FSA-578 worksheet out like the manual
 * "Report of Acreage" form (FSA-578 Manual 08-22-19): one sheet per FSA farm,
 * boxes 1-11 in the header, one line per CLU and producer key (boxes 12-19),
 * crop columns for box 17, and box 20 totals per crop column.
 *
 * Pure: no jsPDF. The PDF and CSV both read these codes so they describe the
 * same facts.
 */

/** Box 17 crop columns that fit across landscape Letter. */
export const FSA578_MAX_CROP_COLUMNS = 8;
export const FSA578_OTHER_CROP_COLUMN = 'OTHER';
export const FSA578_UNASSIGNED_FARM = 'UNASSIGNED';

export interface Fsa578FormProducer {
  key: number;
  name: string;
}

export interface Fsa578FormLine {
  rowId: string;
  /** False for the extra producer-key line of a shared CLU. */
  primary: boolean;
  tractNumber: string;
  fieldNumber: string;
  /** Box 14 first line: crop, type/variety and intended-use code. */
  cropOrLandUse: string;
  /** Box 14 second line: field name and planting date. */
  detail: string;
  practice: string;
  status: string;
  cropColumn: number;
  acres: number | null;
  key: number;
  share: string;
}

export interface Fsa578FormSheet {
  farmNumber: string;
  unassigned: boolean;
  farmlandAcres: number;
  croplandAcres: number;
  otherFarms: string[];
  producers: Fsa578FormProducer[];
  cropColumns: string[];
  lines: Fsa578FormLine[];
  /** Box 20, one total per crop column. */
  totals: number[];
  /** Box 23 remarks: notes, planting patterns and assignment warnings. */
  remarks: string[];
  /** Physical counties of this farm's cropland ("Henry, MO"), most acres first. Empty when unknown. */
  counties: string[];
}

/** Box 15 practice: I irrigated, N non-irrigated. */
export function fsaPracticeCode(row: Pick<Fsa578ReportRow, 'irrigationCode'>): string {
  if (row.irrigationCode === 'IR') return 'I';
  if (row.irrigationCode === 'NI') return 'N';
  return '';
}

/**
 * Box 16 crop status. A code the farmer picked on the planting wins;
 * otherwise it is derived from the recorded plant status and crop sequence.
 * S, R, E and IF/IP/SF are only available as a manual choice.
 */
export function fsaStatusCode(row: Pick<Fsa578ReportRow, 'cropStatus' | 'cropSequence' | 'date' | 'crop' | 'intendedUse' | 'fsaStatusOverride'>): string {
  if (row.fsaStatusOverride) return row.fsaStatusOverride;
  return derivedFsaStatusCode(row);
}

/** Box 16 code derived from records only, ignoring any manual choice. */
export function derivedFsaStatusCode(row: Pick<Fsa578ReportRow, 'cropStatus' | 'cropSequence' | 'date' | 'crop' | 'intendedUse'>): string {
  const second = row.cropSequence === 'Second Crop';
  switch (row.cropStatus) {
    case 'Prevented Planting':
      return second ? 'DP' : 'P';
    case 'Failed':
      return second ? 'DF' : 'F';
    case 'Volunteer':
      return 'V';
    case 'Planted':
    case 'Cover Crop':
      return second ? 'D' : 'I';
    default:
      if (row.date || isEstablishedForageLabel(row.crop, row.intendedUse)) return second ? 'D' : 'I';
      return '';
  }
}

const INTENDED_USE_CODES: Array<[RegExp, string]> = [
  [/silage/i, 'SL'],
  [/graz|pasture/i, 'GZ'],
  [/hay|forage/i, 'FG'],
  [/seed/i, 'SD'],
  [/green\s*manure/i, 'GM'],
  [/left\s*standing/i, 'LS'],
  [/grain/i, 'GR'],
];

/** FSA intended-use code (GR, SL, FG, GZ, SD, GM, LS); '' when not recognised. */
export function fsaIntendedUseCode(intendedUse: string | undefined): string {
  const value = intendedUse?.trim();
  if (!value) return '';
  if (/^[A-Z]{2}$/.test(value)) return value;
  return INTENDED_USE_CODES.find(([pattern]) => pattern.test(value))?.[1] ?? '';
}

function shareNumber(share: string): number | null {
  const value = Number.parseFloat(share.replace('%', ''));
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

function formatShare(value: number): string {
  return roundTo(value, 2).toFixed(2);
}

function compareNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

function cluKey(row: Fsa578ReportRow): string {
  return [row.tractNumber.trim(), row.fieldNumber.trim() || `field:${row.fieldName.trim()}`].join('|');
}

function uniqueCluAcres(rows: Fsa578ReportRow[]): number {
  const acres = new Map<string, number>();
  rows.forEach(row => acres.set(cluKey(row), row.cluAcres ?? row.acreage));
  return roundTo([...acres.values()].reduce((sum, value) => sum + value, 0), 2);
}

function cropLabel(row: Fsa578ReportRow): string {
  return row.crop.trim().toUpperCase() || '-';
}

function formatPlanted(date: string): string {
  // MM-DD-YYYY like the form's date boxes; the year matters for fall-seeded crops.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match ? `planted ${match[2]}-${match[3]}-${match[1]}` : '';
}

function sheetCounties(cropland: Fsa578ReportRow[], counties?: FsaFallCountyContext): string[] {
  if (!counties) return [];
  const acresByCounty = new Map<string, number>();
  const seenFields = new Set<string>();
  cropland.forEach(row => {
    if (seenFields.has(row.fieldId)) return;
    seenFields.add(row.fieldId);
    counties.sharesForField(row.fieldId).shares.forEach(share => {
      if (!share.countyName) return;
      const label = [share.countyName, share.stateAbbr].filter(Boolean).join(', ');
      acresByCounty.set(label, (acresByCounty.get(label) || 0) + Math.max(row.acreage, 0.0001) * share.fraction);
    });
  });
  return [...acresByCounty.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
}

function buildSheet(farmNumber: string, rows: Fsa578ReportRow[], allFarms: string[], counties?: FsaFallCountyContext): Fsa578FormSheet {
  const unassigned = !farmNumber;
  const cropland = rows.filter(row => row.landUse === 'Cropland');

  const crops = [...new Set(cropland.map(cropLabel))].sort();
  const cropColumns = crops.length > FSA578_MAX_CROP_COLUMNS
    ? [...crops.slice(0, FSA578_MAX_CROP_COLUMNS - 1), FSA578_OTHER_CROP_COLUMN]
    : crops;
  const columnFor = (row: Fsa578ReportRow) => {
    const index = cropColumns.indexOf(cropLabel(row));
    return index >= 0 ? index : cropColumns.length - 1;
  };

  const producers: Fsa578FormProducer[] = [{ key: 1, name: '' }];
  const keyFor = (name: string): number => {
    const existing = producers.find(producer => producer.key > 1 && producer.name === name);
    if (existing) return existing.key;
    const key = producers.length + 1;
    producers.push({ key, name });
    return key;
  };

  const lines: Fsa578FormLine[] = [];
  const totals = cropColumns.map(() => 0);
  const remarks: string[] = [];

  cropland.forEach(row => {
    const column = columnFor(row);
    const useCode = fsaIntendedUseCode(row.intendedUse);
    const use = useCode || row.intendedUse.trim();
    const cropText = [row.crop.trim() || '-', row.seedVariety.trim()].filter(Boolean).join(' ');
    const operatorShare = shareNumber(row.producerShare);

    lines.push({
      rowId: row.id,
      primary: true,
      tractNumber: row.tractNumber.trim(),
      fieldNumber: row.fieldNumber.trim(),
      cropOrLandUse: use ? `${cropText} / ${use}` : cropText,
      detail: [row.fieldName.trim(), formatPlanted(row.date)].filter(Boolean).join(' - '),
      practice: fsaPracticeCode(row),
      status: fsaStatusCode(row),
      cropColumn: column,
      acres: row.acreage,
      key: 1,
      share: operatorShare == null ? '' : formatShare(operatorShare),
    });
    totals[column] += row.acreage;

    if (operatorShare != null && operatorShare < 100) {
      const landlord = row.landlordName?.trim() || 'Other producer (name not recorded)';
      lines.push({
        rowId: row.id,
        primary: false,
        tractNumber: '',
        fieldNumber: '',
        cropOrLandUse: '',
        detail: '',
        practice: '',
        status: '',
        cropColumn: column,
        acres: null,
        key: keyFor(landlord),
        share: formatShare(100 - operatorShare),
      });
    }

    const where = `${row.fieldName.trim() || 'Field'} (CLU ${row.fieldNumber.trim() || '-'})`;
    if (row.plantingPattern?.trim()) remarks.push(`${where}: ${row.plantingPattern.trim()}`);
    if (row.notes?.trim()) remarks.push(`${where}: ${row.notes.trim()}`);
    if (row.assignmentWarning?.trim()) remarks.push(`${where}: ${row.assignmentWarning.trim()}`);
  });

  return {
    farmNumber: unassigned ? FSA578_UNASSIGNED_FARM : farmNumber,
    unassigned,
    farmlandAcres: uniqueCluAcres(rows),
    croplandAcres: uniqueCluAcres(cropland),
    otherFarms: allFarms.filter(other => other !== farmNumber),
    producers,
    cropColumns,
    lines,
    totals: totals.map(total => roundTo(total, 2)),
    remarks,
    counties: sheetCounties(cropland, counties),
  };
}

/**
 * One sheet per FSA farm number, numeric order, with fields that have no FSA
 * farm number in a final UNASSIGNED sheet. Sheets with no cropland rows are
 * skipped (their CLUs stay in Section 4).
 */
export function buildFsa578FormSheets(rows: Fsa578ReportRow[], counties?: FsaFallCountyContext): Fsa578FormSheet[] {
  const byFarm = new Map<string, Fsa578ReportRow[]>();
  rows.forEach(row => {
    const farm = row.farmNumber.trim();
    byFarm.set(farm, [...(byFarm.get(farm) || []), row]);
  });

  const farms = [...byFarm.keys()].filter(Boolean).sort(compareNumbers);
  const ordered = byFarm.has('') ? [...farms, ''] : farms;

  return ordered
    .map(farm => buildSheet(farm, byFarm.get(farm) || [], farms, counties))
    .filter(sheet => sheet.lines.length > 0);
}
