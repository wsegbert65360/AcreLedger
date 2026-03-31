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

// --- Safe Mapping Helpers (Runtime Validation) ---

function safeNum(val: unknown, fallback = 0): number {
    if (val === null || val === undefined) return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

/**
 * Converts a text DB column to a number, but warns when the value is non-numeric.
 * This guards against the live DB columns (treated_area_size, total_amount_applied)
 * that are still `text` and may contain garbage like "N/A" or "" — which `safeNum()`
 * would silently convert to 0, hiding data quality issues.
 */
function safeNumericText(val: any, columnName: string, recordId: string, fallback = 0): number {
    if (val == null || val === '') return fallback;
    if (typeof val === 'number') return val;
    const n = Number(val);
    if (isNaN(n)) {
        console.warn(
            `[Mapper Warning] ${columnName} is non-numeric for record "${recordId}": "${val}". Defaulting to ${fallback}.`
        );
        return fallback;
    }
    return n;
}

function safeStr(val: any, fallback = ''): string {
    return val === null || val === undefined ? fallback : String(val);
}

function safeTimestamp(val: any): number {
    if (val == null) return 0;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Converts a value to `string | undefined`, treating `null`, `undefined`, and `""`
 * as "not set". Use for optional string fields on domain types so that downstream
 * code can reliably distinguish between "has a value" and "does not have a value"
 * without worrying about empty-string falsy gotchas.
 */
function optionalStr(val: any): string | undefined {
    if (val == null || val === '') return undefined;
    return String(val);
}

/**
 * Maps a database ProductEntry to an application SprayRecipeProduct.
 * ProductEntry comes from Supabase (snake_case optional fields);
 * SprayRecipeProduct is the frontend type (camelCase optional fields).
 * Using explicit field mapping instead of `as SprayRecipeProduct[]` prevents
 * silent type drift when the DB schema changes.
 */
function mapProductFromDb(p: ProductEntry): SprayRecipeProduct {
    return {
        product: safeStr(p.product),
        rate: safeStr(p.rate),
        rateUnit: safeStr(p.rateUnit, 'oz/ac'),
        epaRegNumber: p.epaRegNumber ?? undefined,
        activeIngredients: p.activeIngredients ?? undefined,
        totalProductAmount: p.totalProductAmount ?? undefined,
        totalProductUnit: p.totalProductUnit ?? undefined,
    };
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
    seasonYear: safeNum(db.season_year, 2024),
    timestamp: safeTimestamp(db.timestamp),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapSprayFromDb = (db: SprayRecordRow): SprayRecord => ({
    id: db.id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    products: (db.products || []).map(mapProductFromDb),
    windSpeed: safeNum(db.wind_speed),
    temperature: safeNum(db.temperature),
    sprayDate: optionalStr(db.spray_date),
    startTime: optionalStr(db.start_time),
    endTime: optionalStr(db.end_time),
    equipmentId: optionalStr(db.equipment_id),
    applicatorName: optionalStr(db.applicator_name),
    licenseNumber: optionalStr(db.license_number),
    epaRegNumber: optionalStr(db.epa_reg_number),
    seasonYear: safeNum(db.season_year, 2024),
    timestamp: safeTimestamp(db.timestamp),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null,
    targetPest: optionalStr(db.target_pest),
    windDirection: optionalStr(db.wind_direction),
    relativeHumidity: db.relative_humidity ?? undefined,
    treatedAreaSize: safeNumericText(db.treated_area_size, 'treated_area_size', db.id),
    treatedAreaUnit: optionalStr(db.treated_area_unit) || 'ac',
    totalAmountApplied: safeNumericText(db.total_amount_applied, 'total_amount_applied', db.id),
    involvedTechnicians: optionalStr(db.involved_technicians),
    mixtureRate: optionalStr(db.mixture_rate),
    totalMixtureVolume: optionalStr(db.total_mixture_volume),
    siteAddress: optionalStr(db.site_address),
    cropOrSiteTreated: optionalStr(db.crop_or_site_treated),
    applicationMethod: optionalStr(db.application_method),
    rei: optionalStr(db.rei),
    notes: optionalStr(db.notes),
    complianceProfile: optionalStr(db.compliance_profile) || 'universal',
    isPremixed: !!db.is_premixed,
    nonCompliant: !!db.non_compliant
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
    seasonYear: safeNum(db.season_year, 2024),
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
    seasonYear: safeNum(db.season_year, 2024),
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
    seasonYear: safeNum(db.season_year, 2024),
    timestamp: safeTimestamp(db.timestamp),
    deleted_at: db.deleted_at ?? null
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
    year: safeNum(db.year, 2024),
    notes: safeStr(db.notes),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapRecipeFromDb = (db: SprayRecipeRow): SprayRecipe => ({
    id: db.id,
    name: safeStr(db.name, 'Unnamed Recipe'),
    products: (db.products || []).map(mapProductFromDb),
    applicatorName: optionalStr(db.applicator_name),
    licenseNumber: optionalStr(db.license_number),
    targetPest: optionalStr(db.target_pest),
    epaRegNumber: optionalStr(db.epa_reg_number),
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
    created_at: safeStr(db.created_at),
    updated_at: safeStr(db.updated_at),
    deleted_at: db.deleted_at ?? null,
    seasonYear: safeNum(db.season_year, 2024)
});

export const mapTillageFromDb = (db: TillageRecordRow): TillageRecord => ({
    id: db.id,
    farm_id: db.farm_id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    date: safeStr(db.date),
    implementType: safeStr(db.implement_type, 'Disk'),
    notes: safeStr(db.notes),
    seasonYear: safeNum(db.season_year, 2024),
    timestamp: safeTimestamp(db.timestamp),
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

export const mapFieldToDb = (f: Field) => {
    validateRequired(f, ['id', 'name'], 'mapFieldToDb');
    return {
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
    };
};

export const mapPlantToDb = (r: PlantRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapPlantToDb');
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
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at
    };
};

export const mapSprayToDb = (r: SprayRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapSprayToDb');
    return {
        id: r.id,
        farm_id: r.farm_id,
        field_id: r.fieldId,
        field_name: r.fieldName,
        // Strip client-only keys (ui_id, id) before persisting to JSONB
        products: r.products?.map(({ ui_id, id, ...rest }: SprayRecipeProduct) => rest),
        wind_speed: r.windSpeed,
        temperature: r.temperature,
        spray_date: r.sprayDate,
        start_time: r.startTime,
        end_time: r.endTime ?? null,
        applicator_name: r.applicatorName,
        license_number: r.licenseNumber,
        epa_reg_number: r.epaRegNumber,
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        wind_direction: r.windDirection,
        relative_humidity: r.relativeHumidity,
        treated_area_size: r.treatedAreaSize,
        treated_area_unit: r.treatedAreaUnit ?? 'ac',
        total_amount_applied: r.totalAmountApplied,
        involved_technicians: r.involvedTechnicians,
        mixture_rate: r.mixtureRate,
        total_mixture_volume: r.totalMixtureVolume,
        site_address: r.siteAddress,
        crop_or_site_treated: r.cropOrSiteTreated,
        application_method: r.applicationMethod,
        target_pest: r.targetPest,
        rei: r.rei,
        notes: r.notes,
        compliance_profile: r.complianceProfile ?? 'universal',
        is_premixed: r.isPremixed,
        equipment_id: r.equipmentId,
        non_compliant: r.nonCompliant,
        deleted_at: r.deleted_at
    };
};

export const mapHarvestToDb = (r: HarvestRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapHarvestToDb');
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
        deleted_at: m.deleted_at
    };
};

export const mapBinToDb = (b: Bin) => {
    validateRequired(b, ['id', 'farm_id', 'name'], 'mapBinToDb');
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
    return {
        name: s.name,
        crop: s.crop,
        variety: s.variety,
        supplier: s.supplier,
        lot_number: s.lotNumber,
        year: s.year,
        notes: s.notes,
        farm_id: s.farm_id
    };
};

export const mapRecipeToDb = (r: SprayRecipe) => {
    validateRequired(r, ['id', 'farm_id', 'name'], 'mapRecipeToDb');
    return {
        id: r.id,
        farm_id: r.farm_id,
        name: r.name,
        // Strip client-only keys (ui_id, id) before persisting to JSONB
        products: r.products?.map(({ ui_id, id, ...rest }: SprayRecipeProduct) => rest),
        applicator_name: r.applicatorName,
        license_number: r.licenseNumber,
        target_pest: r.targetPest,
        epa_reg_number: r.epaRegNumber,
        deleted_at: r.deleted_at
    };
};

export const mapFertilizerRecipeToDb = (r: FertilizerRecipe) => {
    validateRequired(r, ['id', 'farm_id', 'name'], 'mapFertilizerRecipeToDb');
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
