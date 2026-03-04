import { SprayRecord, Field, PlantRecord, FertilizerApplication } from '../types/farm';

export function generateMissouriLog(records: SprayRecord[], fields: Field[]) {
    const header = [
        'Date',
        'Start Time',
        'Applicator Name',
        'License #',
        'Trade Name',
        'EPA Reg #',
        'Site/Field',
        'Total Acres Treated',
        'App Rate (per ac)',
        'Total Product Applied',
        'Total Mixture Volume (Mix + Water)',
        'Equipment ID',
        'Wind Speed (mph)',
        'Wind Direction',
        'Temp (F)',
        'Relative Humidity (%)',
        'Target Pest(s)',
        'Technicians'
    ].join(',');

    const rows = records.flatMap(r => {
        const field = fields.find(f => f.id === r.fieldId);
        const treatedArea = r.treatedAreaSize || field?.acreage || '';

        // If there are granular products, create a row for each herbicide in the mix
        if (r.products && r.products.length > 0) {
            return r.products.map(p => {
                // Calculate individual product total for the treated area
                const rateNum = parseFloat(p.rate);
                const areaNum = parseFloat(treatedArea.toString());
                const productTotal = (!isNaN(rateNum) && !isNaN(areaNum))
                    ? (rateNum * areaNum).toFixed(1)
                    : '';
                const productTotalDisplay = productTotal ? `${productTotal} ${p.rateUnit}` : '';

                return [
                    r.sprayDate || new Date(r.timestamp).toLocaleDateString(),
                    r.startTime || '',
                    `"${r.applicatorName || ''}"`,
                    `"${r.licenseNumber || ''}"`,
                    `"${p.product}"`,
                    `"${p.epaRegNumber || 'N/A'}"`,
                    `"${r.fieldName}"`,
                    treatedArea,
                    `"${p.rate} ${p.rateUnit}"`, // Per-herbicide rate
                    `"${productTotalDisplay}"`, // Per-herbicide total product amount
                    `"${r.totalMixtureVolume || ''}"`, // Shared mixture volume
                    `"${r.equipmentId || ''}"`, // Machine ID
                    r.windSpeed,
                    r.windDirection || '',
                    r.temperature,
                    r.relativeHumidity || '',
                    `"${r.targetPest || ''}"`,
                    `"${r.involvedTechnicians || ''}"`
                ].join(',');
            });
        }

        // Fallback for legacy records or records without granular product breakdown
        return [[
            r.sprayDate || new Date(r.timestamp).toLocaleDateString(),
            r.startTime || '',
            `"${r.applicatorName || ''}"`,
            `"${r.licenseNumber || ''}"`,
            `"${r.product}"`,
            `"${r.epaRegNumber || ''}"`,
            `"${r.fieldName}"`,
            treatedArea,
            `"${r.mixtureRate || ''}"`,
            '', // Legacy records don't have separate product total vs mixture total
            `"${r.totalMixtureVolume || ''}"`,
            `"${r.equipmentId || ''}"`,
            r.windSpeed,
            r.windDirection || '',
            r.temperature,
            r.relativeHumidity || '',
            `"${r.targetPest || ''}"`,
            `"${r.involvedTechnicians || ''}"`
        ].join(',')];
    });

    const csvContent = [header, ...rows].join('\n');
    downloadFile(csvContent, `Missouri_Spray_Log_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

export function exportFsa578Data(plantRecords: PlantRecord[], fields: Field[]) {
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
            field?.fsaFarmNumber || '',
            field?.fsaTractNumber || '',
            field?.fsaFieldNumber || '',
            r.acreage,
            `"${r.crop || ''}"`,
            `"${r.intendedUse || field?.intendedUse || ''}"`,
            irrigationCode,
            `${shareDisplay}%`,
            r.plantDate || new Date(r.timestamp).toLocaleDateString()
        ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    downloadFile(csvContent, `FSA_578_Summary_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

export function exportHarvestData(harvestRecords: any[], fields: Field[]) {
    const header = [
        'Date',
        'Field',
        'Crop',
        'Bushels',
        'Moisture %',
        'Destination',
        'Landlord Share %',
        'Farm #',
        'Tract #'
    ].join(',');

    const rows = harvestRecords.map(r => {
        const field = fields.find(f => f.id === r.fieldId);
        return [
            r.harvestDate || new Date(r.timestamp).toLocaleDateString(),
            r.fieldName,
            `"${r.crop || ''}"`,
            r.bushels,
            r.moisturePercent,
            r.destination === 'bin' ? 'On-Farm Bin' : 'Elevator/Sale',
            r.landlordSplitPercent,
            field?.fsaFarmNumber || '',
            field?.fsaTractNumber || ''
        ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    downloadFile(csvContent, `FSA_Harvest_Report_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

export function exportFertilizerData(records: FertilizerApplication[], fields: Field[]) {
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
            r.date,
            `"${field?.name || r.fieldName || ''}"`,
            r.acres,
            `"${r.fertilizer_formula}"`,
            r.season_year
        ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    downloadFile(csvContent, `Fertilizer_Report_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

function downloadFile(content: string, fileName: string, contentType: string) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.click();
    URL.revokeObjectURL(url);
}
