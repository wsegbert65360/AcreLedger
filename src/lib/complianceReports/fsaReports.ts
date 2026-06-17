import { Capacitor } from '@capacitor/core';

import { native } from '@/lib/native';
import { parseTractKeys } from '@/lib/tractLookup';
import { SprayRecord, Field, PlantRecord, FertilizerApplication, HarvestRecord } from '../../types/farm';
import type { FieldCluAssignment, FsaTractImport } from '../../types/fsaTract';
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
}

function parseTractKey(tractKey: string): { farmNumber: string; tractNumber: string } {
    const separator = tractKey.indexOf('-');
    if (separator === -1) return { farmNumber: '', tractNumber: tractKey };
    return {
        farmNumber: tractKey.slice(0, separator),
        tractNumber: tractKey.slice(separator + 1),
    };
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

        const feature = tract.geojson.features.find(f =>
            pointInPolygon(field.lng!, field.lat!, f.geometry.coordinates)
        );

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

function latestPlantRecordsByField(plantRecords: PlantRecord[]): PlantRecord[] {
    const latest = new Map<string, PlantRecord>();

    for (const record of plantRecords) {
        const existing = latest.get(record.fieldId);
        if (!existing || plantSortTime(record) >= plantSortTime(existing)) {
            latest.set(record.fieldId, record);
        }
    }

    return [...latest.values()];
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

    const plantedRows = latestPlantRecordsByField(plantRecords).flatMap(r => {
        const field = fieldMap.get(r.fieldId);
        const assignments = activeAssignmentsByField.get(r.fieldId) || [];
        const croplandAssignments = assignments.filter(a => a.landUse === 'cropland');

        const irrigation = r.irrigationPractice || field?.irrigationPractice || 'Non-Irrigated';
        const irrigationCode = irrigation === 'Irrigated' ? 'IR' : 'NI';

        const share = r.producerShare ?? field?.producerShare ?? 100;
        const shareDisplay = share.toFixed(0);

        const baseRow = {
            date: r.plantDate || new Date(r.timestamp).toISOString().split('T')[0],
            fieldName: r.fieldName,
            crop: r.crop,
            seedVariety: r.seedVariety || '',
            intendedUse: r.intendedUse || field?.intendedUse || '',
            irrigationCode,
            producerShare: `${shareDisplay}%`,
            landUse: 'Cropland' as const,
        };

        if (croplandAssignments.length === 0) {
            const tractKeys = parseTractKeys(field?.fsaFarmNumber, field?.fsaTractNumber);
            const legacyCluNumbers = field?.cluNumbers?.filter(Boolean) || [];
            const legacyRows = tractKeys.flatMap(tractKey => {
                const tract = parseTractKey(tractKey);

                return legacyCluNumbers.map(cluNumber => ({
                    ...baseRow,
                    id: `${r.id}-legacy-${tractKey}-${cluNumber}`,
                    farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                    tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                    fieldNumber: cluNumber,
                    acreage: tractAcres.get(`${tractKey}:${cluNumber}`) ?? (legacyCluNumbers.length === 1 ? r.acreage : 0),
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
                    acreage: containingFeature.acres,
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
                acreage: a.acres,
            };
        });
    });

    const nonCroplandRows = cluAssignments
        .filter(a => !a.deletedAt && a.landUse === 'non_cropland')
        .map(a => {
            const field = fieldMap.get(a.fieldId);
            const tract = parseTractKey(a.tractKey);
            const share = field?.producerShare ?? 100;

            return {
                id: `non-cropland-${a.id}`,
                date: '',
                fieldName: field?.name || 'Unmatched field',
                farmNumber: tract.farmNumber || field?.fsaFarmNumber || '',
                tractNumber: tract.tractNumber || field?.fsaTractNumber || '',
                fieldNumber: a.cluNumber,
                acreage: a.acres,
                crop: '',
                seedVariety: '',
                intendedUse: 'Non-cropland',
                irrigationCode: 'NI',
                producerShare: `${share.toFixed(0)}%`,
                landUse: 'Non-cropland' as const,
            };
        });

    return [...plantedRows, ...nonCroplandRows];
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
): Promise<void> {
    const header = [
        'Farm #',
        'Tract #',
        'CLU/Field #',
        'Acreage',
        'Crop',
        'Land Use',
        'Intended Use',
        'Irrigation Practice',
        'Producer Share %',
        'Plant Date'
    ].join(',');

    const rows = buildFsa578Rows(plantRecords, fields, cluAssignments, fsaTracts).map(row => [
        sanitizeCsvValue(row.farmNumber),
        sanitizeCsvValue(row.tractNumber),
        sanitizeCsvValue(row.fieldNumber),
        sanitizeCsvValue(row.acreage),
        sanitizeCsvValue(row.crop),
        sanitizeCsvValue(row.landUse),
        sanitizeCsvValue(row.intendedUse),
        sanitizeCsvValue(row.irrigationCode),
        sanitizeCsvValue(row.producerShare),
        sanitizeCsvValue(row.date)
    ].join(','));

    const csvContent = [header, ...rows].join('\n');
    await downloadFile(csvContent, `FSA_578_Summary_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
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
