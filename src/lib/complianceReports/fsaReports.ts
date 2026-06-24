import { Capacitor } from '@capacitor/core';

import { native } from '@/lib/native';
import { parseTractKeys } from '@/lib/tractLookup';
import { SprayRecord, Field, PlantRecord, FertilizerApplication, HarvestRecord, HayHarvestRecord } from '../../types/farm';
import type { FieldCluAssignment, FsaTractImport } from '../../types/fsaTract';
import { roundTo } from '../../utils/numbers';
import { formatTotalAmount } from '../../utils/unitConversion';

function sanitizeCsvValue(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    // Prefix with ' if it starts with injection characters
    if (/^[=+\-@\t\r]/.test(str)) return `"'${str}"`;
    return `"${str}"`;
}

export interface Fsa578ReportRow {
    id: string;
    date: string;
    fieldName: string;
    farmNumber: string;
    tractNumber: string;
    fieldNumber: string;
    acreage: number;
    crop: string;
    seedVariety: string;
    intendedUse: string;
    irrigationCode: string;
    producerShare: string;
    landUse: 'Cropland' | 'Non-cropland';
    cropStatus?: 'Planted' | 'Prevented Planting' | 'Failed' | 'Volunteer' | 'Cover Crop';
    cropSequence?: 'First Crop' | 'Second Crop';
    organicStatus?: 'Conventional' | 'Organic' | 'Transitioning';
    plantingPattern?: string;
    notes?: string;
}

export interface Fsa578WorksheetMetadata {
    farmName: string;
    producerName?: string;
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

export interface FsaFallProductionRow {
    id: string;
    recordType: 'grain' | 'hay';
    fieldName: string;
    crop: string;
    farmNumber: string;
    tractNumber: string;
    harvestDate: string;
    production: number;
    productionUnit: 'bu' | 'bales' | 'tons';
    moisturePercent?: number;
    destination: string;
    evidenceReference: string;
    landlordSplitPercent?: number;
    landlordName?: string;
    notes: string;
}

export interface FsaFallProductionReport {
    grainRows: FsaFallProductionRow[];
    hayRows: FsaFallProductionRow[];
}

export interface FsaFallProductionMetadata {
    farmName: string;
    cropYear: number;
    reportDate: string;
}

export interface FsaFallValidationIssue {
    rowId: string;
    severity: 'warning' | 'error';
    field: string;
    message: string;
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
    const dateTime = record.plantDate ? new Date(record.plantDate).getTime() : NaN;
    return Number.isFinite(dateTime) ? dateTime : record.timestamp;
}

function sortedPlantRecords(plantRecords: PlantRecord[]): PlantRecord[] {
    return [...plantRecords].sort((a, b) =>
        a.fieldName.localeCompare(b.fieldName)
        || plantSortTime(a) - plantSortTime(b)
        || a.id.localeCompare(b.id)
    );
}

function displayedPlantDate(record: PlantRecord): string {
    if (record.plantDate) return record.plantDate;
    const ms = new Date(record.timestamp).getTime();
    // Guard against corrupted/invalid timestamps so one bad cached record
    // can't RangeError-crash the whole FSA-578 render.
    return Number.isFinite(ms) ? new Date(ms).toISOString().split('T')[0] : '';
}

function adjustedCluAcres(sourceAcres: number, record: PlantRecord, field: Field | undefined): number {
    if (!field?.acreage || field.acreage <= 0) return sourceAcres;
    if (record.acreage >= field.acreage) return sourceAcres;
    return roundTo(sourceAcres * (record.acreage / field.acreage), 2);
}

function fsa578GroupKey(row: Fsa578ReportRow): string {
    return [
        row.fieldName,
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
        && row.cropStatus !== 'Prevented Planting';
}

function cropFromFieldUse(field: Field | undefined): string {
    const intendedUse = field?.intendedUse?.trim();
    if (!intendedUse) return '';

    const use = intendedUse.toLowerCase();
    if (use.includes('hay')) return intendedUse;
    if (use.includes('pasture')) return intendedUse;

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
    const fsaPlantRecords = sortedPlantRecords(plantRecords);
    const plantedFieldIds = new Set(fsaPlantRecords.map(record => record.fieldId));

    const plantedRows = groupCompatibleFsa578Rows(fsaPlantRecords.flatMap(r => {
        const field = fieldMap.get(r.fieldId);
        const assignments = activeAssignmentsByField.get(r.fieldId) || [];
        const croplandAssignments = assignments.filter(a => a.landUse === 'cropland');

        const irrigation = r.irrigationPractice || field?.irrigationPractice || 'Non-Irrigated';
        const irrigationCode = irrigation === 'Irrigated' ? 'IR' : 'NI';

        const share = r.producerShare ?? field?.producerShare ?? 100;
        const shareDisplay = share.toFixed(0);

        const baseRow = {
            date: displayedPlantDate(r),
            fieldName: r.fieldName,
            crop: r.crop || '',
            seedVariety: r.seedVariety || '',
            intendedUse: r.intendedUse || field?.intendedUse || '',
            irrigationCode,
            producerShare: `${shareDisplay}%`,
            landUse: 'Cropland' as const,
            cropStatus: r.cropStatus || 'Planted' as const,
            cropSequence: (r.cropSequence || 'First Crop') as PlantRecord['cropSequence'],
            plantingPattern: r.plantingPattern || '',
            notes: '',
        };

        if (croplandAssignments.length === 0) {
            const tractKeys = parseTractKeys(field?.fsaFarmNumber, field?.fsaTractNumber);
            const legacyCluNumbers = Array.from(new Set(field?.cluNumbers?.filter(Boolean) || []));
            const legacyRows = tractKeys.flatMap(tractKey => {
                const tract = parseTractKey(tractKey);

                return legacyCluNumbers.map(cluNumber => ({
                    ...baseRow,
                    id: `${r.id}-legacy-${tractKey}-${cluNumber}`,
                    farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                    tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                    fieldNumber: cluNumber,
                    acreage: adjustedCluAcres(tractAcres.get(`${tractKey}:${cluNumber}`) ?? (legacyCluNumbers.length === 1 ? r.acreage : 0), r, field),
                }));
            });

            if (legacyRows.length > 0) return legacyRows;

            const containingFeature = findContainingFeature(field, tractKeys, fsaTracts);
            if (containingFeature) {
                const tract = parseTractKey(containingFeature.tractKey);

                return [{
                    ...baseRow,
                    id: `${r.id}-feature-${containingFeature.tractKey}-${containingFeature.cluNumber}`,
                    farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                    tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                    fieldNumber: containingFeature.cluNumber,
                    acreage: adjustedCluAcres(containingFeature.acres, r, field),
                }];
            }

            return [{
                ...baseRow,
                id: r.id,
                farmNumber: field?.fsaFarmNumber || '',
                tractNumber: field?.fsaTractNumber || '',
                fieldNumber: r.fsaFieldNumber || field?.fsaFieldNumber || '',
                acreage: r.acreage,
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
                acreage: adjustedCluAcres(a.acres, r, field),
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
                date: '',
                fieldName: field?.name || 'Unmatched field',
                farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                fieldNumber: a.cluNumber,
                acreage: a.acres,
                crop: fieldUseCrop,
                seedVariety: '',
                intendedUse: field?.intendedUse?.trim() || '',
                irrigationCode: irrigation === 'Irrigated' ? 'IR' : 'NI',
                producerShare: `${share.toFixed(0)}%`,
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
                date: '',
                fieldName: field?.name || 'Unmatched field',
                farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                fieldNumber: a.cluNumber,
                acreage: a.acres,
                crop: field?.intendedUse?.trim() || '',
                seedVariety: '',
                intendedUse: nonCropUse,
                irrigationCode: 'NI',
                producerShare: `${share.toFixed(0)}%`,
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

        if (!row.acreage || row.acreage <= 0) {
            issues.push({
                rowId: row.id,
                severity: 'error',
                field: 'acreage',
                message: `${row.fieldName} has invalid acreage.`,
            });
        }
    }

    return issues;
}

export function buildFsa578WorksheetCsv({
    metadata,
    rows,
}: {
    metadata: Fsa578WorksheetMetadata;
    rows: Fsa578ReportRow[];
}): string {
    const titleRows = [
        [sanitizeCsvValue('FSA-578 Acreage Certification Worksheet')],
        [sanitizeCsvValue('Not an official USDA form. Verify final acreage certification with your county FSA office.')],
        [],
        [sanitizeCsvValue('Farm Name'), sanitizeCsvValue(metadata.farmName)],
        [sanitizeCsvValue('Producer Name'), sanitizeCsvValue(metadata.producerName || '')],
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
    ].map(sanitizeCsvValue).join(','));

    return [...titleRows, header, ...dataRows].join('\n');
}

export function buildFsaFallProductionRows({
    harvestRecords,
    hayRecords,
    fields,
}: {
    harvestRecords: HarvestRecord[];
    hayRecords: HayHarvestRecord[];
    fields: Field[];
}): FsaFallProductionReport {
    const fieldMap = new Map(fields.map(field => [field.id, field]));

    const grainRows: FsaFallProductionRow[] = harvestRecords.map(record => {
        const field = fieldMap.get(record.fieldId);
        return {
            id: record.id,
            recordType: 'grain',
            fieldName: record.fieldName || field?.name || '',
            crop: record.crop || '',
            farmNumber: record.fsaFarmNumber || field?.fsaFarmNumber || '',
            tractNumber: record.fsaTractNumber || field?.fsaTractNumber || '',
            harvestDate: record.harvestDate || new Date(record.timestamp).toISOString().split('T')[0],
            production: record.bushels || 0,
            productionUnit: 'bu',
            moisturePercent: record.moisturePercent,
            destination: record.destination === 'bin' ? 'On-Farm Bin' : 'Elevator/Sale',
            evidenceReference: record.scaleTicketNumber || '',
            landlordSplitPercent: record.landlordSplitPercent,
            landlordName: record.landlordName,
            notes: '',
        };
    });

    const hayRows: FsaFallProductionRow[] = hayRecords.map(record => {
        const field = fieldMap.get(record.fieldId);
        const cutting = `Cutting ${record.cuttingNumber}`;
        return {
            id: record.id,
            recordType: 'hay',
            fieldName: record.fieldName || field?.name || '',
            crop: field?.intendedUse?.trim() || 'Hay Ground',
            farmNumber: field?.fsaFarmNumber || '',
            tractNumber: field?.fsaTractNumber || '',
            harvestDate: record.date || new Date(record.timestamp).toISOString().split('T')[0],
            production: record.baleCount || 0,
            productionUnit: 'bales',
            destination: 'On-Farm / Hay Storage',
            evidenceReference: cutting,
            notes: `${cutting}, ${record.baleType} bales`,
        };
    });

    return { grainRows, hayRows };
}

export function validateFsaFallProductionRows(rows: FsaFallProductionRow[]): FsaFallValidationIssue[] {
    const issues: FsaFallValidationIssue[] = [];
    const isBlank = (value: string | null | undefined) => !value || value.trim().length === 0;

    for (const row of rows) {
        if (isBlank(row.crop)) {
            issues.push({ rowId: row.id, severity: 'error', field: 'crop', message: `${row.fieldName} is missing crop/use.` });
        }
        if (isBlank(row.farmNumber)) {
            issues.push({ rowId: row.id, severity: 'error', field: 'farmNumber', message: `${row.fieldName} is missing FSA farm number.` });
        }
        if (isBlank(row.tractNumber)) {
            issues.push({ rowId: row.id, severity: 'error', field: 'tractNumber', message: `${row.fieldName} is missing FSA tract number.` });
        }
        if (isBlank(row.harvestDate)) {
            issues.push({ rowId: row.id, severity: 'error', field: 'harvestDate', message: `${row.fieldName} is missing harvest date.` });
        }
        if (!row.production || row.production <= 0) {
            issues.push({ rowId: row.id, severity: 'error', field: 'production', message: `${row.fieldName} has invalid production quantity.` });
        }
        if (isBlank(row.destination)) {
            issues.push({ rowId: row.id, severity: 'warning', field: 'destination', message: `${row.fieldName} is missing destination/storage.` });
        }
        if (isBlank(row.evidenceReference)) {
            issues.push({ rowId: row.id, severity: 'warning', field: 'evidenceReference', message: `${row.fieldName} is missing ticket/evidence reference.` });
        }
    }

    return issues;
}

export function buildFsaFallProductionCsv({
    metadata,
    rows,
}: {
    metadata: FsaFallProductionMetadata;
    rows: FsaFallProductionRow[];
}): string {
    const titleRows = [
        [sanitizeCsvValue('FSA Fall Harvest / Production Evidence Worksheet')],
        [sanitizeCsvValue('Not an official USDA form. Verify program-specific requirements with your county FSA office.')],
        [],
        [sanitizeCsvValue('Farm Name'), sanitizeCsvValue(metadata.farmName)],
        [sanitizeCsvValue('Crop Year'), sanitizeCsvValue(metadata.cropYear)],
        [sanitizeCsvValue('Report Date'), sanitizeCsvValue(metadata.reportDate)],
        [],
    ].map(row => row.join(','));

    const header = [
        'Crop Year',
        'Farm Name',
        'Record Type',
        'Field Name',
        'Farm #',
        'Tract #',
        'Crop / Use',
        'Harvest Date',
        'Production',
        'Unit',
        'Moisture %',
        'Destination / Storage',
        'Evidence / Ticket #',
        'Landlord Name',
        'Landlord Share %',
        'Notes',
    ].map(sanitizeCsvValue).join(',');

    const dataRows = rows.map(row => [
        metadata.cropYear,
        metadata.farmName,
        row.recordType,
        row.fieldName,
        row.farmNumber,
        row.tractNumber,
        row.crop,
        row.harvestDate,
        row.production,
        row.productionUnit,
        row.moisturePercent ?? '',
        row.destination,
        row.evidenceReference,
        row.landlordName || '',
        row.landlordSplitPercent ?? '',
        row.notes,
    ].map(sanitizeCsvValue).join(','));

    return [...titleRows, header, ...dataRows].join('\n');
}

export async function exportFsaFallProductionData({
    harvestRecords,
    hayRecords,
    fields,
    metadata,
}: {
    harvestRecords: HarvestRecord[];
    hayRecords: HayHarvestRecord[];
    fields: Field[];
    metadata?: Partial<FsaFallProductionMetadata>;
}): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const report = buildFsaFallProductionRows({ harvestRecords, hayRecords, fields });
    const cropYear = metadata?.cropYear ?? harvestRecords[0]?.seasonYear ?? hayRecords[0]?.seasonYear ?? new Date().getFullYear();
    const csvContent = buildFsaFallProductionCsv({
        metadata: {
            farmName: metadata?.farmName || 'AcreLedger Farm',
            cropYear,
            reportDate: metadata?.reportDate || today,
        },
        rows: [...report.grainRows, ...report.hayRows],
    });

    await downloadFile(csvContent, `FSA_Fall_Production_${cropYear}_${today}.csv`, 'text/csv');
}

export function generateMissouriLogRows(records: SprayRecord[], fields: Field[]): string[] {
    return records.flatMap(r => {
        const field = fields.find(f => f.id === r.fieldId);
        const treatedArea = r.treatedAreaSize || field?.acreage || '';

        // If there are granular products, create a row for each herbicide in the mix
        if (r.products && r.products.length > 0) {
            return r.products.map((p: any) => {
                const areaNum = parseFloat(treatedArea.toString());
                const productTotalDisplay = p.totalProductAmount 
                    ? `${p.totalProductAmount} ${p.totalProductUnit || ''}`.trim()
                    : formatTotalAmount(p.rate, areaNum, p.rateUnit);

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

export async function generateMissouriLog(records: SprayRecord[], fields: Field[]): Promise<void> {
    const header = [
        'Date', 'Start Time', 'End Time', 'Applicator Name', 'License #', 'Crop/Site Treated', 'Trade Name', 'EPA Reg #',
        'Site/Field', 'Total Acres Treated', 'App Rate (per ac)', 'Total Product Applied',
        'Total Mixture Volume (Mix + Water)', 'Equipment ID', 'Wind Speed (mph)',
        'Wind Direction', 'Temp (F)', 'Relative Humidity (%)', 'Target Pest(s)', 'Technicians',
        'Sensitive Area Check', 'Sensitive Area Notes'
    ].join(',');

    const rows = generateMissouriLogRows(records, fields);
    const csvContent = [header, ...rows].join('\n');
    await downloadFile(csvContent, `Missouri_Spray_Log_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

export async function exportFsa578Data(
    plantRecords: PlantRecord[],
    fields: Field[],
    cluAssignments: FieldCluAssignment[] = [],
    fsaTracts: FsaTractImport[] = [],
    metadata?: Partial<Fsa578WorksheetMetadata>,
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const rows = buildFsa578Rows(plantRecords, fields, cluAssignments, fsaTracts);
    const cropYear = metadata?.cropYear ?? plantRecords[0]?.seasonYear ?? new Date().getFullYear();
    const csvContent = buildFsa578WorksheetCsv({
        metadata: {
            farmName: metadata?.farmName || 'AcreLedger Farm',
            producerName: metadata?.producerName,
            county: metadata?.county,
            state: metadata?.state,
            cropYear,
            reportDate: metadata?.reportDate || today,
        },
        rows,
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
            sanitizeCsvValue(r.landlordSplitPercent),
            sanitizeCsvValue(r.landlordName),
            sanitizeCsvValue(r.scaleTicketNumber),
            sanitizeCsvValue(field?.fsaFarmNumber),
            sanitizeCsvValue(field?.fsaTractNumber)
        ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    await downloadFile(csvContent, `FSA_Harvest_Report_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
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
    await downloadFile(csvContent, `Fertilizer_Report_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

async function downloadFile(content: string, fileName: string, contentType: string): Promise<void> {
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
