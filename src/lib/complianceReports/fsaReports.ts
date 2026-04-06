import { SprayRecord, Field, PlantRecord, FertilizerApplication, HarvestRecord } from '../../types/farm';

function sanitizeCsvValue(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    // Prefix with ' if it starts with injection characters
    if (/^[=+\-@\t\r]/.test(str)) return `"'${str}"`;
    return `"${str}"`;
}

function formatFsaDate(val: string | number | null | undefined): string {
    if (!val) return '';
    let d: Date;
    if (val instanceof Date) {
        d = val;
    } else if (typeof val === 'number') {
        d = new Date(val);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        // Date-only string (YYYY-MM-DD) — parse as local to avoid UTC timezone shift
        const [y, m, day] = val.split('-').map(Number);
        d = new Date(y, m - 1, day);
    } else {
        d = new Date(val);
    }
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
}

export function generateMissouriLogRows(records: SprayRecord[], fields: Field[]): string[] {
    return records.flatMap(r => {
        const field = fields.find(f => f.id === r.fieldId);
        const treatedArea = (r.treatedAreaSize !== undefined && r.treatedAreaSize !== null && r.treatedAreaSize !== '') ? r.treatedAreaSize : (field?.acreage || '');

        // If there are granular products, create a row for each herbicide in the mix
        if (r.products && r.products.length > 0) {
            return r.products.map((p: any) => {
                // Calculate individual product total for the treated area
                const rateNum = parseFloat(p.rate);
                const areaNum = parseFloat(treatedArea.toString());
                const productTotal = (!isNaN(rateNum) && !isNaN(areaNum))
                    ? (rateNum * areaNum).toFixed(1)
                    : '';
                const productTotalDisplay = productTotal ? `${productTotal} ${p.rateUnit}` : '';

                return [
                    sanitizeCsvValue(r.sprayDate || formatFsaDate(r.timestamp)),
                    sanitizeCsvValue(r.startTime),
                    sanitizeCsvValue(r.applicatorName),
                    sanitizeCsvValue(r.licenseNumber),
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
                    sanitizeCsvValue(r.involvedTechnicians)
                ].join(',');
            });
        }

        // Fallback for legacy records or records without granular product breakdown
        return [[
            sanitizeCsvValue(r.sprayDate || formatFsaDate(r.timestamp)),
            sanitizeCsvValue(r.startTime),
            sanitizeCsvValue(r.applicatorName),
            sanitizeCsvValue(r.licenseNumber),
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
            sanitizeCsvValue(r.involvedTechnicians)
        ].join(',')];
    });
}

export function generateMissouriLog(records: SprayRecord[], fields: Field[]) {
    const header = [
        'Date', 'Start Time', 'Applicator Name', 'License #', 'Trade Name', 'EPA Reg #',
        'Site/Field', 'Total Acres Treated', 'App Rate (per ac)', 'Total Product Applied',
        'Total Mixture Volume (Mix + Water)', 'Equipment ID', 'Wind Speed (mph)',
        'Wind Direction', 'Temp (F)', 'Relative Humidity (%)', 'Target Pest(s)', 'Technicians'
    ].join(',');

    const rows = generateMissouriLogRows(records, fields);
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

    // Sort plantRecords by FSA farm/tract/field for consistent CSV output
    const sortedRecords = [...plantRecords].sort((a, b) => {
        const fA = fields.find(f => f.id === a.fieldId);
        const fB = fields.find(f => f.id === b.fieldId);
        const farmA = a.fsaFarmNumber || fA?.fsaFarmNumber || '';
        const farmB = b.fsaFarmNumber || fB?.fsaFarmNumber || '';
        const cmpFarm = farmA.localeCompare(farmB);
        if (cmpFarm !== 0) return cmpFarm;
        const tractA = a.fsaTractNumber || fA?.fsaTractNumber || '';
        const tractB = b.fsaTractNumber || fB?.fsaTractNumber || '';
        const cmpTract = tractA.localeCompare(tractB);
        if (cmpTract !== 0) return cmpTract;
        const fieldA = a.fsaFieldNumber || fA?.fsaFieldNumber || '';
        const fieldB = b.fsaFieldNumber || fB?.fsaFieldNumber || '';
        return fieldA.localeCompare(fieldB);
    });

    const rows = sortedRecords.map(r => {
        const field = fields.find(f => f.id === r.fieldId);

        // FSA 578 uses IR for Irrigated, NI for Non-Irrigated
        const irrigation = r.irrigationPractice || field?.irrigationPractice || 'Non-Irrigated';
        const irrigationCode = irrigation === 'Irrigated' ? 'IR' : 'NI';

        const share = r.producerShare ?? field?.producerShare ?? 100;
        const shareDisplay = share.toFixed(0);

        return [
            sanitizeCsvValue(r.fsaFarmNumber || field?.fsaFarmNumber),
            sanitizeCsvValue(r.fsaTractNumber || field?.fsaTractNumber),
            sanitizeCsvValue(r.fsaFieldNumber || field?.fsaFieldNumber),
            sanitizeCsvValue(r.acreage),
            sanitizeCsvValue(r.crop),
            sanitizeCsvValue(r.intendedUse || field?.intendedUse),
            sanitizeCsvValue(irrigationCode),
            sanitizeCsvValue(`${shareDisplay}%`),
            sanitizeCsvValue(r.plantDate ? formatFsaDate(r.plantDate) : formatFsaDate(r.timestamp))
        ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    downloadFile(csvContent, `FSA_578_Summary_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

export function exportHarvestData(harvestRecords: HarvestRecord[], fields: Field[]) {
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
            sanitizeCsvValue(r.harvestDate || formatFsaDate(r.timestamp)),
            sanitizeCsvValue(r.fieldName),
            sanitizeCsvValue(r.crop),
            sanitizeCsvValue(r.bushels),
            sanitizeCsvValue(r.moisturePercent),
            sanitizeCsvValue(r.destination === 'bin' ? 'On-Farm Bin' : 'Elevator/Sale'),
            sanitizeCsvValue(r.landlordSplitPercent),
            sanitizeCsvValue(r.landlordName),
            sanitizeCsvValue(r.scaleTicketNumber),
            sanitizeCsvValue(r.fsaFarmNumber || field?.fsaFarmNumber),
            sanitizeCsvValue(r.fsaTractNumber || field?.fsaTractNumber)
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
            sanitizeCsvValue(r.date),
            sanitizeCsvValue(field?.name || r.fieldName),
            sanitizeCsvValue(r.acres),
            sanitizeCsvValue(r.fertilizer_formula),
            sanitizeCsvValue(r.seasonYear)
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
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
