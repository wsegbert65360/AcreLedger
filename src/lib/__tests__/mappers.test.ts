import { describe, it, expect } from 'vitest';
import {
    mapFieldFromDb, mapFieldToDb,
    mapPlantToDb,
    mapSprayFromDb, mapSprayToDb,
    mapCustomSprayFromDb, mapCustomSprayToDb,
    mapSeedFromDb, mapSeedToDb,
    mapRecipeFromDb, mapRecipeToDb, mapFertilizerToDb,
} from '../mappers';
import { SprayRecord, SavedSeed, CustomSprayRecord } from '../../types/farm';

describe('Mappers Round-Trip', () => {
    it('should preserve boundary acreage through the legacy operational column', () => {
        const db = mapFieldToDb({
            id: 'field-1',
            farm_id: 'farm-1',
            name: 'Bottom Field',
            acreage: 32,
            boundaryAcreage: 40,
            lat: null,
            lng: null,
            deleted_at: null,
        });

        expect(db.operational_acreage).toBe(40);
        expect(mapFieldFromDb(db as any).boundaryAcreage).toBe(40);
    });

    it('should preserve missing spray acreage as undefined', () => {
        const result = mapSprayFromDb({
            id: 'spray-legacy',
            farm_id: 'farm-1',
            field_id: 'field-1',
            field_name: 'Bottom Field',
            products: [],
            season_year: 2026,
            timestamp: new Date().toISOString(),
            treated_area_size: null,
        } as any);

        expect(result.treatedAreaSize).toBeUndefined();
    });

    it('should preserve spray recipe crop/site through the database mapper', () => {
        const db = mapRecipeToDb({
            id: 'recipe-1', farm_id: 'farm-1', name: 'Corn post', products: [],
            cropOrSiteTreated: 'Corn', deleted_at: null,
        });

        expect(db.crop_or_site_treated).toBe('Corn');
        expect(mapRecipeFromDb(db as any).cropOrSiteTreated).toBe('Corn');
    });

    it('should preserve fertilizer creation time when the backup has a timestamp', () => {
        const timestamp = Date.parse('2025-04-01T12:00:00.000Z');
        const db = mapFertilizerToDb({
            id: 'fert-1', farm_id: 'farm-1', fieldId: 'field-1', fieldName: 'North',
            date: '2025-04-01', acres: 42, fertilizer_formula: '46-0-0', seasonYear: 2025,
            timestamp, deleted_at: null,
        });

        expect(db.created_at).toBe('2025-04-01T12:00:00.000Z');
    });

    it('should maintain SprayRecord integrity through round-trip', () => {
        const original: SprayRecord = {
            id: '123',
            fieldId: 'field-1',
            fieldName: 'North Field',
            products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' }],
            windSpeed: 5,
            temperature: 75,
            timestamp: Date.now(),
            seasonYear: 2026,
            treatedAreaSize: 80.5,
            totalAmountApplied: 1771,
            nonCompliant: false,
            deleted_at: null,
            applicatorName: 'Test Applicator',
            licenseNumber: 'L12345',
            epaRegNumber: '524-549',
            sprayDate: '2026-03-25',
            startTime: '08:00',
            endTime: '09:30',
            siteAddress: 'North Field Entry',
            cropOrSiteTreated: 'Corn',
            applicationMethod: 'Ground Broadcast',
            targetPest: 'Grass',
            treatedAreaUnit: 'ac',
            windDirection: 'NW',
            relativeHumidity: 45,
            rei: '12h',
            equipmentId: 'Miller Nitro',
            notes: 'Test notes',
            complianceProfile: 'universal',
            farm_id: 'farm-1'
        };
        
        const db = mapSprayToDb(original) as any;
        const result = mapSprayFromDb(db);
        
        expect(result.treatedAreaSize).toBe(original.treatedAreaSize);
        expect(result.totalAmountApplied).toBe(original.totalAmountApplied);
        expect(result.nonCompliant).toBe(original.nonCompliant);
        expect(result.products).toEqual(original.products);
    });

    it('should maintain zero values for windSpeed, temperature, and relativeHumidity', () => {
        const original: SprayRecord = {
            id: '123',
            fieldId: 'field-1',
            fieldName: 'North Field',
            products: [{ product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' }],
            windSpeed: 0,
            temperature: 0,
            timestamp: Date.now(),
            seasonYear: 2026,
            treatedAreaSize: 80.5,
            totalAmountApplied: 1771,
            nonCompliant: false,
            deleted_at: null,
            applicatorName: 'Test Applicator',
            licenseNumber: 'L12345',
            epaRegNumber: '524-549',
            sprayDate: '2026-03-25',
            startTime: '08:00',
            endTime: '09:30',
            siteAddress: 'North Field Entry',
            cropOrSiteTreated: 'Corn',
            applicationMethod: 'Ground Broadcast',
            targetPest: 'Grass',
            treatedAreaUnit: 'ac',
            windDirection: 'NW',
            relativeHumidity: 0,
            rei: '12h',
            equipmentId: 'Miller Nitro',
            notes: 'Test notes',
            complianceProfile: 'universal',
            farm_id: 'farm-1'
        };
        
        const db = mapSprayToDb(original) as any;
        const result = mapSprayFromDb(db);
        
        expect(result.windSpeed).toBe(0);
        expect(result.temperature).toBe(0);
        expect(result.relativeHumidity).toBe(0);
    });

    it('should handle SavedSeed new fields in round-trip', () => {
        const original: SavedSeed = {
            id: 'seed-1',
            name: 'Test Seed',
            crop: 'Corn',
            variety: 'DKC 64-35',
            supplier: 'Bayer',
            lotNumber: 'LOT123',
            year: 2025,
            notes: 'Stored in shed',
            deleted_at: null,
            farm_id: 'farm-1'
        };
        
        const db = mapSeedToDb(original) as any;
        db.id = original.id;
        const result = mapSeedFromDb(db);
        
        expect(result.crop).toBe(original.crop);
        expect(result.variety).toBe(original.variety);
        expect(result.supplier).toBe(original.supplier);
        expect(result.lotNumber).toBe(original.lotNumber);
        expect(result.year).toBe(original.year);
    });

    it('should maintain CustomSprayRecord integrity through round-trip', () => {
        const original: CustomSprayRecord = {
            id: 'cs-1',
            farm_id: 'farm-1',
            fieldId: 'field-1',
            fieldName: 'North Field',
            date: '2026-04-15',
            applicationTime: '13:45',
            applicator: 'Helena',
            recipe: 'Roundup 32oz/ac + AMS',
            windSpeed: 7,
            windDirection: 'NW',
            temperature: 72,
            notes: 'See invoice from vendor',
            seasonYear: 2026,
            timestamp: Date.now(),
            deleted_at: null,
        };

        const db = mapCustomSprayToDb(original) as any;
        const result = mapCustomSprayFromDb(db);

        expect(result.applicator).toBe(original.applicator);
        expect(result.recipe).toBe(original.recipe);
        expect(result.windSpeed).toBe(original.windSpeed);
        expect(result.windDirection).toBe(original.windDirection);
        expect(result.temperature).toBe(original.temperature);
        expect(result.notes).toBe(original.notes);
        expect(result.date).toBe(original.date);
        expect(result.applicationTime).toBe(original.applicationTime);
    });

    it('should preserve zero weather values and undefined optionals for CustomSprayRecord', () => {
        const original: CustomSprayRecord = {
            id: 'cs-2',
            farm_id: 'farm-1',
            fieldId: 'field-1',
            fieldName: 'North Field',
            date: '2026-04-15',
            applicator: 'Helena',
            windSpeed: 0,
            temperature: 0,
            seasonYear: 2026,
            timestamp: Date.now(),
            deleted_at: null,
        };

        const db = mapCustomSprayToDb(original) as any;
        const result = mapCustomSprayFromDb(db);

        expect(result.windSpeed).toBe(0);
        expect(result.temperature).toBe(0);
        expect(result.recipe).toBeUndefined();
    });

    describe('Validation Errors', () => {
        it('should throw if mapFieldToDb is missing farm_id', () => {
            const invalidField: any = { id: '1', name: 'Test' };
            expect(() => mapFieldToDb(invalidField)).toThrow('[Mapper Error] mapFieldToDb: Missing required field "farm_id"');
        });

        it('should throw if mapPlantToDb is missing seasonYear', () => {
            const invalidPlant: any = { id: '1', farm_id: 'f1', fieldId: 'fld1' };
            expect(() => mapPlantToDb(invalidPlant)).toThrow('[Mapper Error] mapPlantToDb: Missing required field "seasonYear"');
        });

        it('should throw if mapFertilizerToDb is missing fieldId', () => {
            const invalidFert: any = { id: '1', farm_id: 'f1', seasonYear: 2026 };
            expect(() => mapPlantToDb(invalidFert)).toThrow('[Mapper Error] mapPlantToDb: Missing required field "fieldId"');
        });

        it('should throw if mapCustomSprayToDb is missing fieldId', () => {
            const invalidCustomSpray: any = { id: '1', farm_id: 'f1', seasonYear: 2026 };
            expect(() => mapCustomSprayToDb(invalidCustomSpray)).toThrow('[Mapper Error] mapCustomSprayToDb: Missing required field "fieldId"');
        });
    });
});
