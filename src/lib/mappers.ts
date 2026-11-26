import {
    PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, CustomSprayRecord,
    GrainMovement, Field, Bin, SavedSeed, SprayRecipe, FertilizerApplication,
    SprayRecipeProduct, FertilizerRecipe, TillageRecord,
    WorkRequest, WorkRequestProduct, WorkRequestFieldEntry, WorkRequestStatus, WorkType,
    parseFsaStatusCode,
} from '../types/farm';
import {
    PlantRecordRow, SprayRecordRow, HarvestRecordRow, HayHarvestRow, CustomSprayRecordRow,
    GrainMovementRow, FieldRow, BinRow, SavedSeedRow, SprayRecipeRow,
    FertilizerApplicationRow, FertilizerRecipeRow, TillageRecordRow,
    FsaTractImportRow, FieldCluAssignmentRow, CountyAssignmentRow,
    WorkRequestRow, WorkRequestProductEntry, WorkRequestFieldEntryRow
} from '../types/database';
import type { FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import type { CountyAssignment } from '@/lib/county/types';
import type {
    Equipment, EquipmentRow, MaintenanceLog, MaintenanceLogRow,
    MaintenanceSchedule, MaintenanceScheduleRow,
} from '@/types/equipment';
import type {
    CattleEvent, CattleEventRow, CattleGroup, CattleGroupRow, CattleMove, CattleMoveRow,
} from '@/types/cattle';
import { COUNT_CLASSES, countsFromRow, countsTotal, groupCounts, isCountClass } from '@/lib/cattle/counts';
import {
    migrateFsaToPropertyIdentifiers,
    getPropertyIdentifier,
    syncFsaLegacyFields,
} from './propertyIdentifiers';
import {
    fieldSchema, binSchema, plantRecordSchema, sprayRecordSchema,
    harvestRecordSchema, hayHarvestRecordSchema, customSprayRecordSchema, grainMovementSchema,
    savedSeedSchema, fertilizerRecipeSchema, sprayRecipeSchema,
    fertilizerApplicationSchema, tillageRecordSchema,
    fsaTractImportSchema, fieldCluAssignmentSchema, countyAssignmentSchema,
    workRequestSchema
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

function optionalString(value: unknown): string | undefined {
    return value == null || value === '' ? undefined : String(value);
}

function optionalNumber(value: unknown): number | undefined {
    return value == null || value === '' ? undefined : safeNum(value);
}

function includeDefined<T extends Record<string, unknown>>(target: T, key: string, value: unknown): T {
    if (value !== undefined && value !== null && value !== '') target[key as keyof T] = value as T[keyof T];
    return target;
}

function nullableString(value: string | undefined): string | null {
    return value == null || value === '' ? null : value;
}

function nullableNumber(value: number | undefined): number | null {
    return value == null ? null : value;
}

export const mapEquipmentFromDb = (db: EquipmentRow): Equipment => ({
    id: db.id,
    farm_id: db.farm_id,
    kind: db.kind,
    year: optionalNumber(db.year),
    make: optionalString(db.make),
    model: optionalString(db.model),
    serialNumber: optionalString(db.serial_number),
    meterUnit: db.meter_unit,
    currentReading: safeNum(db.current_reading),
    readingUpdatedAt: optionalString(db.reading_updated_at),
    status: db.status,
    notes: optionalString(db.notes),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deleted_at: db.deleted_at ?? null,
});

export const mapMaintenanceScheduleFromDb = (db: MaintenanceScheduleRow): MaintenanceSchedule => ({
    id: db.id,
    farm_id: db.farm_id,
    equipmentId: db.equipment_id,
    taskName: db.task_name,
    intervalValue: optionalNumber(db.interval_value),
    intervalDays: optionalNumber(db.interval_days),
    lastDoneReading: optionalNumber(db.last_done_reading),
    lastDoneAt: optionalString(db.last_done_at),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deleted_at: db.deleted_at ?? null,
});

export const mapMaintenanceLogFromDb = (db: MaintenanceLogRow): MaintenanceLog => ({
    id: db.id,
    farm_id: db.farm_id,
    equipmentId: db.equipment_id,
    scheduleId: optionalString(db.schedule_id),
    kind: db.kind,
    performedOn: db.performed_on,
    readingAtService: optionalNumber(db.reading_at_service),
    description: optionalString(db.description),
    performedBy: optionalString(db.performed_by),
    vendor: optionalString(db.vendor),
    costParts: optionalNumber(db.cost_parts),
    costLabor: optionalNumber(db.cost_labor),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deleted_at: db.deleted_at ?? null,
});

export const mapCattleGroupFromDb = (db: CattleGroupRow): CattleGroup => {
    const counts = countsFromRow(db, db.class, safeNum(db.head_count));
    return {
    id: db.id,
    farm_id: db.farm_id,
    name: safeStr(db.name),
    class: db.class,
    headCount: countsTotal(counts),
    counts,
    currentFieldId: optionalString(db.current_field_id),
    currentSince: optionalString(db.current_since),
    notes: optionalString(db.notes),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deleted_at: db.deleted_at ?? null,
    };
};

export const mapCattleMoveFromDb = (db: CattleMoveRow): CattleMove => ({
    id: db.id,
    farm_id: db.farm_id,
    groupId: db.group_id,
    fieldId: optionalString(db.field_id),
    movedOn: db.moved_on,
    headCount: safeNum(db.head_count),
    notes: optionalString(db.notes),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deleted_at: db.deleted_at ?? null,
});

export const mapCattleEventFromDb = (db: CattleEventRow): CattleEvent => ({
    id: db.id,
    farm_id: db.farm_id,
    groupId: db.group_id,
    eventType: db.event_type,
    eventDate: db.event_date,
    headDelta: safeNum(db.head_delta),
    reason: db.reason ?? undefined,
    transferId: optionalString(db.transfer_id),
    cattleClass: isCountClass(db.cattle_class) ? db.cattle_class : undefined,
    toClass: isCountClass(db.to_class) ? db.to_class : undefined,
    classHead: db.class_head != null && Number.isInteger(Number(db.class_head)) ? Number(db.class_head) : undefined,
    calfSex: db.calf_sex === 'heifer' || db.calf_sex === 'steer' || db.calf_sex === 'bull' ? db.calf_sex : undefined,
    notes: optionalString(db.notes),
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deleted_at: db.deleted_at ?? null,
});

export const mapFieldFromDb = (db: FieldRow): Field => ({
    id: db.id,
    name: safeStr(db.name, 'Unnamed Field'),
    acreage: safeNum(db.acreage),
    boundaryAcreage: db.operational_acreage != null && safeNum(db.operational_acreage) > 0
        ? safeNum(db.operational_acreage)
        : undefined,
    lat: db.lat ?? null,
    lng: db.lng ?? null,
    fsaFarmNumber: safeStr(db.fsa_farm_number),
    fsaTractNumber: safeStr(db.fsa_tract_number),
    fsaFieldNumber: safeStr(db.fsa_field_number),
    propertyIdentifiers: [
        ...migrateFsaToPropertyIdentifiers({
            fsaFarmNumber: safeStr(db.fsa_farm_number),
            fsaTractNumber: safeStr(db.fsa_tract_number),
            fsaFieldNumber: safeStr(db.fsa_field_number),
        }),
        // Australia pilot: PIC persisted in the pic column (see migration
        // 20261005013057). Without this, an au-pic identifier was lost on reload.
        ...(safeStr(db.pic) ? [{ scheme: 'au-pic', kind: 'property', value: safeStr(db.pic) } as const] : []),
    ],
    producerShare: db.producer_share ?? undefined,
    landlordName: safeStr(db.landlord_name),
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
    propertyIdentifiers: migrateFsaToPropertyIdentifiers({
        fsaFarmNumber: safeStr(db.fsa_farm_number),
        fsaTractNumber: safeStr(db.fsa_tract_number),
        fsaFieldNumber: safeStr(db.fsa_field_number),
    }),
    intendedUse: safeStr(db.intended_use),
    producerShare: db.producer_share ?? undefined,
    irrigationPractice: (db.irrigation_practice || 'Non-Irrigated') as 'Irrigated' | 'Non-Irrigated',
    cropStatus: (db.crop_status || 'Planted') as PlantRecord['cropStatus'],
    cropSequence: (db.crop_sequence || 'First Crop') as PlantRecord['cropSequence'],
    fsaStatusCode: parseFsaStatusCode(db.fsa_status_code),
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
    temperature: db.temperature != null ? safeNum(db.temperature) : undefined,
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
    treatedAreaSize: db.treated_area_size == null ? undefined : safeNum(db.treated_area_size),
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
    waterRate: safeStr(db.water_rate),
    waterRateUnit: safeStr(db.water_rate_unit),
    pic: safeStr(db.pic),
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
    temperature: db.temperature != null ? db.temperature : undefined,
    conditions: db.conditions || undefined,
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    farm_id: db.farm_id,
    deleted_at: db.deleted_at ?? null
});

export const mapCustomSprayFromDb = (db: CustomSprayRecordRow): CustomSprayRecord => ({
    id: db.id,
    farm_id: db.farm_id,
    fieldId: db.field_id,
    fieldName: safeStr(db.field_name, 'Unknown Field'),
    date: safeStr(db.date),
    applicationTime: db.application_time ? db.application_time.slice(0, 5) : undefined,
    applicator: safeStr(db.applicator),
    recipe: db.recipe || undefined,
    windSpeed: db.wind_speed != null ? safeNum(db.wind_speed) : undefined,
    windDirection: db.wind_direction || undefined,
    temperature: db.temperature != null ? safeNum(db.temperature) : undefined,
    notes: db.notes || undefined,
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    deleted_at: db.deleted_at ?? null
});

const mapWorkRequestProductFromDb = (p: WorkRequestProductEntry): WorkRequestProduct => ({
    productName: safeStr(p.product_name),
    applicationRate: p.application_rate || undefined,
    rateUnit: p.rate_unit || undefined,
    carrierVolume: p.carrier_volume || undefined,
    carrierVolumeUnit: p.carrier_volume_unit || undefined,
    applicationMethod: p.application_method || undefined,
    supplier: p.supplier ?? undefined,
});

const mapWorkRequestFieldEntryFromDb = (f: WorkRequestFieldEntryRow): WorkRequestFieldEntry => {
    const overrides = f.overrides;
    return {
        fieldId: safeStr(f.field_id),
        farmName: safeStr(f.farm_name, 'Unknown Farm'),
        fieldName: safeStr(f.field_name, 'Unknown Field'),
        acreage: safeNum(f.acreage),
        crop: f.crop || undefined,
        gpsLat: f.gps_lat != null ? safeNum(f.gps_lat) : undefined,
        gpsLng: f.gps_lng != null ? safeNum(f.gps_lng) : undefined,
        navigationLat: f.navigation_lat != null ? safeNum(f.navigation_lat) : undefined,
        navigationLng: f.navigation_lng != null ? safeNum(f.navigation_lng) : undefined,
        nearbyRoad: f.nearby_road || undefined,
        roadSource: f.road_source ?? undefined,
        overrides: overrides ? {
            crop: overrides.crop || undefined,
            products: Array.isArray(overrides.products) ? overrides.products.map(mapWorkRequestProductFromDb) : undefined,
            notes: overrides.notes || undefined,
        } : undefined,
    };
};

export const mapWorkRequestFromDb = (db: WorkRequestRow): WorkRequest => ({
    id: db.id,
    farm_id: db.farm_id,
    requestNumber: safeStr(db.request_number),
    status: (db.status as WorkRequestStatus) || 'Draft',
    createdAt: safeStr(db.created_at),
    updatedAt: safeStr(db.updated_at),
    customerName: safeStr(db.customer_name),
    customerPhone: db.customer_phone || undefined,
    customerBillingAddress: db.customer_billing_address || undefined,
    providerName: db.provider_name || undefined,
    providerEmail: db.provider_email || undefined,
    workType: (db.work_type as WorkType) || 'other',
    requestedCompletionDate: db.requested_completion_date || undefined,
    crop: db.crop || undefined,
    cropYear: safeNum(db.crop_year, new Date().getFullYear()),
    currentCropStage: db.current_crop_stage || undefined,
    previousCrop: db.previous_crop || undefined,
    nextPlannedCrop: db.next_planned_crop || undefined,
    notes: db.notes || undefined,
    products: Array.isArray(db.products) ? db.products.map(mapWorkRequestProductFromDb) : [],
    fields: Array.isArray(db.fields) ? db.fields.map(mapWorkRequestFieldEntryFromDb) : [],
    timestamp: safeTimestamp(db.timestamp),
    deleted_at: db.deleted_at ?? null,
});

export const mapGrainFromDb = (db: GrainMovementRow): GrainMovement => ({
    id: db.id,
    farm_id: db.farm_id,
    binId: db.bin_id,
    binName: safeStr(db.bin_name, 'Unknown Bin'),
    type: (db.type || 'in') as 'in' | 'out',
    bushels: safeNum(db.bushels),
    moisturePercent: db.moisture_percent == null ? null : safeNum(db.moisture_percent, 15.0),
    sourceFieldName: db.source_field_name || undefined,
    destination: db.destination || undefined,
    price: db.price != null ? safeNum(db.price) : undefined,
    seasonYear: safeNum(db.season_year, new Date().getFullYear()),
    timestamp: safeTimestamp(db.timestamp),
    deleted_at: db.deleted_at ?? null,
    harvestRecordId: db.harvest_record_id || undefined,
    version: safeNum(db.version, 1)
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
    cropOrSiteTreated: safeStr(db.crop_or_site_treated) || undefined,
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

const nullableNum = (val: unknown): number | null => {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
};

export const mapCountyAssignmentFromDb = (db: CountyAssignmentRow): CountyAssignment => ({
    id: db.id,
    farmId: db.farm_id,
    subjectType: db.subject_type,
    subjectKey: db.subject_key,
    fieldId: db.field_id ?? null,
    tractKey: db.tract_key ?? null,
    cluNumber: db.clu_number ?? null,
    countyFips: db.county_fips ?? null,
    countyName: db.county_name ?? null,
    stateAbbr: db.state_abbr ?? null,
    mappedAcres: nullableNum(db.mapped_acres),
    proportion: nullableNum(db.proportion),
    manualAcres: nullableNum(db.manual_acres),
    method: db.method,
    reviewStatus: db.review_status,
    reviewReason: db.review_reason ?? null,
    geometryHash: db.geometry_hash ?? null,
    datasetSource: db.dataset_source ?? null,
    datasetVersion: db.dataset_version ?? null,
    calculatedAt: db.calculated_at,
    deletedAt: db.deleted_at ?? null,
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

export const mapEquipmentToDb = (equipment: Equipment): Record<string, unknown> => {
    validateRequired(equipment, ['id', 'farm_id', 'kind', 'meterUnit', 'status'], 'mapEquipmentToDb');
    const row: Record<string, unknown> = {
        id: equipment.id,
        farm_id: equipment.farm_id,
        kind: equipment.kind,
        meter_unit: equipment.meterUnit,
        current_reading: equipment.currentReading,
        status: equipment.status,
        created_at: equipment.createdAt,
        updated_at: equipment.updatedAt,
    };
    includeDefined(row, 'year', equipment.year);
    includeDefined(row, 'make', equipment.make);
    includeDefined(row, 'model', equipment.model);
    includeDefined(row, 'serial_number', equipment.serialNumber);
    includeDefined(row, 'reading_updated_at', equipment.readingUpdatedAt);
    includeDefined(row, 'notes', equipment.notes);
    // Always explicit: restore only resurrects a tombstoned row when the
    // payload carries deleted_at: null.
    row.deleted_at = equipment.deleted_at ?? null;
    return row;
};

/** Descriptive edits. Meter columns change only through the equipment RPCs. */
export const mapEquipmentUpdateToDb = (equipment: Equipment): Record<string, unknown> => {
    validateRequired(equipment, ['id', 'kind', 'status'], 'mapEquipmentUpdateToDb');
    return {
        id: equipment.id,
        kind: equipment.kind,
        year: nullableNumber(equipment.year),
        make: nullableString(equipment.make),
        model: nullableString(equipment.model),
        serial_number: nullableString(equipment.serialNumber),
        status: equipment.status,
        notes: nullableString(equipment.notes),
        updated_at: equipment.updatedAt,
        deleted_at: equipment.deleted_at ?? null,
    };
};

export const mapMaintenanceScheduleUpdateToDb = (schedule: MaintenanceSchedule): Record<string, unknown> => {
    validateRequired(schedule, ['id', 'equipmentId', 'taskName'], 'mapMaintenanceScheduleUpdateToDb');
    return {
        id: schedule.id,
        equipment_id: schedule.equipmentId,
        task_name: schedule.taskName,
        interval_value: nullableNumber(schedule.intervalValue),
        interval_days: nullableNumber(schedule.intervalDays),
        last_done_reading: nullableNumber(schedule.lastDoneReading),
        last_done_at: nullableString(schedule.lastDoneAt),
        updated_at: schedule.updatedAt,
        deleted_at: schedule.deleted_at ?? null,
    };
};

export const mapMaintenanceLogUpdateToDb = (log: MaintenanceLog): Record<string, unknown> => {
    validateRequired(log, ['id', 'equipmentId', 'kind', 'performedOn'], 'mapMaintenanceLogUpdateToDb');
    return {
        id: log.id,
        equipment_id: log.equipmentId,
        schedule_id: nullableString(log.scheduleId),
        kind: log.kind,
        performed_on: log.performedOn,
        reading_at_service: nullableNumber(log.readingAtService),
        description: nullableString(log.description),
        performed_by: nullableString(log.performedBy),
        vendor: nullableString(log.vendor),
        cost_parts: nullableNumber(log.costParts),
        cost_labor: nullableNumber(log.costLabor),
        updated_at: log.updatedAt,
        deleted_at: log.deleted_at ?? null,
    };
};

export const mapMaintenanceScheduleToDb = (schedule: MaintenanceSchedule): Record<string, unknown> => {
    validateRequired(schedule, ['id', 'farm_id', 'equipmentId', 'taskName'], 'mapMaintenanceScheduleToDb');
    const row: Record<string, unknown> = {
        id: schedule.id,
        farm_id: schedule.farm_id,
        equipment_id: schedule.equipmentId,
        task_name: schedule.taskName,
        created_at: schedule.createdAt,
        updated_at: schedule.updatedAt,
    };
    includeDefined(row, 'interval_value', schedule.intervalValue);
    includeDefined(row, 'interval_days', schedule.intervalDays);
    includeDefined(row, 'last_done_reading', schedule.lastDoneReading);
    includeDefined(row, 'last_done_at', schedule.lastDoneAt);
    row.deleted_at = schedule.deleted_at ?? null;
    return row;
};

export const mapMaintenanceLogToDb = (log: MaintenanceLog): Record<string, unknown> => {
    validateRequired(log, ['id', 'farm_id', 'equipmentId', 'kind', 'performedOn'], 'mapMaintenanceLogToDb');
    const row: Record<string, unknown> = {
        id: log.id,
        farm_id: log.farm_id,
        equipment_id: log.equipmentId,
        kind: log.kind,
        performed_on: log.performedOn,
        created_at: log.createdAt,
        updated_at: log.updatedAt,
    };
    includeDefined(row, 'schedule_id', log.scheduleId);
    includeDefined(row, 'reading_at_service', log.readingAtService);
    includeDefined(row, 'description', log.description);
    includeDefined(row, 'performed_by', log.performedBy);
    includeDefined(row, 'vendor', log.vendor);
    includeDefined(row, 'cost_parts', log.costParts);
    includeDefined(row, 'cost_labor', log.costLabor);
    row.deleted_at = log.deleted_at ?? null;
    return row;
};

const cattleCountColumns = (group: CattleGroup): Record<string, number> => {
    const counts = groupCounts(group);
    return { head_count: countsTotal(counts), ...Object.fromEntries(COUNT_CLASSES.map(item => [item, counts[item]])) };
};

export const mapCattleGroupToDb = (group: CattleGroup): Record<string, unknown> => {
    validateRequired(group, ['id', 'farm_id', 'name', 'class'], 'mapCattleGroupToDb');
    return {
        id: group.id,
        farm_id: group.farm_id,
        name: group.name,
        class: group.class,
        ...cattleCountColumns(group),
        current_field_id: nullableString(group.currentFieldId),
        current_since: nullableString(group.currentSince),
        notes: nullableString(group.notes),
        created_at: group.createdAt,
        updated_at: group.updatedAt,
        deleted_at: group.deleted_at ?? null,
    };
};

/**
 * The class counts (and head_count, their total) are sent only when the user
 * changed a count. Events and transfers own the counts through RPCs, so a stale
 * offline edit of a name or note must not overwrite a count an event just changed.
 */
export const mapCattleGroupUpdateToDb = (
    group: CattleGroup,
    options: { countsChanged?: boolean } = {},
): Record<string, unknown> => {
    validateRequired(group, ['id', 'name', 'class'], 'mapCattleGroupUpdateToDb');
    return {
        id: group.id,
        name: group.name,
        class: group.class,
        ...(options.countsChanged ? cattleCountColumns(group) : {}),
        notes: nullableString(group.notes),
        updated_at: group.updatedAt,
        deleted_at: group.deleted_at ?? null,
    };
};

export const mapCattleMoveToDb = (move: CattleMove): Record<string, unknown> => {
    validateRequired(move, ['id', 'farm_id', 'groupId', 'movedOn'], 'mapCattleMoveToDb');
    return {
        id: move.id,
        farm_id: move.farm_id,
        group_id: move.groupId,
        field_id: nullableString(move.fieldId),
        moved_on: move.movedOn,
        head_count: move.headCount,
        notes: nullableString(move.notes),
        created_at: move.createdAt,
        updated_at: move.updatedAt,
        deleted_at: move.deleted_at ?? null,
    };
};

export const mapCattleEventToDb = (event: CattleEvent): Record<string, unknown> => {
    validateRequired(event, ['id', 'farm_id', 'groupId', 'eventType', 'eventDate'], 'mapCattleEventToDb');
    return {
        id: event.id,
        farm_id: event.farm_id,
        group_id: event.groupId,
        event_type: event.eventType,
        event_date: event.eventDate,
        head_delta: event.headDelta,
        reason: nullableString(event.reason),
        transfer_id: nullableString(event.transferId),
        cattle_class: event.cattleClass ?? null,
        to_class: event.toClass ?? null,
        class_head: event.classHead ?? null,
        calf_sex: event.calfSex ?? null,
        notes: nullableString(event.notes),
        created_at: event.createdAt,
        updated_at: event.updatedAt,
        deleted_at: event.deleted_at ?? null,
    };
};

export const mapFieldToDb = (f: Field) => {
    validateRequired(f, ['id', 'farm_id', 'name'], 'mapFieldToDb');
    // propertyIdentifiers (us-fsa) are canonical; legacy fsa* fields are the
    // read-compat shim. Either write path persists to the same fsa columns.
    const fsaIds = syncFsaLegacyFields(f);
    const appShape = {
        id: f.id,
        farm_id: f.farm_id,
        name: f.name,
        acreage: f.acreage,
        boundaryAcreage: f.boundaryAcreage,
        lat: f.lat,
        lng: f.lng,
        fsaFarmNumber: f.fsaFarmNumber,
        fsaTractNumber: f.fsaTractNumber,
        fsaFieldNumber: f.fsaFieldNumber,
        producerShare: f.producerShare,
        landlordName: f.landlordName,
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
        ...(f.boundaryAcreage != null ? { operational_acreage: f.boundaryAcreage } : {}),
        lat: f.lat ?? null,
        lng: f.lng ?? null,
        fsa_farm_number: fsaIds.fsaFarmNumber ?? null,
        fsa_tract_number: fsaIds.fsaTractNumber ?? null,
        fsa_field_number: fsaIds.fsaFieldNumber ?? null,
        // Australia pilot: persist the au-pic identifier; without this column
        // write the PIC survived only in memory and was lost on reload.
        pic: getPropertyIdentifier(f.propertyIdentifiers, 'au-pic', 'property') ?? null,
        producer_share: f.producerShare ?? null,
        landlord_name: f.landlordName ?? null,
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
    const fsaIds = syncFsaLegacyFields(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        field_id: r.fieldId,
        field_name: r.fieldName,
        seed_variety: r.seedVariety,
        acreage: r.acreage,
        crop: r.crop ?? null,
        plant_date: r.plantDate ?? null,
        fsa_farm_number: fsaIds.fsaFarmNumber ?? null,
        fsa_tract_number: fsaIds.fsaTractNumber ?? null,
        fsa_field_number: fsaIds.fsaFieldNumber ?? null,
        intended_use: r.intendedUse ?? null,
        producer_share: r.producerShare ?? null,
        irrigation_practice: r.irrigationPractice ?? null,
        crop_status: r.cropStatus ?? 'Planted',
        crop_sequence: r.cropSequence ?? 'First Crop',
        fsa_status_code: r.fsaStatusCode ?? null,
        planting_pattern: r.plantingPattern ?? null,
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at ?? null,
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
        temperature: r.temperature != null ? safeNum(r.temperature) : null,
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
        water_rate: r.waterRate || null,
        water_rate_unit: r.waterRateUnit || null,
        pic: r.pic || null,
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
        bin_id: r.binId ?? null,
        bushels: r.bushels,
        moisture_percent: r.moisturePercent,
        landlord_split_percent: r.landlordSplitPercent,
        landlord_name: r.landlordName ?? null,
        scale_ticket_number: r.scaleTicketNumber ?? null,
        harvest_date: r.harvestDate ?? null,
        fsa_farm_number: r.fsaFarmNumber ?? null,
        fsa_tract_number: r.fsaTractNumber ?? null,
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        crop: r.crop ?? null,
        deleted_at: r.deleted_at ?? null
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
        temperature: r.temperature ?? null,
        conditions: r.conditions ?? null,
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at ?? null
    };
};

export const mapCustomSprayToDb = (r: CustomSprayRecord) => {
    validateRequired(r, ['id', 'farm_id', 'fieldId', 'seasonYear'], 'mapCustomSprayToDb');
    customSprayRecordSchema.parse(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        field_id: r.fieldId,
        field_name: safeStr(r.fieldName, 'Unknown Field'),
        date: r.date,
        application_time: r.applicationTime || null,
        applicator: safeStr(r.applicator),
        recipe: r.recipe || null,
        wind_speed: r.windSpeed != null ? safeNum(r.windSpeed) : null,
        wind_direction: r.windDirection || null,
        temperature: r.temperature != null ? safeNum(r.temperature) : null,
        notes: r.notes || null,
        season_year: safeNum(r.seasonYear, new Date().getFullYear()),
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at || null
    };
};

const mapWorkRequestProductToDb = (p: WorkRequestProduct): WorkRequestProductEntry => ({
    product_name: safeStr(p.productName),
    application_rate: p.applicationRate || null,
    rate_unit: p.rateUnit || null,
    carrier_volume: p.carrierVolume || null,
    carrier_volume_unit: p.carrierVolumeUnit || null,
    application_method: p.applicationMethod || null,
    supplier: p.supplier ?? null,
});

const mapWorkRequestFieldEntryToDb = (f: WorkRequestFieldEntry): WorkRequestFieldEntryRow => {
    const overrides = f.overrides;
    return {
        field_id: safeStr(f.fieldId),
        farm_name: safeStr(f.farmName, 'Unknown Farm'),
        field_name: safeStr(f.fieldName, 'Unknown Field'),
        acreage: safeNum(f.acreage),
        crop: f.crop || null,
        gps_lat: f.gpsLat != null ? safeNum(f.gpsLat) : null,
        gps_lng: f.gpsLng != null ? safeNum(f.gpsLng) : null,
        navigation_lat: f.navigationLat != null ? safeNum(f.navigationLat) : null,
        navigation_lng: f.navigationLng != null ? safeNum(f.navigationLng) : null,
        nearby_road: f.nearbyRoad || null,
        road_source: f.roadSource ?? null,
        overrides: overrides ? {
            crop: overrides.crop || null,
            products: Array.isArray(overrides.products) ? overrides.products.map(mapWorkRequestProductToDb) : undefined,
            notes: overrides.notes || null,
        } : null,
    };
};

export const mapWorkRequestToDb = (r: WorkRequest) => {
    validateRequired(r, ['id', 'farm_id', 'requestNumber', 'customerName', 'workType', 'cropYear'], 'mapWorkRequestToDb');
    workRequestSchema.parse(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        request_number: safeStr(r.requestNumber),
        status: r.status || 'Draft',
        created_at: r.createdAt || new Date().toISOString(),
        updated_at: r.updatedAt || new Date().toISOString(),
        customer_name: safeStr(r.customerName),
        customer_phone: r.customerPhone || null,
        customer_billing_address: r.customerBillingAddress || null,
        provider_name: r.providerName || null,
        provider_email: r.providerEmail || null,
        work_type: r.workType || 'other',
        requested_completion_date: r.requestedCompletionDate || null,
        crop: r.crop || null,
        crop_year: safeNum(r.cropYear, new Date().getFullYear()),
        current_crop_stage: r.currentCropStage || null,
        previous_crop: r.previousCrop || null,
        next_planned_crop: r.nextPlannedCrop || null,
        notes: r.notes || null,
        products: (r.products ?? []).map(mapWorkRequestProductToDb),
        fields: (r.fields ?? []).map(mapWorkRequestFieldEntryToDb),
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at || null,
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
        source_field_name: m.sourceFieldName ?? null,
        destination: m.destination ?? null,
        price: m.price ?? null,
        season_year: m.seasonYear,
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: m.deleted_at ?? null,
        harvest_record_id: m.harvestRecordId ?? null,
        version: safeNum(m.version, 1)
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
        deleted_at: b.deleted_at ?? null
    };
};

export const mapSeedToDb = (s: SavedSeed): Partial<SavedSeedRow> => {
    validateRequired(s, ['id', 'farm_id', 'name'], 'mapSeedToDb');
    savedSeedSchema.parse(s);
    return {
        id: s.id,
        name: s.name,
        crop: s.crop,
        variety: s.variety,
        supplier: s.supplier ?? null,
        lot_number: s.lotNumber ?? null,
        year: s.year ?? null,
        notes: s.notes ?? null,
        farm_id: s.farm_id,
        deleted_at: s.deleted_at ?? null
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
        // Optional columns send null, never undefined: JSON drops an undefined key and
        // PostgREST then keeps the old value, so a cleared license would come back.
        applicator_name: r.applicatorName ?? null,
        license_number: r.licenseNumber ?? null,
        target_pest: r.targetPest ?? null,
        epa_reg_number: r.epaRegNumber ?? null,
        crop_or_site_treated: r.cropOrSiteTreated ?? null,
        deleted_at: r.deleted_at ?? null
    };
};

export const mapFertilizerRecipeToDb = (r: FertilizerRecipe) => {
    validateRequired(r, ['id', 'farm_id', 'name'], 'mapFertilizerRecipeToDb');
    fertilizerRecipeSchema.parse(r);
    return {
        id: r.id,
        farm_id: r.farm_id,
        name: r.name,
        npk_ratio: r.npkRatio ?? null,
        deleted_at: r.deleted_at ?? null
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
        ...(Number.isFinite(r.timestamp) && r.timestamp > 0
            ? { created_at: new Date(r.timestamp).toISOString() }
            : {}),
        deleted_at: r.deleted_at ?? null
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
        notes: r.notes ?? null,
        season_year: r.seasonYear,
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        deleted_at: r.deleted_at ?? null
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

export const mapCountyAssignmentToDb = (a: CountyAssignment): CountyAssignmentRow => {
    validateRequired(a, ['id', 'farmId', 'subjectType', 'subjectKey', 'method', 'reviewStatus', 'calculatedAt'], 'mapCountyAssignmentToDb');
    countyAssignmentSchema.parse(a);
    return {
        id: a.id,
        farm_id: a.farmId,
        subject_type: a.subjectType,
        subject_key: a.subjectKey,
        field_id: a.fieldId,
        tract_key: a.tractKey,
        clu_number: a.cluNumber,
        county_fips: a.countyFips,
        county_name: a.countyName,
        state_abbr: a.stateAbbr,
        mapped_acres: a.mappedAcres,
        proportion: a.proportion,
        manual_acres: a.manualAcres,
        method: a.method,
        review_status: a.reviewStatus,
        review_reason: a.reviewReason,
        geometry_hash: a.geometryHash,
        dataset_source: a.datasetSource,
        dataset_version: a.datasetVersion,
        calculated_at: a.calculatedAt,
        deleted_at: a.deletedAt ?? null,
    };
};
