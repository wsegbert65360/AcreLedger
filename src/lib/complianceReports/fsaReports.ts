import { Capacitor } from '@capacitor/core';

import { getLandlordSplitPercent } from '@/lib/cropShare';
import { farmNameForCsv } from '@/lib/farmDisplayName';
import { effectiveTreatedAreaUnit, normalizeAreaForRate, normalizeTreatedArea } from '@/lib/sprayExportFormatters';
import { native } from '@/lib/native';
import { parseTractKeys } from '@/lib/tractLookup';
import { getDisplayFieldAcres, getEffectiveSprayTreatedAcres } from '@/lib/fieldAcreage';
import { SprayRecord, Field, PlantRecord, FertilizerApplication, HarvestRecord } from '../../types/farm';
import type { FsaStatusCode } from '../../types/farm';
import type { FieldCluAssignment, FsaTractImport } from '../../types/fsaTract';
import { getWorkDateMs, toLocalIsoDate } from '../../utils/dates';
import { sanitizeCsvValue } from '../../utils/csv';
import { roundTo } from '../../utils/numbers';
import { formatSprayProductTotal } from '../../utils/unitConversion';
import type { FieldCountyShares } from '../county/types';
import { ACRELEDGER_CSV_LINE } from './pdfBranding';
import { fsa578CountyLabel, fsaIntendedUseCode, fsaPracticeCode, fsaStatusCode } from './fsa578FormLayout';

/** Label for production whose physical county is not known. It is still counted in every total. */
export const COUNTY_UNKNOWN_LABEL = 'County unknown';

/**
 * Where each field's production is physically grown. Supplied by the app from saved county
 * assignments; report code never measures geometry itself and never reads county from notes.
 */
export interface ReportCountyContext {
    sharesForField: (fieldId: string) => FieldCountyShares;
}

export interface Fsa578ReportRow {
    id: string;
    fieldId: string;
    date: string;
    fieldName: string;
    farmNumber: string;
    tractNumber: string;
    fieldNumber: string;
    acreage: number;
    cluAcres?: number;
    assignmentWarning?: string;
    crop: string;
    seedVariety: string;
    intendedUse: string;
    irrigationCode: string;
    producerShare: string;
    /** Field-level landlord; printed as producer key 2 on the FSA-578 layout. */
    landlordName?: string;
    landUse: 'Cropland' | 'Non-cropland';
    cropStatus?: 'Planted' | 'Prevented Planting' | 'Failed' | 'Volunteer' | 'Cover Crop';
    cropSequence?: 'First Crop' | 'Second Crop';
    /** Manual FSA-578 box 16 code from the planting; wins over the derived code. */
    fsaStatusOverride?: FsaStatusCode;
    organicStatus?: 'Conventional' | 'Organic' | 'Transitioning';
    plantingPattern?: string;
    notes?: string;
}

export interface Fsa578WorksheetMetadata {
    farmName: string;
    producerName?: string;
    /** Operator mailing address for FSA-578 box 5 (may span lines). */
    operatorAddress?: string;
    county?: string;
    state?: string;
    cropYear: number;
    reportDate: string;
}

export interface Fsa578ValidationIssue {
    rowId: string;
    severity: 'warning' | 'error';
    field: string;
    message: string;
}

export interface Fsa578FieldAcreTotal {
    fieldName: string;
    acres: number;
}

function parseTractKey(tractKey: string): { farmNumber: string; tractNumber: string } {
    const separator = tractKey.indexOf('-');
    if (separator === -1) return { farmNumber: '', tractNumber: tractKey };
    return {
        farmNumber: tractKey.slice(0, separator),
        tractNumber: tractKey.slice(separator + 1),
    };
}

function dedupeAssignments(assignments: FieldCluAssignment[]): FieldCluAssignment[] {
    const seen = new Set<string>();
    return assignments.filter(a => {
        const key = `${a.tractKey}:${a.cluNumber}:${a.landUse}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildTractAcreMap(fsaTracts: FsaTractImport[]): Map<string, number> {
    const acresByPart = new Map<string, number>();

    for (const tract of fsaTracts) {
        if (tract.deletedAt) continue;
        for (const feature of tract.geojson.features) {
            const cluNumber = feature.properties.cluNumber;
            if (!cluNumber) continue;
            acresByPart.set(`${tract.tractKey}:${cluNumber}`, feature.properties.acres);
        }
    }

    return acresByPart;
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const intersects = ((yi > lat) !== (yj > lat))
            && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
        if (intersects) inside = !inside;
    }

    return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: number[][][]): boolean {
    const [outerRing, ...holes] = polygon;
    if (!outerRing || !pointInRing(lng, lat, outerRing)) return false;
    return !holes.some(ring => pointInRing(lng, lat, ring));
}

function findContainingFeature(
    field: Field | undefined,
    tractKeys: string[],
    fsaTracts: FsaTractImport[],
): { tractKey: string; cluNumber: string; acres: number } | null {
    if (!field || field.lat == null || field.lng == null) return null;

    for (const tractKey of tractKeys) {
        const tract = fsaTracts.find(t => !t.deletedAt && t.tractKey === tractKey);
        if (!tract) continue;

        const feature = tract.geojson.features.find(f => {
            if (f.geometry.type === 'MultiPolygon') {
                return (f.geometry.coordinates as number[][][][]).some(poly =>
                    pointInPolygon(field.lng!, field.lat!, poly)
                );
            }
            return pointInPolygon(field.lng!, field.lat!, f.geometry.coordinates as number[][][]);
        });

        if (feature?.properties.cluNumber) {
            return {
                tractKey,
                cluNumber: feature.properties.cluNumber,
                acres: feature.properties.acres,
            };
        }
    }

    return null;
}

function plantSortTime(record: PlantRecord): number {
    return getWorkDateMs(record);
}

function sortedPlantRecords(plantRecords: PlantRecord[]): PlantRecord[] {
    return [...plantRecords].sort((a, b) =>
        a.fieldName.localeCompare(b.fieldName)
        || plantSortTime(a) - plantSortTime(b)
        || a.id.localeCompare(b.id)
    );
}

function mergeCompatiblePlantRecords(records: PlantRecord[], fieldMap: Map<string, Field>): PlantRecord[] {
    const grouped = new Map<string, PlantRecord>();

    records.forEach(r => {
        const field = fieldMap.get(r.fieldId);
        const irrigation = r.irrigationPractice || field?.irrigationPractice || 'Non-Irrigated';
        const share = r.producerShare ?? field?.producerShare ?? 100;
        const intendedUse = r.intendedUse || field?.intendedUse || '';

        const key = [
            r.fieldId,
            r.crop || '',
            r.seedVariety || '',
            intendedUse,
            irrigation,
            share,
            r.cropStatus || 'Planted',
            r.cropSequence || 'First Crop',
            r.fsaStatusCode || '',
            r.plantingPattern || '',
        ].join('|');

        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, { ...r });
            return;
        }

        existing.id = `${existing.id}+${r.id}`;
        // One non-finite acreage must not zero the merged row (roundTo(NaN) is 0).
        const finite = (n: number) => (Number.isFinite(n) ? n : 0);
        existing.acreage = roundTo(finite(existing.acreage) + finite(r.acreage), 2);
        if (r.plantDate && (!existing.plantDate || r.plantDate > existing.plantDate)) {
            existing.plantDate = r.plantDate;
        }
        if (r.timestamp > existing.timestamp) {
            existing.timestamp = r.timestamp;
        }
    });

    return [...grouped.values()];
}

function displayedPlantDate(record: PlantRecord): string {
    if (record.plantDate) return record.plantDate;
    const ms = new Date(record.timestamp).getTime();
    // Guard against corrupted/invalid timestamps so one bad cached record
    // can't RangeError-crash the whole FSA-578 render.
    return Number.isFinite(ms) ? toLocalIsoDate(ms) : '';
}

function fsa578GroupKey(row: Fsa578ReportRow): string {
    return [
        row.fieldId,
        row.farmNumber,
        row.tractNumber,
        row.fieldNumber,
        row.landUse,
        row.crop,
        row.seedVariety,
        row.intendedUse,
        row.irrigationCode,
        row.producerShare,
        row.cropStatus || '',
        row.cropSequence || '',
        row.fsaStatusOverride || '',
        row.plantingPattern || '',
        row.notes || '',
    ].join('|');
}

function groupCompatibleFsa578Rows(rows: Fsa578ReportRow[]): Fsa578ReportRow[] {
    const grouped = new Map<string, Fsa578ReportRow>();

    rows.forEach(row => {
        const key = fsa578GroupKey(row);
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, { ...row });
            return;
        }

        existing.id = `${existing.id}+${row.id}`;
        existing.acreage = roundTo(existing.acreage + row.acreage, 2);
        if (row.date && (!existing.date || row.date > existing.date)) {
            existing.date = row.date;
        }
    });

    return [...grouped.values()];
}

function compareFsa578Rows(a: Fsa578ReportRow, b: Fsa578ReportRow): number {
    return (a.farmNumber || '').localeCompare(b.farmNumber || '', undefined, { numeric: true })
        || (a.tractNumber || '').localeCompare(b.tractNumber || '', undefined, { numeric: true })
        || (a.fieldNumber || '').localeCompare(b.fieldNumber || '', undefined, { numeric: true })
        || a.landUse.localeCompare(b.landUse)
        || (a.crop || '').localeCompare(b.crop || '')
        || a.fieldName.localeCompare(b.fieldName);
}

function isPlantedCroplandRow(row: Fsa578ReportRow): boolean {
    return row.landUse === 'Cropland'
        && row.crop.trim().length > 0
        && row.cropStatus !== 'Prevented Planting'
        && !isSupplementalCrop(row);
}

/**
 * Established-forage matcher shared by the row builder, row validation, and
 * the PDF status column. Accepts word matches inside labels like "Hay Ground"
 * or "Pasture ground" because cropFromFieldUse uses that same contains logic
 * for the crop label — undated hay/pasture cropland must display as an
 * existing stand and must not raise a missing-crop-status error.
 */
export function isEstablishedForageLabel(...values: Array<string | undefined>): boolean {
    return values.some(value => {
        const label = value?.trim().toLowerCase();
        if (!label) return false;
        return /\bhay\b|\bpasture\b/.test(label);
    });
}

function cropFromFieldUse(field: Field | undefined): string {
    const intendedUse = field?.intendedUse?.trim();
    if (!intendedUse) return '';

    if (isEstablishedForageLabel(intendedUse)) return intendedUse;

    return '';
}

export function calculateFsa578PlantedAcreTotals(rows: Fsa578ReportRow[]): {
    totalAcres: number;
    byField: Fsa578FieldAcreTotal[];
} {
    const totals = new Map<string, number>();
    let totalAcres = 0;

    rows.filter(isPlantedCroplandRow).forEach(row => {
        totalAcres += row.acreage;
        totals.set(row.fieldName, (totals.get(row.fieldName) || 0) + row.acreage);
    });

    return {
        totalAcres: roundTo(totalAcres, 2),
        byField: [...totals.entries()]
            .map(([fieldName, acres]) => ({ fieldName, acres: roundTo(acres, 2) }))
            .sort((a, b) => a.fieldName.localeCompare(b.fieldName)),
    };
}

export function isSupplementalCrop(record: Pick<PlantRecord, 'cropStatus'>): boolean {
    return record.cropStatus === 'Cover Crop' || record.cropStatus === 'Volunteer';
}

function allowsRepeatedCluAcres(record: Pick<PlantRecord, 'cropSequence' | 'cropStatus' | 'plantingPattern'>): boolean {
    return record.cropSequence === 'Second Crop'
        || /double\s*crop|replant/i.test(record.plantingPattern || '');
}

function plantingAcresForClu(record: PlantRecord, cluAcres: number, fieldCluAcres: number): number {
    if (record.cropStatus !== 'Failed' && !isSupplementalCrop(record) && allowsRepeatedCluAcres(record)) return cluAcres;
    if (!Number.isFinite(record.acreage) || record.acreage <= 0 || fieldCluAcres <= 0) return 0;
    return roundTo(Math.min(record.acreage, fieldCluAcres) * cluAcres / fieldCluAcres, 2);
}

/**
 * Acres for a planting on a field with no CLU to apportion across: the
 * planting's own acres, capped at the field's acres. A field split 40 corn /
 * 40 soybeans must not report 80 + 80. Second-crop and double-crop/replant
 * rows may repeat the field's acres, as they do per CLU. A planting with no
 * usable acreage falls back to the field's acres (the PlantModal default).
 */
function plantingAcresForField(record: PlantRecord, fieldAcres: number): number {
    if (record.cropStatus !== 'Failed' && !isSupplementalCrop(record) && allowsRepeatedCluAcres(record)) return fieldAcres;
    if (!Number.isFinite(record.acreage) || record.acreage <= 0) return fieldAcres;
    if (!Number.isFinite(fieldAcres) || fieldAcres <= 0) return roundTo(record.acreage, 2);
    return roundTo(Math.min(record.acreage, fieldAcres), 2);
}

function assignmentWarning(a: FieldCluAssignment, tracts: FsaTractImport[], acres: Map<string, number>): string | undefined {
    if (!tracts.some(t => !t.deletedAt && t.tractKey === a.tractKey)) return undefined;
    const featureAcres = acres.get(`${a.tractKey}:${a.cluNumber}`);
    if (featureAcres == null) return `CLU ${a.cluNumber} is missing from tract ${a.tractKey}. Review the assignment.`;
    if (Math.abs(featureAcres - a.acres) > 0.01) return `CLU ${a.cluNumber} assignment acres (${a.acres}) differ from tract acres (${featureAcres}). Reimport or review the assignment.`;
    return undefined;
}

export function buildFsa578Rows(
    plantRecords: PlantRecord[],
    fields: Field[],
    cluAssignments: FieldCluAssignment[] = [],
    fsaTracts: FsaTractImport[] = [],
): Fsa578ReportRow[] {
    const fieldMap = new Map(fields.map(field => [field.id, field]));
    const tractAcres = buildTractAcreMap(fsaTracts);
    const activeAssignmentsByField = new Map<string, FieldCluAssignment[]>();

    for (const assignment of cluAssignments) {
        if (assignment.deletedAt) continue;
        const current = activeAssignmentsByField.get(assignment.fieldId) || [];
        current.push(assignment);
        activeAssignmentsByField.set(assignment.fieldId, current);
    }

    // Normalize: one active assignment per field/tract/CLU/land-use to prevent duplicated acres
    activeAssignmentsByField.forEach((assignments, fieldId) => {
        activeAssignmentsByField.set(fieldId, dedupeAssignments(assignments));
    });

    const activeAssignments = [...activeAssignmentsByField.values()].flat();
    const fsaPlantRecords = mergeCompatiblePlantRecords(sortedPlantRecords(plantRecords), fieldMap);
    const plantedFieldIds = new Set(plantRecords.map(record => record.fieldId));

    const plantedRows = groupCompatibleFsa578Rows(fsaPlantRecords.flatMap(r => {
        const field = fieldMap.get(r.fieldId);
        const assignments = activeAssignmentsByField.get(r.fieldId) || [];
        const croplandAssignments = assignments.filter(a => a.landUse === 'cropland');

        const irrigation = r.irrigationPractice || field?.irrigationPractice || 'Non-Irrigated';
        const irrigationCode = irrigation === 'Irrigated' ? 'IR' : 'NI';

        const share = r.producerShare ?? field?.producerShare ?? 100;
        const shareDisplay = String(roundTo(share, 2));

        const baseRow = {
            fieldId: r.fieldId,
            date: displayedPlantDate(r),
            fieldName: r.fieldName,
            crop: r.crop || '',
            seedVariety: r.seedVariety || '',
            intendedUse: r.intendedUse || field?.intendedUse || '',
            irrigationCode,
            producerShare: `${shareDisplay}%`,
            landlordName: field?.landlordName?.trim() || '',
            landUse: 'Cropland' as const,
            cropStatus: r.cropStatus || 'Planted' as const,
            cropSequence: (r.cropSequence || 'First Crop') as PlantRecord['cropSequence'],
            fsaStatusOverride: r.fsaStatusCode,
            plantingPattern: r.plantingPattern || '',
            notes: '',
        };

        if (croplandAssignments.length === 0) {
            const tractKeys = parseTractKeys(field?.fsaFarmNumber, field?.fsaTractNumber);
            const legacyCluNumbers = Array.from(new Set(field?.cluNumbers?.filter(Boolean) || []));
            const legacyParts = tractKeys.flatMap(tractKey => legacyCluNumbers
                .filter(cluNumber => tractAcres.has(`${tractKey}:${cluNumber}`))
                .map(cluNumber => ({ tractKey, cluNumber, acres: tractAcres.get(`${tractKey}:${cluNumber}`)! })));
            const legacyTotalAcres = legacyParts.reduce((sum, part) => sum + part.acres, 0);
            const legacyRows = legacyParts.map(({ tractKey, cluNumber, acres }) => {
                const tract = parseTractKey(tractKey);

                return {
                    ...baseRow,
                    id: `${r.id}-legacy-${tractKey}-${cluNumber}`,
                    farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                    tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                    fieldNumber: cluNumber,
                    acreage: plantingAcresForClu(r, acres, legacyTotalAcres),
                    cluAcres: acres,
                };
            });

            const unmatchedRows = legacyCluNumbers
                .filter(clu => !legacyParts.some(part => part.cluNumber === clu))
                .map(clu => ({
                    ...baseRow, id: `${r.id}-unmatched-${clu}`, farmNumber: field?.fsaFarmNumber || '',
                    tractNumber: '', fieldNumber: clu, acreage: 0,
                    assignmentWarning: `CLU ${clu} could not be matched to an imported tract. Review the CLU assignment.`,
                }));
            if (legacyRows.length > 0 || unmatchedRows.length > 0) return [...legacyRows, ...unmatchedRows];

            const containingFeature = findContainingFeature(field, tractKeys, fsaTracts);
            if (containingFeature) {
                const tract = parseTractKey(containingFeature.tractKey);

                return [{
                    ...baseRow,
                    id: `${r.id}-feature-${containingFeature.tractKey}-${containingFeature.cluNumber}`,
                    farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                    tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                    fieldNumber: containingFeature.cluNumber,
                    acreage: plantingAcresForClu(r, containingFeature.acres, containingFeature.acres),
                    cluAcres: containingFeature.acres,
                }];
            }

            return [{
                ...baseRow,
                id: r.id,
                farmNumber: field?.fsaFarmNumber || '',
                tractNumber: field?.fsaTractNumber || '',
                fieldNumber: r.fsaFieldNumber || field?.fsaFieldNumber || '',
                acreage: field ? plantingAcresForField(r, getDisplayFieldAcres(field, cluAssignments)) : r.acreage,
            }];
        }

        return croplandAssignments.map(a => {
            const tract = parseTractKey(a.tractKey);

            return {
                ...baseRow,
                id: `${r.id}-${a.id}`,
                farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                fieldNumber: a.cluNumber,
                acreage: plantingAcresForClu(r, a.acres, croplandAssignments.reduce((sum, part) => sum + part.acres, 0)),
                cluAcres: tractAcres.get(`${a.tractKey}:${a.cluNumber}`) ?? a.acres,
                assignmentWarning: assignmentWarning(a, fsaTracts, tractAcres),
            };
        });
    }));

    const unreportedCroplandRows = activeAssignments
        .filter(a => a.landUse === 'cropland' && !plantedFieldIds.has(a.fieldId))
        .map(a => {
            const field = fieldMap.get(a.fieldId);
            const tract = parseTractKey(a.tractKey);
            const share = field?.producerShare ?? 100;
            const irrigation = field?.irrigationPractice || 'Non-Irrigated';
            const fieldUseCrop = cropFromFieldUse(field);

            return {
                id: `unreported-cropland-${a.id}`,
                fieldId: a.fieldId,
                date: '',
                fieldName: field?.name || 'Unmatched field',
                farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                fieldNumber: a.cluNumber,
                acreage: a.acres,
                cluAcres: tractAcres.get(`${a.tractKey}:${a.cluNumber}`) ?? a.acres,
                assignmentWarning: assignmentWarning(a, fsaTracts, tractAcres),
                crop: fieldUseCrop,
                seedVariety: '',
                intendedUse: field?.intendedUse?.trim() || '',
                irrigationCode: irrigation === 'Irrigated' ? 'IR' : 'NI',
                producerShare: `${String(roundTo(share, 2))}%`,
                landlordName: field?.landlordName?.trim() || '',
                landUse: 'Cropland' as const,
                notes: fieldUseCrop
                    ? ''
                    : 'Assigned cropland has no planting or prevented/failed status recorded.',
            };
        });

    const nonCroplandRows = activeAssignments
        .filter(a => a.landUse === 'non_cropland')
        .map(a => {
            const field = fieldMap.get(a.fieldId);
            const tract = parseTractKey(a.tractKey);
            const share = field?.producerShare ?? 100;
            const nonCropUse = field?.intendedUse?.trim() || 'Non-cropland';

            return {
                id: `non-cropland-${a.id}`,
                fieldId: a.fieldId,
                date: '',
                fieldName: field?.name || 'Unmatched field',
                farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                fieldNumber: a.cluNumber,
                acreage: a.acres,
                cluAcres: tractAcres.get(`${a.tractKey}:${a.cluNumber}`) ?? a.acres,
                assignmentWarning: assignmentWarning(a, fsaTracts, tractAcres),
                crop: 'Non-crop',
                seedVariety: '',
                intendedUse: nonCropUse,
                irrigationCode: 'NI',
                producerShare: `${String(roundTo(share, 2))}%`,
                landUse: 'Non-cropland' as const,
            };
        });

    return [...plantedRows, ...unreportedCroplandRows, ...nonCroplandRows].sort(compareFsa578Rows);
}

export function validateFsa578Rows(rows: Fsa578ReportRow[]): Fsa578ValidationIssue[] {
    const issues: Fsa578ValidationIssue[] = [];
    const isBlank = (value: string | null | undefined) => !value || value.trim().length === 0;

    for (const row of rows) {
        if (isBlank(row.farmNumber)) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'farmNumber',
                message: `${row.fieldName} is missing FSA farm number.`,
            });
        }

        if (isBlank(row.tractNumber)) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'tractNumber',
                message: `${row.fieldName} is missing FSA tract number.`,
            });
        }

        if (isBlank(row.fieldNumber)) {
            issues.push({
                rowId: row.id,
                severity: 'warning',
                field: 'fieldNumber',
                message: `${row.fieldName} is missing CLU/field number.`,
            });
        }

        if (row.landUse === 'Cropland' && isBlank(row.crop)) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'crop',
                message: `${row.fieldName} is cropland but has no crop.`,
            });
        }

        if (row.landUse === 'Cropland' && isBlank(row.intendedUse)) {
            issues.push({
                rowId: row.id,
                severity: 'warning',
                field: 'intendedUse',
                message: `${row.fieldName} is missing intended use.`,
            });
        }

        const isEstablishedForage = isEstablishedForageLabel(row.crop, row.intendedUse);
        const effectiveStatus = row.cropStatus || (row.date ? 'Planted' : undefined);
        if (row.landUse === 'Cropland' && !effectiveStatus && !isEstablishedForage) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'cropStatus',
                message: `${row.fieldName} is missing crop status (planted, prevented planting, failed, volunteer, or cover crop).`,
            });
        }

        if (row.landUse === 'Cropland' && effectiveStatus === 'Planted' && isBlank(row.date)) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'date',
                message: `${row.fieldName} is marked planted but has no planting date.`,
            });
        }

        if (row.landUse === 'Cropland' && isBlank(row.producerShare)) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'producerShare',
                message: `${row.fieldName} is missing producer share.`,
            });
        }

        if (row.landUse === 'Cropland' && isBlank(row.irrigationCode)) {
            issues.push({
                rowId: row.id,
                severity: 'warning',
                field: 'irrigationCode',
                message: `${row.fieldName} is missing irrigation practice.`,
            });
        }

        if (!row.acreage || row.acreage <= 0) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'acreage',
                message: `${row.fieldName} has invalid acreage.`,
            });
        }
    }

    const sequenceGroups = new Map<string, Fsa578ReportRow[]>();
    for (const row of rows) {
        if (row.assignmentWarning) issues.push({ rowId: row.id, severity: 'warning', field: 'fieldNumber', message: row.assignmentWarning });
        if (row.landUse !== 'Cropland' || row.cluAcres == null || row.cropStatus === 'Failed' || isSupplementalCrop(row) || allowsRepeatedCluAcres(row)) continue;
        const key = [row.farmNumber, row.tractNumber, row.fieldNumber, row.cropSequence || 'First Crop'].join('|');
        const group = sequenceGroups.get(key) || [];
        group.push(row);
        sequenceGroups.set(key, group);
    }
    for (const group of sequenceGroups.values()) {
        const acres = group.reduce((sum, row) => sum + row.acreage, 0);
        const boundary = Math.min(...group.map(row => row.cluAcres!));
        if (acres > boundary + 0.01) group.forEach(row => issues.push({
            rowId: row.id, severity: 'error', field: 'acreage',
            message: `${row.fieldName}: same-sequence planting acres (${roundTo(acres, 2)}) exceed CLU ${row.fieldNumber} acres (${boundary}).`,
        }));
    }
    return issues;
}

/** FSA-578 form codes, same derivation as the PDF sheet (fsa578FormLayout). */
function fsa578CsvCodes(row: Fsa578ReportRow): string[] {
    if (row.landUse !== 'Cropland') return ['', '', '', '', ''];
    const share = Number.parseFloat(row.producerShare.replace('%', ''));
    const otherShare = Number.isFinite(share) && share < 100 ? roundTo(100 - share, 2).toFixed(2) : '';
    return [
        fsaPracticeCode(row),
        fsaStatusCode(row),
        fsaIntendedUseCode(row.intendedUse),
        otherShare ? (row.landlordName?.trim() || 'Other producer (name not recorded)') : '',
        otherShare,
    ];
}

export function buildFsa578WorksheetCsv({
    metadata,
    rows,
    counties,
}: {
    metadata: Fsa578WorksheetMetadata;
    rows: Fsa578ReportRow[];
    /** Saved county assignments; adds each row's physical county. */
    counties?: ReportCountyContext;
}): string {
    const titleRows = [
        [sanitizeCsvValue('FSA-578 Acreage Reporting Worksheet')],
        [sanitizeCsvValue('Not an official USDA form. Verify final acreage certification with your county FSA office.')],
        [sanitizeCsvValue(ACRELEDGER_CSV_LINE)],
        [],
        [sanitizeCsvValue('Farm Name'), sanitizeCsvValue(metadata.farmName)],
        [sanitizeCsvValue('Producer Name'), sanitizeCsvValue(metadata.producerName || '')],
        [sanitizeCsvValue('Operator Address'), sanitizeCsvValue((metadata.operatorAddress || '').replace(/\s*\n\s*/g, ', '))],
        [sanitizeCsvValue('County'), sanitizeCsvValue(metadata.county || '')],
        [sanitizeCsvValue('State'), sanitizeCsvValue(metadata.state || '')],
        [sanitizeCsvValue('Crop Year'), sanitizeCsvValue(metadata.cropYear)],
        [sanitizeCsvValue('Report Date'), sanitizeCsvValue(metadata.reportDate)],
        [],
    ].map(row => row.join(','));

    const header = [
        'Crop Year',
        'Farm Name',
        'Field Name',
        'Farm #',
        'Tract #',
        'CLU / Field #',
        'Land Use',
        'Crop',
        'Type / Variety',
        'Planting Pattern',
        'Acres',
        'Plant Date',
        'Intended Use',
        'Irrigation',
        'Producer Share',
        'Crop Status',
        'Crop Sequence',
        'Notes',
        'FSA Practice Code',
        'FSA Status Code',
        'FSA Intended Use Code',
        'Other Producer (Landlord)',
        'Other Producer Share',
        'Physical County',
    ].map(sanitizeCsvValue).join(',');

    const dataRows = rows.map(row => [
        metadata.cropYear,
        metadata.farmName,
        row.fieldName,
        row.farmNumber,
        row.tractNumber,
        row.fieldNumber,
        row.landUse,
        row.crop,
        row.seedVariety,
        row.plantingPattern || '',
        row.acreage,
        row.date,
        row.intendedUse,
        row.irrigationCode,
        row.producerShare,
        row.cropStatus || '',
        row.cropSequence || '',
        row.notes || '',
        ...fsa578CsvCodes(row),
        fsa578CountyLabel(row.fieldId, counties),
    ].map(sanitizeCsvValue).join(','));

    return [...titleRows, header, ...dataRows].join('\n');
}

export function generateMissouriLogRows(records: SprayRecord[], fields: Field[], cluAssignments: FieldCluAssignment[] = []): string[] {
    return records.flatMap(r => {
        const field = fields.find(f => f.id === r.fieldId);
        const storedArea = getEffectiveSprayTreatedAcres(r, field, cluAssignments);
        const areaUnit = effectiveTreatedAreaUnit(r);
        const treatedArea = storedArea == null ? '' : normalizeTreatedArea(storedArea, areaUnit, 'ac');

        // If there are granular products, create a row for each herbicide in the mix
        if (r.products && r.products.length > 0) {
            return r.products.map((p: any) => {
                const areaNum = parseFloat(treatedArea.toString());
                const productTotalDisplay = formatSprayProductTotal(p, normalizeAreaForRate(storedArea ?? areaNum, areaUnit, p.rateUnit));

                return [
                    sanitizeCsvValue(r.sprayDate || new Date(r.timestamp).toLocaleDateString()),
                    sanitizeCsvValue(r.startTime),
                    sanitizeCsvValue(r.endTime),
                    sanitizeCsvValue(r.applicatorName),
                    sanitizeCsvValue(r.licenseNumber),
                    sanitizeCsvValue(r.cropOrSiteTreated),
                    sanitizeCsvValue(p.product),
                    sanitizeCsvValue(p.epaRegNumber || 'N/A'),
                    sanitizeCsvValue(r.fieldName),
                    sanitizeCsvValue(treatedArea),
                    sanitizeCsvValue(`${p.rate} ${p.rateUnit}`),
                    sanitizeCsvValue(productTotalDisplay),
                    sanitizeCsvValue(r.totalMixtureVolume),
                    sanitizeCsvValue(r.equipmentId),
                    sanitizeCsvValue(r.windSpeed),
                    sanitizeCsvValue(r.windDirection),
                    sanitizeCsvValue(r.temperature),
                    sanitizeCsvValue(r.relativeHumidity),
                    sanitizeCsvValue(r.targetPest),
                    sanitizeCsvValue(r.involvedTechnicians),
                    sanitizeCsvValue(r.sensitiveAreaCheck ? 'YES' : 'NO'),
                    sanitizeCsvValue(r.sensitiveAreaNotes)
                ].join(',');
            });
        }

        // Fallback for legacy records or records without granular product breakdown
        return [[
            sanitizeCsvValue(r.sprayDate || new Date(r.timestamp).toLocaleDateString()),
            sanitizeCsvValue(r.startTime),
            sanitizeCsvValue(r.endTime),
            sanitizeCsvValue(r.applicatorName),
            sanitizeCsvValue(r.licenseNumber),
            sanitizeCsvValue(r.cropOrSiteTreated),
            '',
            sanitizeCsvValue(r.epaRegNumber),
            sanitizeCsvValue(r.fieldName),
            sanitizeCsvValue(treatedArea),
            sanitizeCsvValue(r.mixtureRate),
            '',
            sanitizeCsvValue(r.totalMixtureVolume),
            sanitizeCsvValue(r.equipmentId),
            sanitizeCsvValue(r.windSpeed),
            sanitizeCsvValue(r.windDirection),
            sanitizeCsvValue(r.temperature),
            sanitizeCsvValue(r.relativeHumidity),
            sanitizeCsvValue(r.targetPest),
            sanitizeCsvValue(r.involvedTechnicians),
            sanitizeCsvValue(r.sensitiveAreaCheck ? 'YES' : 'NO'),
            sanitizeCsvValue(r.sensitiveAreaNotes)
        ].join(',')];
    });
}

export async function generateMissouriLog(records: SprayRecord[], fields: Field[], cluAssignments: FieldCluAssignment[] = []): Promise<void> {
    const header = [
        'Date', 'Start Time', 'End Time', 'Applicator Name', 'License #', 'Crop/Site Treated', 'Trade Name', 'EPA Reg #',
        'Site/Field', 'Total Acres Treated', 'App Rate (per ac)', 'Total Product Applied',
        'Total Mixture Volume (Mix + Water)', 'Equipment ID', 'Wind Speed (mph)',
        'Wind Direction', 'Temp (F)', 'Relative Humidity (%)', 'Target Pest(s)', 'Technicians',
        'Sensitive Area Check', 'Sensitive Area Notes'
    ].join(',');

    const rows = generateMissouriLogRows(records, fields, cluAssignments);
    const csvContent = [header, ...rows].join('\n');
    await downloadFile(csvContent, `Missouri_Spray_Log_${toLocalIsoDate(Date.now())}.csv`, 'text/csv');
}

export async function exportFsa578Data(
    plantRecords: PlantRecord[],
    fields: Field[],
    cluAssignments: FieldCluAssignment[] = [],
    fsaTracts: FsaTractImport[] = [],
    metadata?: Partial<Fsa578WorksheetMetadata>,
    counties?: ReportCountyContext,
): Promise<void> {
    const today = toLocalIsoDate(Date.now());
    const rows = buildFsa578Rows(plantRecords, fields, cluAssignments, fsaTracts);
    const cropYear = metadata?.cropYear ?? plantRecords[0]?.seasonYear ?? new Date().getFullYear();
    const csvContent = buildFsa578WorksheetCsv({
        metadata: {
            farmName: farmNameForCsv(metadata?.farmName),
            producerName: metadata?.producerName,
            operatorAddress: metadata?.operatorAddress,
            county: metadata?.county,
            state: metadata?.state,
            cropYear,
            reportDate: metadata?.reportDate || today,
        },
        rows,
        counties,
    });

    await downloadFile(csvContent, `FSA_578_Worksheet_${cropYear}_${today}.csv`, 'text/csv');
}

export async function exportHarvestData(harvestRecords: HarvestRecord[], fields: Field[]): Promise<void> {
    const header = [
        'Date',
        'Field',
        'Crop',
        'Bushels',
        'Moisture %',
        'Destination',
        'Landlord Share %',
        'Landlord Name',
        'Scale Ticket #',
        'Farm #',
        'Tract #'
    ].join(',');

    const rows = harvestRecords.map(r => {
        const field = fields.find(f => f.id === r.fieldId);
        return [
            sanitizeCsvValue(r.harvestDate || new Date(r.timestamp).toLocaleDateString()),
            sanitizeCsvValue(r.fieldName),
            sanitizeCsvValue(r.crop),
            sanitizeCsvValue(r.bushels),
            sanitizeCsvValue(r.moisturePercent),
            sanitizeCsvValue(r.destination === 'bin' ? 'On-Farm Bin' : 'Elevator/Sale'),
            sanitizeCsvValue(getLandlordSplitPercent(field, r.landlordSplitPercent)),
            sanitizeCsvValue(r.landlordName),
            sanitizeCsvValue(r.scaleTicketNumber),
            sanitizeCsvValue(field?.fsaFarmNumber),
            sanitizeCsvValue(field?.fsaTractNumber)
        ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    await downloadFile(csvContent, `FSA_Harvest_Report_${toLocalIsoDate(Date.now())}.csv`, 'text/csv');
}

export async function exportFertilizerData(records: FertilizerApplication[], fields: Field[]): Promise<void> {
    const header = [
        'Date',
        'Field',
        'Acres',
        'Fertilizer Formula',
        'Season'
    ].join(',');

    const rows = records.map(r => {
        const field = fields.find(f => f.id === r.fieldId);
        return [
            sanitizeCsvValue(r.date),
            sanitizeCsvValue(field?.name || r.fieldName),
            sanitizeCsvValue(r.acres),
            sanitizeCsvValue(r.fertilizer_formula),
            sanitizeCsvValue(r.seasonYear)
        ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    await downloadFile(csvContent, `Fertilizer_Report_${toLocalIsoDate(Date.now())}.csv`, 'text/csv');
}

export async function downloadFile(content: string, fileName: string, contentType: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
        await native.shareFile({
            fileName,
            data: content,
            title: `AcreLedger Export: ${fileName}`,
            encoding: 'utf8'
        });
        return;
    }

    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
