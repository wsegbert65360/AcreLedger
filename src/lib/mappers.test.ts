import { describe, it, expect } from 'vitest';
import { 
    mapPlantFromDb, mapPlantToDb, 
    mapSprayFromDb, mapSprayToDb,
    mapHarvestFromDb, mapHarvestToDb,
    mapFertilizerFromDb, mapFertilizerToDb
} from './mappers';
import { PlantRecordRow, SprayRecordRow, HarvestRecordRow, FertilizerApplicationRow } from '../types/database';
import { PlantRecord, SprayRecord, HarvestRecord, FertilizerApplication } from '../types/farm';

describe('Mappers', () => {
    describe('Plant Mappers', () => {
        const dbRow: PlantRecordRow = {
            id: '123',
            farm_id: 'farm-1',
            field_id: 'field-1',
            field_name: 'North Field',
            seed_variety: 'Corn X',
            acreage: 100,
            crop: 'Corn',
            plant_date: '2023-05-01',
            fsa_farm_number: '1234',
            fsa_tract_number: '5678',
            fsa_field_number: '1',
            intended_use: 'Grain',
            producer_share: 100,
            irrigation_practice: 'Non-Irrigated',
            season_year: 2023,
            timestamp: new Date().toISOString(),
            deleted_at: null
        };

        it('maps from DB correctly', () => {
            const result = mapPlantFromDb(dbRow);
            expect(result.id).toBe(dbRow.id);
            expect(result.fieldId).toBe(dbRow.field_id);
            expect(result.irrigationPractice).toBe('Non-Irrigated');
            expect(result.fsaFarmNumber).toBe('1234');
        });

        it('maps to DB correctly', () => {
            const record: PlantRecord = mapPlantFromDb(dbRow);
            const result = mapPlantToDb(record);
            expect(result.field_id).toBe(record.fieldId);
            expect(result.season_year).toBe(record.seasonYear);
        });
    });

    describe('Spray Mappers', () => {
        const dbRow: SprayRecordRow = {
            id: '456',
            farm_id: 'farm-1',
            field_id: 'field-1',
            field_name: 'North Field',
            products: [{ product: 'Herbicide A', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '123' }],
            wind_speed: 5,
            temperature: 75,
            spray_date: '2023-06-01',
            start_time: '08:00',
            equipment_id: 'sprayer-1',
            applicator_name: 'John Doe',
            license_number: 'LIC-123',
            epa_reg_number: 'EPA-456',
            season_year: 2023,
            timestamp: new Date().toISOString(),
            deleted_at: null,
            target_pest: 'Weeds',
            wind_direction: 'N',
            relative_humidity: 50,
            treated_area_size: 100,
            total_amount_applied: 50,
            involved_technicians: null,
            mixture_rate: '1 gal/ac',
            total_mixture_volume: '100 gal'
        };

        it('maps from DB correctly', () => {
            const result = mapSprayFromDb(dbRow);
            expect(result.products?.[0]?.product).toBe('Herbicide A');
            expect(result.treatedAreaSize).toBe('100');
        });

        it('maps to DB correctly', () => {
            const record: SprayRecord = mapSprayFromDb(dbRow);
            const result = mapSprayToDb(record);
            expect(result.treated_area_size).toBe(100);
        });
    });

    describe('Fertilizer Mappers', () => {
        const dbRow: FertilizerApplicationRow = {
            id: '789',
            farm_id: 'farm-1',
            field_id: 'field-1',
            field_name: 'North Field',
            date: '2023-04-01',
            acres: 100,
            fertilizer_formula: '10-10-10',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
            season_year: 2023
        };

        it('maps from DB correctly', () => {
            const result = mapFertilizerFromDb(dbRow);
            expect(result.fertilizer_formula).toBe(dbRow.fertilizer_formula);
            expect(result.seasonYear).toBe(dbRow.season_year);
        });

        it('maps to DB correctly', () => {
            const record: FertilizerApplication = mapFertilizerFromDb(dbRow);
            const result = mapFertilizerToDb(record);
            expect(result.season_year).toBe(record.seasonYear);
        });
    });
});
