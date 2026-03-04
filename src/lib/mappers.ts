import {
    PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord,
    GrainMovement, Field, Bin, SavedSeed, SprayRecipe, FertilizerApplication
} from '../types/farm';

export const mapPlantFromDb = (db: any): PlantRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    seedVariety: db.seed_variety,
    acreage: db.acreage,
    crop: db.crop,
    plantDate: db.plant_date,
    fsaFarmNumber: db.fsa_farm_number,
    fsaTractNumber: db.fsa_tract_number,
    fsaFieldNumber: db.fsa_field_number,
    intendedUse: db.intended_use,
    producerShare: db.producer_share,
    irrigationPractice: db.irrigation_practice,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapSprayFromDb = (db: any): SprayRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    product: db.product,
    products: db.products,
    windSpeed: db.wind_speed,
    temperature: db.temperature,
    sprayDate: db.spray_date,
    startTime: db.start_time,
    equipmentId: db.equipment_id,
    applicatorName: db.applicator_name,
    licenseNumber: db.license_number,
    epaRegNumber: db.epa_reg_number,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at,
    targetPest: db.target_pest,
    windDirection: db.wind_direction,
    relativeHumidity: db.relative_humidity,
    treatedAreaSize: db.treated_area_size,
    totalAmountApplied: db.total_amount_applied,
    involvedTechnicians: db.involved_technicians,
    mixtureRate: db.mixture_rate,
    totalMixtureVolume: db.total_mixture_volume
});

export const mapHarvestFromDb = (db: any): HarvestRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    destination: db.destination,
    binId: db.bin_id,
    bushels: db.bushels,
    moisturePercent: db.moisture_percent,
    landlordSplitPercent: db.landlord_split_percent,
    harvestDate: db.harvest_date,
    fsaFarmNumber: db.fsa_farm_number,
    fsaTractNumber: db.fsa_tract_number,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    crop: db.crop,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapHayFromDb = (db: any): HayHarvestRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    date: db.date,
    baleCount: db.bale_count,
    cuttingNumber: db.cutting_number,
    baleType: db.bale_type,
    temperature: db.temperature,
    conditions: db.conditions,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapGrainFromDb = (db: any): GrainMovement => ({
    id: db.id,
    binId: db.bin_id,
    binName: db.bin_name,
    type: db.type,
    bushels: db.bushels,
    moisturePercent: db.moisture_percent,
    sourceFieldName: db.source_field_name,
    destination: db.destination,
    price: db.price,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapFieldFromDb = (db: any): Field => ({
    id: db.id,
    name: db.name,
    acreage: db.acreage,
    lat: db.lat,
    lng: db.lng,
    fsaFarmNumber: db.fsa_farm_number,
    fsaTractNumber: db.fsa_tract_number,
    fsaFieldNumber: db.fsa_field_number,
    producerShare: db.producer_share,
    irrigationPractice: db.irrigation_practice,
    intendedUse: db.intended_use,
    boundary: db.boundary,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapBinFromDb = (db: any): Bin => ({
    id: db.id,
    name: db.name,
    capacity: db.capacity,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapSeedFromDb = (db: any): SavedSeed => ({
    id: db.id,
    name: db.name,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapRecipeFromDb = (db: any): SprayRecipe => ({
    id: db.id,
    name: db.name,
    products: db.products,
    applicatorName: db.applicator_name,
    licenseNumber: db.license_number,
    targetPest: db.target_pest,
    epaRegNumber: db.epa_reg_number,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at
});

export const mapFertilizerFromDb = (db: any): FertilizerApplication => ({
    id: db.id,
    farm_id: db.farm_id,
    fieldId: db.field_id,
    fieldName: db.fields?.name || db.field_name || 'Unknown Field',
    date: db.date,
    acres: Number(db.acres),
    fertilizer_formula: db.fertilizer_formula,
    created_at: db.created_at,
    updated_at: db.updated_at,
    deleted_at: db.deleted_at,
    season_year: db.season_year
});

// --- Reverse Mappers (Frontend -> DB) ---

export const mapPlantToDb = (r: PlantRecord) => ({
    id: r.id,
    farm_id: r.farm_id,
    field_id: r.fieldId,
    field_name: r.fieldName,
    seed_variety: r.seedVariety,
    acreage: r.acreage,
    crop: r.crop,
    plant_date: r.plantDate,
    fsa_farm_number: r.fsaFarmNumber,
    fsa_tract_number: r.fsaTractNumber,
    fsa_field_number: r.fsaFieldNumber,
    intended_use: r.intendedUse,
    producer_share: r.producerShare,
    irrigation_practice: r.irrigationPractice,
    season_year: r.seasonYear,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
    deleted_at: r.deleted_at
});

export const mapSprayToDb = (r: SprayRecord) => ({
    id: r.id,
    farm_id: r.farm_id,
    field_id: r.fieldId,
    field_name: r.fieldName,
    product: r.product,
    products: r.products,
    wind_speed: r.windSpeed,
    temperature: r.temperature,
    spray_date: r.sprayDate,
    start_time: r.startTime,
    equipment_id: r.equipmentId,
    applicator_name: r.applicatorName,
    license_number: r.licenseNumber,
    epa_reg_number: r.epaRegNumber,
    season_year: r.seasonYear,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
    deleted_at: r.deleted_at,
    target_pest: r.targetPest,
    wind_direction: r.windDirection,
    relative_humidity: r.relativeHumidity,
    treated_area_size: r.treatedAreaSize,
    total_amount_applied: r.totalAmountApplied,
    involved_technicians: r.involvedTechnicians,
    mixture_rate: r.mixtureRate,
    total_mixture_volume: r.totalMixtureVolume
});

export const mapHarvestToDb = (r: HarvestRecord) => ({
    id: r.id,
    farm_id: r.farm_id,
    field_id: r.fieldId,
    field_name: r.fieldName,
    destination: r.destination,
    bin_id: r.binId,
    bushels: r.bushels,
    moisture_percent: r.moisturePercent,
    landlord_split_percent: r.landlordSplitPercent,
    harvest_date: r.harvestDate,
    fsa_farm_number: r.fsaFarmNumber,
    fsa_tract_number: r.fsaTractNumber,
    season_year: r.seasonYear,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
    crop: r.crop,
    deleted_at: r.deleted_at
});

export const mapHayToDb = (r: HayHarvestRecord) => ({
    id: r.id,
    farm_id: r.farm_id,
    field_id: r.fieldId,
    field_name: r.fieldName,
    date: r.date,
    bale_count: r.baleCount,
    cutting_number: r.cuttingNumber,
    bale_type: r.baleType,
    temperature: r.temperature,
    conditions: r.conditions,
    season_year: r.seasonYear,
    timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
    deleted_at: r.deleted_at
});

export const mapGrainToDb = (m: GrainMovement) => ({
    id: m.id,
    farm_id: m.farm_id,
    bin_id: m.binId,
    bin_name: m.binName,
    type: m.type,
    bushels: m.bushels,
    moisture_percent: m.moisturePercent,
    source_field_name: m.sourceFieldName,
    destination: m.destination,
    price: m.price,
    season_year: m.seasonYear,
    timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
    deleted_at: m.deleted_at
});

export const mapFieldToDb = (f: Field) => ({
    id: f.id,
    farm_id: f.farm_id,
    name: f.name,
    acreage: f.acreage,
    lat: f.lat,
    lng: f.lng,
    fsa_farm_number: f.fsaFarmNumber,
    fsa_tract_number: f.fsaTractNumber,
    fsa_field_number: f.fsaFieldNumber,
    producer_share: f.producerShare,
    irrigation_practice: f.irrigationPractice,
    intended_use: f.intendedUse,
    boundary: f.boundary,
    deleted_at: f.deleted_at
});

export const mapBinToDb = (b: Bin) => ({
    id: b.id,
    farm_id: b.farm_id,
    name: b.name,
    capacity: b.capacity,
    deleted_at: b.deleted_at
});

export const mapSeedToDb = (s: SavedSeed) => ({
    id: s.id,
    farm_id: s.farm_id,
    name: s.name,
    deleted_at: s.deleted_at
});

export const mapRecipeToDb = (r: SprayRecipe) => ({
    id: r.id,
    farm_id: r.farm_id,
    name: r.name,
    products: r.products,
    applicator_name: r.applicatorName,
    license_number: r.licenseNumber,
    target_pest: r.targetPest,
    epa_reg_number: r.epaRegNumber,
    deleted_at: r.deleted_at
});

export const mapFertilizerToDb = (r: FertilizerApplication) => ({
    id: r.id,
    farm_id: r.farm_id,
    field_id: r.fieldId,
    date: r.date,
    acres: r.acres,
    fertilizer_formula: r.fertilizer_formula,
    season_year: r.season_year,
    deleted_at: r.deleted_at
});
