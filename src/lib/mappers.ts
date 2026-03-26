import {
    PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord,
    GrainMovement, Field, Bin, SavedSeed, SprayRecipe, FertilizerApplication,
    SprayRecipeProduct, FertilizerRecipe, TillageRecord
} from '../types/farm';
import {
    PlantRecordRow, SprayRecordRow, HarvestRecordRow, HayHarvestRow,
    GrainMovementRow, FieldRow, BinRow, SavedSeedRow, SprayRecipeRow,
    FertilizerApplicationRow, FertilizerRecipeRow, TillageRecordRow
} from '../types/database';

export const mapFieldFromDb = (db: FieldRow): Field => ({
    id: db.id,
    name: db.name,
    acreage: db.acreage,
    lat: db.lat,
    lng: db.lng,
    fsaFarmNumber: db.fsa_farm_number ?? '',
    fsaTractNumber: db.fsa_tract_number ?? '',
    fsaFieldNumber: db.fsa_field_number ?? '',
    producerShare: db.producer_share ?? undefined,
    irrigationPractice: db.irrigation_practice as 'Irrigated' | 'Non-Irrigated',
    intendedUse: db.intended_use ?? '',
    boundary: db.boundary as Field['boundary'],
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null,
    notes: db.notes ?? ''
});

export const mapPlantFromDb = (db: PlantRecordRow): PlantRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    seedVariety: db.seed_variety,
    acreage: db.acreage,
    crop: db.crop ?? '',
    plantDate: db.plant_date,
    fsaFarmNumber: db.fsa_farm_number ?? '',
    fsaTractNumber: db.fsa_tract_number ?? '',
    fsaFieldNumber: db.fsa_field_number ?? '',
    intendedUse: db.intended_use ?? '',
    producerShare: db.producer_share ?? undefined,
    irrigationPractice: db.irrigation_practice as 'Irrigated' | 'Non-Irrigated',
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapSprayFromDb = (db: SprayRecordRow): SprayRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    products: db.products as SprayRecipeProduct[],
    windSpeed: db.wind_speed,
    temperature: db.temperature,
    sprayDate: db.spray_date,
    startTime: db.start_time,
    equipmentId: db.equipment_id ?? undefined,
    applicatorName: db.applicator_name,
    licenseNumber: db.license_number,
    epaRegNumber: db.epa_reg_number,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null,
    targetPest: db.target_pest ?? '',
    windDirection: db.wind_direction ?? '',
    relativeHumidity: db.relative_humidity ?? undefined,
    treatedAreaSize: Number(db.treated_area_size ?? 0),
    totalAmountApplied: Number(db.total_amount_applied ?? 0),
    involvedTechnicians: db.involved_technicians ?? '',
    mixtureRate: db.mixture_rate ?? '',
    totalMixtureVolume: db.total_mixture_volume ?? '',
    siteAddress: db.site_address ?? '',
    isPremixed: db.is_premixed ?? false,
    nonCompliant: db.non_compliant ?? false
});

export const mapHarvestFromDb = (db: HarvestRecordRow): HarvestRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    destination: db.destination as 'bin' | 'town',
    binId: db.bin_id ?? undefined,
    bushels: db.bushels,
    moisturePercent: db.moisture_percent,
    landlordSplitPercent: db.landlord_split_percent,
    harvestDate: db.harvest_date,
    fsaFarmNumber: db.fsa_farm_number ?? '',
    fsaTractNumber: db.fsa_tract_number ?? '',
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    crop: db.crop ?? '',
    landlordName: db.landlord_name ?? '',
    scaleTicketNumber: db.scale_ticket_number ?? '',
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapHayFromDb = (db: HayHarvestRow): HayHarvestRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    date: db.date,
    baleCount: db.bale_count,
    cuttingNumber: db.cutting_number,
    baleType: db.bale_type as 'Round' | 'Square',
    temperature: db.temperature,
    conditions: db.conditions,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapGrainFromDb = (db: GrainMovementRow): GrainMovement => ({
    id: db.id,
    farm_id: db.farm_id,
    binId: db.bin_id,
    binName: db.bin_name,
    type: db.type as 'in' | 'out',
    bushels: db.bushels,
    moisturePercent: db.moisture_percent,
    sourceFieldName: db.source_field_name,
    destination: db.destination,
    price: db.price ?? undefined,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    deleted_at: db.deleted_at ?? null
});

export const mapBinFromDb = (db: BinRow): Bin => ({
    id: db.id,
    name: db.name,
    capacity: db.capacity,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapSeedFromDb = (db: SavedSeedRow): SavedSeed => ({
    id: db.id,
    name: db.name,
    crop: db.crop || '',
    variety: db.variety || '',
    supplier: db.supplier || '',
    lotNumber: db.lot_number || '',
    year: db.year || new Date().getFullYear(),
    notes: db.notes || '',
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapRecipeFromDb = (db: SprayRecipeRow): SprayRecipe => ({
    id: db.id,
    name: db.name,
    products: db.products as SprayRecipeProduct[],
    applicatorName: db.applicator_name ?? '',
    licenseNumber: db.license_number ?? '',
    targetPest: db.target_pest ?? '',
    epaRegNumber: db.epa_reg_number ?? '',
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapFertilizerRecipeFromDb = (db: FertilizerRecipeRow): FertilizerRecipe => ({
    id: db.id,
    name: db.name,
    npkRatio: db.npk_ratio,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapFertilizerFromDb = (db: FertilizerApplicationRow): FertilizerApplication => ({
    id: db.id,
    farm_id: db.farm_id,
    fieldId: db.field_id,
    fieldName: db.fields?.name || db.field_name || 'Unknown Field',
    date: db.date,
    acres: Number(db.acres),
    fertilizer_formula: db.fertilizer_formula,
    timestamp: new Date(db.created_at || db.date).getTime(),
    created_at: db.created_at,
    updated_at: db.updated_at,
    deleted_at: db.deleted_at ?? null,
    seasonYear: db.season_year
});

export const mapTillageFromDb = (db: TillageRecordRow): TillageRecord => ({
    id: db.id,
    farm_id: db.farm_id,
    fieldId: db.field_id,
    fieldName: (db as any).fields?.name || (db as any).field_name || 'Unknown Field',
    date: db.date,
    implementType: db.implement_type,
    notes: db.notes ?? '',
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    deleted_at: db.deleted_at ?? null
});

// --- Helper for Validation ---

function validateRequired(obj: any, fields: string[], mapperName: string) {
    for (const field of fields) {
        if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
            throw new Error(`[Mapper Error] ${mapperName}: Missing required field "${field}"`);
        }
    }
}

// --- Reverse Mappers (Frontend -> DB) ---

export function baseMapToDb<T extends Record<string, any>>(obj: T, requiredFields: string[], allowedKeys: (keyof T)[], mapperName: string): any {
    validateRequired(obj, requiredFields, mapperName);
    const dbRecord: any = {};
    for (const key of allowedKeys) {
        const value = obj[key];
        if (value === undefined && key !== 'timestamp') continue;

        if (key === 'timestamp') {
            dbRecord[key as string] = value ? new Date(value as number).toISOString() : new Date().toISOString();
        } else {
            const snakeKey = (key as string).replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            dbRecord[snakeKey] = value;
        }
    }
    return dbRecord;
}

export const mapFieldToDb = (f: Field) => baseMapToDb(f, ['id', 'farm_id', 'name'], [
    'id', 'farm_id', 'name', 'acreage', 'lat', 'lng', 'fsaFarmNumber', 'fsaTractNumber',
    'fsaFieldNumber', 'producerShare', 'irrigationPractice', 'intendedUse', 'boundary',
    'deleted_at', 'notes'
], 'mapFieldToDb');

export const mapPlantToDb = (r: PlantRecord) => baseMapToDb(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], [
    'id', 'farm_id', 'fieldId', 'fieldName', 'seedVariety', 'acreage', 'crop', 'plantDate',
    'fsaFarmNumber', 'fsaTractNumber', 'fsaFieldNumber', 'intendedUse', 'producerShare',
    'irrigationPractice', 'seasonYear', 'timestamp', 'deleted_at'
], 'mapPlantToDb');

export const mapSprayToDb = (r: SprayRecord) => baseMapToDb(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], [
    'id', 'farm_id', 'fieldId', 'fieldName', 'products', 'windDirection', 'relativeHumidity',
    'treatedAreaSize', 'totalAmountApplied', 'involvedTechnicians', 'mixtureRate',
    'totalMixtureVolume', 'siteAddress', 'isPremixed', 'equipmentId', 'nonCompliant',
    'deleted_at'
], 'mapSprayToDb');

export const mapHarvestToDb = (r: HarvestRecord) => baseMapToDb(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], [
    'id', 'farm_id', 'fieldId', 'fieldName', 'destination', 'binId', 'bushels',
    'moisturePercent', 'landlordSplitPercent', 'landlordName', 'scaleTicketNumber',
    'harvestDate', 'fsaFarmNumber', 'fsaTractNumber', 'seasonYear', 'timestamp', 'crop',
    'deleted_at'
], 'mapHarvestToDb');

export const mapHayToDb = (r: HayHarvestRecord) => baseMapToDb(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], [
    'id', 'farm_id', 'fieldId', 'fieldName', 'date', 'baleCount', 'cuttingNumber', 'baleType',
    'temperature', 'conditions', 'seasonYear', 'timestamp', 'deleted_at'
], 'mapHayToDb');

export const mapGrainToDb = (m: GrainMovement) => baseMapToDb(m, ['id', 'farm_id', 'binId', 'seasonYear'], [
    'id', 'farm_id', 'binId', 'binName', 'type', 'bushels', 'moisturePercent', 'sourceFieldName',
    'destination', 'price', 'seasonYear', 'timestamp', 'deleted_at'
], 'mapGrainToDb');

export const mapBinToDb = (b: Bin) => baseMapToDb(b, ['id', 'farm_id', 'name'], [
    'id', 'farm_id', 'name', 'capacity', 'deleted_at'
], 'mapBinToDb');

export const mapSeedToDb = (s: SavedSeed): Partial<SavedSeedRow> => {
    return baseMapToDb(s, ['farm_id', 'name'], [
        'name', 'crop', 'variety', 'supplier', 'lotNumber', 'year', 'notes', 'farm_id'
    ], 'mapSeedToDb');
};

export const mapRecipeToDb = (r: SprayRecipe) => baseMapToDb(r, ['id', 'farm_id', 'name'], [
    'id', 'farm_id', 'name', 'products', 'applicatorName', 'licenseNumber', 'targetPest',
    'epaRegNumber', 'deleted_at'
], 'mapRecipeToDb');

export const mapFertilizerRecipeToDb = (r: FertilizerRecipe) => baseMapToDb(r, ['id', 'farm_id', 'name'], [
    'id', 'farm_id', 'name', 'npkRatio', 'deleted_at'
], 'mapFertilizerRecipeToDb');

export const mapFertilizerToDb = (r: FertilizerApplication) => baseMapToDb(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], [
    'id', 'farm_id', 'fieldId', 'fieldName', 'date', 'fertilizer_formula', 'acres', 'seasonYear',
    'deleted_at'
], 'mapFertilizerToDb');

export const mapTillageToDb = (r: TillageRecord) => baseMapToDb(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], [
    'id', 'farm_id', 'fieldId', 'fieldName', 'date', 'implementType', 'notes', 'seasonYear',
    'timestamp', 'deleted_at'
], 'mapTillageToDb');
