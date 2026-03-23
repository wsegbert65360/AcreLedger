import {
    PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord,
    GrainMovement, Field, Bin, SavedSeed, SprayRecipe, FertilizerApplication,
    SprayRecipeProduct
} from '../types/farm';
import {
    PlantRecordRow, SprayRecordRow, HarvestRecordRow, HayHarvestRow,
    GrainMovementRow, FieldRow, BinRow, SavedSeedRow, SprayRecipeRow,
    FertilizerApplicationRow
} from '../types/database';

export const mapFieldFromDb = (db: FieldRow): Field => ({
    id: db.id,
    name: db.name,
    acreage: db.acreage,
    lat: db.lat,
    lng: db.lng,
    fsaFarmNumber: db.fsa_farm_number ?? undefined,
    fsaTractNumber: db.fsa_tract_number ?? undefined,
    fsaFieldNumber: db.fsa_field_number ?? undefined,
    producerShare: db.producer_share ?? undefined,
    irrigationPractice: db.irrigation_practice as 'Irrigated' | 'Non-Irrigated',
    intendedUse: db.intended_use ?? undefined,
    boundary: db.boundary as Field['boundary'],
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null,
    notes: db.notes ?? undefined
});

export const mapPlantFromDb = (db: PlantRecordRow): PlantRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: db.field_name,
    seedVariety: db.seed_variety,
    acreage: db.acreage,
    crop: db.crop,
    plantDate: db.plant_date,
    fsaFarmNumber: db.fsa_farm_number ?? undefined,
    fsaTractNumber: db.fsa_tract_number ?? undefined,
    fsaFieldNumber: db.fsa_field_number ?? undefined,
    intendedUse: db.intended_use ?? undefined,
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
    targetPest: db.target_pest ?? undefined,
    windDirection: db.wind_direction ?? undefined,
    relativeHumidity: db.relative_humidity ?? undefined,
    treatedAreaSize: Number(db.treated_area_size ?? 0),
    totalAmountApplied: Number(db.total_amount_applied ?? 0),
    involvedTechnicians: db.involved_technicians ?? undefined,
    mixtureRate: db.mixture_rate ?? undefined,
    totalMixtureVolume: db.total_mixture_volume ?? undefined,
    siteAddress: db.site_address ?? undefined,
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
    fsaFarmNumber: db.fsa_farm_number ?? undefined,
    fsaTractNumber: db.fsa_tract_number ?? undefined,
    seasonYear: db.season_year,
    timestamp: new Date(db.timestamp).getTime(),
    crop: db.crop,
    landlordName: db.landlord_name ?? undefined,
    scaleTicketNumber: db.scale_ticket_number ?? undefined,
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
    crop: db.crop || '—',
    variety: db.variety || '—',
    supplier: db.supplier || '—',
    lotNumber: db.lot_number || '—',
    year: db.year || new Date().getFullYear(),
    notes: db.notes || '',
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapRecipeFromDb = (db: SprayRecipeRow): SprayRecipe => ({
    id: db.id,
    name: db.name,
    products: db.products as SprayRecipeProduct[],
    applicatorName: db.applicator_name ?? undefined,
    licenseNumber: db.license_number ?? undefined,
    targetPest: db.target_pest ?? undefined,
    epaRegNumber: db.epa_reg_number ?? undefined,
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

// --- Reverse Mappers (Frontend -> DB) ---

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
    deleted_at: f.deleted_at,
    notes: f.notes
});

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
    products: r.products,
    wind_direction: r.windDirection,
    relative_humidity: r.relativeHumidity,
    treated_area_size: r.treatedAreaSize,
    total_amount_applied: r.totalAmountApplied,
    involved_technicians: r.involvedTechnicians,
    mixture_rate: r.mixtureRate,
    total_mixture_volume: r.totalMixtureVolume,
    site_address: r.siteAddress,
    is_premixed: r.isPremixed,
    equipment_id: r.equipmentId,
    non_compliant: r.nonCompliant,
    deleted_at: r.deleted_at
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
    landlord_name: r.landlordName,
    scale_ticket_number: r.scaleTicketNumber,
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

export const mapBinToDb = (b: Bin) => ({
    id: b.id,
    farm_id: b.farm_id,
    name: b.name,
    capacity: b.capacity,
    deleted_at: b.deleted_at
});

export const mapSeedToDb = (s: SavedSeed): Partial<SavedSeedRow> => ({
    name: s.name,
    crop: s.crop,
    variety: s.variety,
    supplier: s.supplier,
    lot_number: s.lotNumber,
    year: s.year,
    notes: s.notes,
    farm_id: s.farm_id
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
    field_name: r.fieldName,
    date: r.date,
    fertilizer_formula: r.fertilizer_formula,
    acres: r.acres,
    season_year: r.seasonYear,
    deleted_at: r.deleted_at
});
