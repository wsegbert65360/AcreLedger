import {
    PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord,
    GrainMovement, Field, Bin, SavedSeed, SprayRecipe, FertilizerApplication,
    SprayRecipeProduct, FertilizerRecipe, TillageRecord
} from '../types/farm';
import {
    PlantRecordRow, SprayRecordRow, HarvestRecordRow, HayHarvestRow,
    GrainMovementRow, FieldRow, BinRow, SavedSeedRow, SprayRecipeRow,
    FertilizerApplicationRow, FertilizerRecipeRow, TillageRecordRow,
    FsaTractImportRow, FieldCluAssignmentRow
} from '../types/database';
import type { FsaTractImport, FieldCluAssignment } from '../types/fsaTract';
import {
    fieldSchema, binSchema, plantRecordSchema, sprayRecordSchema,
    harvestRecordSchema, hayHarvestRecordSchema, grainMovementSchema,
    savedSeedSchema, fertilizerRecipeSchema, sprayRecipeSchema,
    fertilizerApplicationSchema, tillageRecordSchema,
    fsaTractImportSchema, fieldCluAssignmentSchema
} from './backupSchema';

// --- Safe Mapping Helpers (Runtime Validation) ---

function safeNum(val: any, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

function safeStr(val: any, fallback = ''): string {
    return val === null || val === undefined ? fallback : String(val);
}

function safeTimestamp(val: any): number {
    if (val == null) return 0;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

export const mapFieldFromDb = (db: FieldRow): Field => ({
    id: db.id,
    name: safeStr(db.name, 'Unnamed Field'),
    acreage: safeNum(db.acreage),
    lat: db.lat ?? null,
    lng: db.lng ?? null,
    fsaFarmNumber: safeStr(db.fsa_farm_number),
    fsaTractNumber: safeStr(db.fsa_tract_number),
    fsaFieldNumber: safeStr(db.fsa_field_number),
    producerShare: db.producer_share ?? undefined,
    irrigationPractice: (db.irrigation_practice || 'Non-Irrigated') as 'Irrigated' | 'Non-Irrigated',
    intendedUse: safeStr(db.intended_use),
    boundary: db.boundary as Field['boundary'],
    cluNumbers: (db.clu_numbers as string[] | undefined) ?? undefined,
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null,
    notes: safeStr(db.notes)
});

export const mapPlantFromDb = (db: PlantRecordRow): PlantRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    seedVariety: safeStr(db.seed_variety, 'Unknown Variety'),
    acreage: safeNum(db.acreage),
    crop: safeStr(db.crop),
    plantDate: safeStr(db.plant_date),
    fsaFarmNumber: safeStr(db.fsa_farm_number),
    fsaTractNumber: safeStr(db.fsa_tract_number),
    fsaFieldNumber: safeStr(db.fsa_field_number),
    intendedUse: safeStr(db.intended_use),
    producerShare: db.producer_share ?? undefined,
    irrigationPractice: (db.irrigation_practice || 'Non-Irrigated') as 'Irrigated' | 'Non-Irrigated',
    cropStatus: (db.crop_status || 'Planted') as PlantRecord['cropStatus'],
    cropSequence: (db.crop_sequence || 'First Crop') as PlantRecord['cropSequence'],
    plantingPattern: safeStr(db.planting_pattern) || undefined,
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null,
    memo: safeStr(db.memo) || undefined
});

export const mapSprayFromDb = (db: SprayRecordRow): SprayRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    products: (db.products || []) as SprayRecipeProduct[],
    windSpeed: safeNum(db.wind_speed),
    temperature: safeNum(db.temperature),
    sprayDate: db.spray_date || undefined,
    startTime: db.start_time || undefined,
    endTime: db.end_time ?? undefined,
    equipmentId: db.equipment_id ?? undefined,
    applicatorName: safeStr(db.applicator_name),
    licenseNumber: safeStr(db.license_number),
    epaRegNumber: safeStr(db.epa_reg_number),
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null,
    targetPest: safeStr(db.target_pest),
    windDirection: safeStr(db.wind_direction),
    relativeHumidity: db.relative_humidity ?? undefined,
    treatedAreaSize: safeNum(db.treated_area_size),
    treatedAreaUnit: safeStr(db.treated_area_unit, 'ac'),
    totalAmountApplied: safeNum(db.total_amount_applied),
    involvedTechnicians: safeStr(db.involved_technicians),
    mixtureRate: safeStr(db.mixture_rate),
    totalMixtureVolume: safeStr(db.total_mixture_volume),
    siteAddress: safeStr(db.site_address),
    cropOrSiteTreated: db.crop_or_site_treated ?? undefined,
    applicationMethod: db.application_method ?? undefined,
    rei: db.rei ?? undefined,
    notes: safeStr(db.notes),
    complianceProfile: (db.compliance_profile || 'universal') as SprayRecord['complianceProfile'],
    isPremixed: !!db.is_premixed,
    nonCompliant: !!db.non_compliant,
    nozzleType: db.nozzle_type ?? undefined,
    nozzleSize: db.nozzle_size ?? undefined,
    pressurePsi: db.pressure_psi ?? undefined,
    boomHeight: db.boom_height ?? undefined,
    actualSpeed: db.actual_speed ?? undefined,
    windSpeedEnd: db.wind_speed_end ?? undefined,
    windDirectionEnd: db.wind_direction_end ?? undefined,
    tempEnd: db.temp_end ?? undefined,
    sensitiveAreaCheck: !!db.sensitive_area_check,
    sensitiveAreaNotes: db.sensitive_area_notes ?? undefined
});

export const mapHarvestFromDb = (db: HarvestRecordRow): HarvestRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    destination: (db.destination || 'bin') as 'bin' | 'town',
    binId: db.bin_id ?? undefined,
    bushels: safeNum(db.bushels),
    moisturePercent: safeNum(db.moisture_percent, 15.0),
    landlordSplitPercent: safeNum(db.landlord_split_percent, 100),
    harvestDate: safeStr(db.harvest_date),
    fsaFarmNumber: safeStr(db.fsa_farm_number),
    fsaTractNumber: safeStr(db.fsa_tract_number),
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    crop: safeStr(db.crop),
    landlordName: safeStr(db.landlord_name),
    scaleTicketNumber: safeStr(db.scale_ticket_number),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapHayFromDb = (db: HayHarvestRow): HayHarvestRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    date: safeStr(db.date),
    baleCount: safeNum(db.bale_count),
    cuttingNumber: safeNum(db.cutting_number, 1),
    baleType: (db.bale_type || 'Round') as 'Round' | 'Square',
    temperature: db.temperature || undefined,
    conditions: db.conditions || undefined,
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapGrainFromDb = (db: GrainMovementRow): GrainMovement => ({
    id: db.id,
    farm_id: db.farm_id,
    binId: db.bin_id,
    binName: safeStr(db.bin_name, 'Unknown Bin'),
    type: (db.type || 'in') as 'in' | 'out',
    bushels: safeNum(db.bushels),
    moisturePercent: safeNum(db.moisture_percent, 15.0),
    sourceFieldName: db.source_field_name || undefined,
    destination: db.destination || undefined,
    price: db.price != null ? safeNum(db.price) : undefined,
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    deleted_at: db.deleted_at ?? null,
    harvestRecordId: db.harvest_record_id || undefined
});

export const mapBinFromDb = (db: BinRow): Bin => ({
    id: db.id,
    name: safeStr(db.name, 'Unnamed Bin'),
    capacity: safeNum(db.capacity),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapSeedFromDb = (db: SavedSeedRow): SavedSeed => ({
    id: db.id,
    name: safeStr(db.name, 'Unnamed Seed'),
    crop: safeStr(db.crop),
    variety: safeStr(db.variety),
    supplier: safeStr(db.supplier),
    lotNumber: safeStr(db.lot_number),
    year: safeNum(db.year, new Date().getFullYear()),
    notes: safeStr(db.notes),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapRecipeFromDb = (db: SprayRecipeRow): SprayRecipe => ({
    id: db.id,
    name: safeStr(db.name, 'Unnamed Recipe'),
    products: (db.products || []) as SprayRecipeProduct[],
    applicatorName: safeStr(db.applicator_name),
    licenseNumber: safeStr(db.license_number),
    targetPest: safeStr(db.target_pest),
    epaRegNumber: safeStr(db.epa_reg_number),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapFertilizerRecipeFromDb = (db: FertilizerRecipeRow): FertilizerRecipe => ({
    id: db.id,
    name: safeStr(db.name, 'Unnamed Recipe'),
    npkRatio: safeStr(db.npk_ratio),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapFertilizerFromDb = (db: FertilizerApplicationRow): FertilizerApplication => ({
    id: db.id,
    farm_id: db.farm_id,
    fieldId: db.field_id,
    fieldName: safeStr(db.fields?.name || db.field_name, 'Unknown Field'),
    date: safeStr(db.date),
    acres: safeNum(db.acres),
    fertilizer_formula: safeStr(db.fertilizer_formula),
    timestamp: safeTimestamp(db.created_at || db.date),
    deleted_at: db.deleted_at ?? null,
    seasonYear: safeNum(db.season_year, new Date().getFullYear())
});

export const mapTillageFromDb = (db: TillageRecordRow): TillageRecord => ({
    id: db.id,
    farm_id: db.farm_id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    date: safeStr(db.date),
    implementType: safeStr(db.implement_type, 'Disk'),
    notes: safeStr(db.notes),
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    deleted_at: db.deleted_at ?? null
});

export const mapFsaTractFromDb = (db: FsaTractImportRow): FsaTractImport => ({
    id: db.id,
    farmId: db.farm_id,
    tractKey: db.tract_key,
    filename: safeStr(db.filename),
    featureCount: safeNum(db.feature_count),
    geojson: db.geojson as FsaTractImport['geojson'],
    importedAt: db.imported_at,
    deletedAt: db.deleted_at ?? null
});

export const mapFieldCluAssignmentFromDb = (db: FieldCluAssignmentRow): FieldCluAssignment => ({
    id: db.id,
    farmId: db.farm_id,
    fieldId: db.field_id,
    tractKey: db.tract_key,
    cluNumber: db.clu_number,
    acres: safeNum(db.acres),
    landUse: db.land_use ?? 'cropland',
    assignedAt: db.assigned_at,
    deletedAt: db.deleted_at ?? null
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

export const mapFieldToDb = (f: Field) => {
    validateRequired(f, ['id', 'farm_id', 'name'], 'mapFieldToDb');
    const appShape = {
        id: f.id,
        farm_id: f.farm_id,
        name: f.name,
        acreage: f.acreage,
        lat: f.lat,
        lng: f.lng,
        fsaFarmNumber: f.fsaFarmNumber,
        fsaTractNumber: f.fsaTractNumber,
        fsaFieldNumber: f.fsaFieldNumber,
        producerShare: f.producerShare,
        irrigationPractice: f.irrigationPractice,
        intendedUse: f.intendedUse,
        boundary: f.boundary,
        cluNumbers: f.cluNumbers,
        deleted_at: f.deleted_at,
        notes: f.notes
    };
    fieldSchema.parse(appShape);
    return {
        id: f.id,
        farm_id: f.farm_id,
        name: f.name,
        acreage: f.acreage,
        lat: f.lat ?? null,
        lng: f.lng ?? null,
        fsa_farm_number: f.fsaFarmNumber ?? null,
        fsa_tract_number: f.fsaTractNumber ?? null,
        fsa_field_number: f.fsaFieldNumber ?? null,
        producer_share: f.producerShare ?? null,
        irrigation_practice: f.irrigationPractice ?? null,
        intended_use: f.intendedUse ?? null,
        boundary: f.boundary ?? null,
        clu_numbers: f.cluNumbers ?? null,
        deleted_at: f.deleted_at ?? null,
        notes: f.notes ?? null
    };
};

export const mapPlantToDb = (r: PlantRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapPlantToDb');
    plantRecordSchema.parse(r);
    return {
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
        crop_status: r.cropStatus ?? 'Planted',
        crop_sequence: r.cropSequence ?? 'First Crop',
        planting_pattern: r.plantingPattern ?? null,
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at,
        memo: r.memo || null
    };
};

export const mapSprayToDb = (r: SprayRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapSprayToDb');
    sprayRecordSchema.parse(r);
    const mapped = {
        id: r.id,
        farm_id: r.farm_id,
        field_id: r.fieldId,
        field_name: safeStr(r.fieldName, 'Unknown Field'),
        products: r.products || [],
        wind_speed: safeNum(r.windSpeed),
        temperature: safeNum(r.temperature),
        spray_date: r.sprayDate || null,
        start_time: r.startTime || null,
        end_time: r.endTime || null,
        applicator_name: safeStr(r.applicatorName),
        license_number: safeStr(r.licenseNumber),
        epa_reg_number: safeStr(r.epaRegNumber),
        season_year: safeNum(r.seasonYear, new Date().getFullYear()),
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        wind_direction: safeStr(r.windDirection),
        relative_humidity: r.relativeHumidity != null ? safeNum(r.relativeHumidity) : null,
        treated_area_size: r.treatedAreaSize != null ? safeNum(r.treatedAreaSize) : null,
        treated_area_unit: safeStr(r.treatedAreaUnit, 'ac'),
        total_amount_applied: r.totalAmountApplied != null ? safeNum(r.totalAmountApplied) : null,
        involved_technicians: r.involvedTechnicians || null,
        mixture_rate: r.mixtureRate || null,
        total_mixture_volume: r.totalMixtureVolume || null,
        site_address: r.siteAddress || null,
        crop_or_site_treated: r.cropOrSiteTreated || null,
        application_method: r.applicationMethod || null,
        target_pest: r.targetPest || null,
        rei: r.rei || null,
        notes: r.notes || null,
        compliance_profile: safeStr(r.complianceProfile, 'universal'),
        is_premixed: !!r.isPremixed,
        equipment_id: r.equipmentId || null,
        non_compliant: !!r.nonCompliant,
        nozzle_type: r.nozzleType || null,
        nozzle_size: r.nozzleSize || null,
        pressure_psi: r.pressurePsi != null ? safeNum(r.pressurePsi) : null,
        boom_height: r.boomHeight != null ? safeNum(r.boomHeight) : null,
        actual_speed: r.actualSpeed != null ? safeNum(r.actualSpeed) : null,
        wind_speed_end: r.windSpeedEnd != null ? safeNum(r.windSpeedEnd) : null,
        wind_direction_end: r.windDirectionEnd || null,
        temp_end: r.tempEnd != null ? safeNum(r.tempEnd) : null,
        sensitive_area_check: !!r.sensitiveAreaCheck,
        sensitive_area_notes: r.sensitiveAreaNotes || null,
        deleted_at: r.deleted_at || null
    };
    return mapped;
};

export const mapHarvestToDb = (r: HarvestRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapHarvestToDb');
    harvestRecordSchema.parse(r);
    return {
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
    };
};

export const mapHayToDb = (r: HayHarvestRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapHayToDb');
    hayHarvestRecordSchema.parse(r);
    return {
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
    };
};

export const mapGrainToDb = (m: GrainMovement) => {
    validateRequired(m, ['id', 'farm_id', 'binId', 'seasonYear'], 'mapGrainToDb');
    grainMovementSchema.parse(m);
    return {
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
        deleted_at: m.deleted_at,
        harvest_record_id: m.harvestRecordId
    };
};

export const mapBinToDb = (b: Bin) => {
    validateRequired(b, ['id', 'farm_id', 'name'], 'mapBinToDb');
    binSchema.parse(b);
    return {
        id: b.id,
        farm_id: b.farm_id,
        name: b.name,
        capacity: b.capacity,
        deleted_at: b.deleted_at
    };
};

export const mapSeedToDb = (s: SavedSeed): Partial<SavedSeedRow> => {
    validateRequired(s, ['farm_id', 'name'], 'mapSeedToDb');
    savedSeedSchema.parse(s);
    return {
        id: s.id,
        name: s.name,
        crop: s.crop,
        variety: s.variety,
        supplier: s.supplier,
        lot_number: s.lotNumber,
        year: s.year,
        notes: s.notes,
        farm_id: s.farm_id,
        deleted_at: s.deleted_at
    };
};

export const mapRecipeToDb = (r: SprayRecipe) => {
    validateRequired(r, ['id', 'farm_id', 'name'], 'mapRecipeToDb');
    sprayRecipeSchema.parse(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        name: r.name,
        products: r.products,
        applicator_name: r.applicatorName,
        license_number: r.licenseNumber,
        target_pest: r.targetPest,
        epa_reg_number: r.epaRegNumber,
        deleted_at: r.deleted_at
    };
};

export const mapFertilizerRecipeToDb = (r: FertilizerRecipe) => {
    validateRequired(r, ['id', 'farm_id', 'name'], 'mapFertilizerRecipeToDb');
    fertilizerRecipeSchema.parse(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        name: r.name,
        npk_ratio: r.npkRatio,
        deleted_at: r.deleted_at
    };
};

export const mapFertilizerToDb = (r: FertilizerApplication) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapFertilizerToDb');
    fertilizerApplicationSchema.parse(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        field_id: r.fieldId,
        field_name: r.fieldName,
        date: r.date,
        fertilizer_formula: r.fertilizer_formula,
        acres: r.acres,
        season_year: r.seasonYear,
        deleted_at: r.deleted_at
    };
};

export const mapTillageToDb = (r: TillageRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapTillageToDb');
    tillageRecordSchema.parse(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        field_id: r.fieldId,
        field_name: r.fieldName,
        date: r.date,
        implement_type: r.implementType,
        notes: r.notes,
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at
    };
};

export const mapFsaTractToDb = (t: FsaTractImport): FsaTractImportRow => {
    validateRequired(t, ['id', 'farmId', 'tractKey', 'filename', 'featureCount', 'geojson', 'importedAt'], 'mapFsaTractToDb');
    fsaTractImportSchema.parse(t);
    return {
        id: t.id,
        farm_id: t.farmId,
        tract_key: t.tractKey,
        filename: t.filename,
        feature_count: t.featureCount,
        geojson: t.geojson,
        imported_at: t.importedAt,
        deleted_at: t.deletedAt ?? null
    };
};

export const mapFieldCluAssignmentToDb = (a: FieldCluAssignment): FieldCluAssignmentRow => {
    validateRequired(a, ['id', 'farmId', 'fieldId', 'tractKey', 'cluNumber', 'assignedAt'], 'mapFieldCluAssignmentToDb');
    fieldCluAssignmentSchema.parse(a);
    return {
        id: a.id,
        farm_id: a.farmId,
        field_id: a.fieldId,
        tract_key: a.tractKey,
        clu_number: a.cluNumber,
        acres: a.acres,
        land_use: a.landUse,
        assigned_at: a.assignedAt,
        deleted_at: a.deletedAt ?? null
    };
};
