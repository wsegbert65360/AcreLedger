import { Capacitor } from '@capacitor/core';
import { Encoding } from '@capacitor/filesystem';

import { native } from '@/lib/native';
import { SprayRecord, Field, PlantRecord, FertilizerApplication, HarvestRecord } from '../../types/farm';
import { formatTotalAmount } from '../../utils/unitConversion';

function sanitizeCsvValue(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    // Prefix with ' if it starts with injection characters
    if (/^[=+\-@\t\r]/.test(str)) return `"'${str}"`;
    return `"${str}"`;
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

export async function exportFsa578Data(plantRecords: PlantRecord[], fields: Field[]): Promise<void> {
    const header = [
        'Farm #',
        'Tract #',
        'Field #',
        'Acreage',
        'Crop',
        'Intended Use',
        'Irrigation Practice',
        'Producer Share %',
        'Plant Date'
    ].join(',');

    const rows = plantRecords.map(r => {
        const field = fields.find(f => f.id === r.fieldId);

        // FSA 578 uses IR for Irrigated, NI for Non-Irrigated
        const irrigation = r.irrigationPractice || field?.irrigationPractice || 'Non-Irrigated';
        const irrigationCode = irrigation === 'Irrigated' ? 'IR' : 'NI';

        const share = r.producerShare ?? field?.producerShare ?? 100;
        const shareDisplay = share.toFixed(0);

        return [
            sanitizeCsvValue(field?.fsaFarmNumber),
            sanitizeCsvValue(field?.fsaTractNumber),
            sanitizeCsvValue(field?.fsaFieldNumber),
            sanitizeCsvValue(r.acreage),
            sanitizeCsvValue(r.crop),
            sanitizeCsvValue(r.intendedUse || field?.intendedUse),
            sanitizeCsvValue(irrigationCode),
            sanitizeCsvValue(`${shareDisplay}%`),
            sanitizeCsvValue(r.plantDate || new Date(r.timestamp).toLocaleDateString())
        ].join(',');
    });

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
            encoding: Encoding.UTF8
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
