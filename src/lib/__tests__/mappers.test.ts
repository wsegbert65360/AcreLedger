import { describe, it, expect } from 'vitest';
import { 
    mapFieldFromDb, mapFieldToDb,
    mapPlantFromDb, mapPlantToDb,
    mapSprayFromDb, mapSprayToDb,
    mapHarvestFromDb, mapHarvestToDb,
    mapSeedFromDb, mapSeedToDb,
    mapRecipeToDb
} from '../mappers';
import { SprayRecord, SprayRecipe, SavedSeed } from '../../types/farm';

describe('Mappers Round-Trip', () => {
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
    });

    it('should strip client-only ui_id and id from products in mapSprayToDb', () => {
        const record: SprayRecord = {
            id: '123',
            fieldId: 'field-1',
            fieldName: 'Test Field',
            products: [
                { ui_id: 'client-key-1', id: 'db-id-1', product: 'Roundup', rate: '22', rateUnit: 'oz/ac', epaRegNumber: '524-549' },
                { ui_id: 'client-key-2', product: 'Atrazine', rate: '1.5', rateUnit: 'qt/ac' },
            ],
            windSpeed: 5,
            temperature: 75,
            timestamp: Date.now(),
            seasonYear: 2026,
            treatedAreaSize: 80,
            nonCompliant: false,
            deleted_at: null,
            farm_id: 'f1',
        };

        const db = mapSprayToDb(record) as any;

        // Products should NOT have ui_id or id
        expect(db.products[0].ui_id).toBeUndefined();
        expect(db.products[0].id).toBeUndefined();
        expect(db.products[0].product).toBe('Roundup');
        expect(db.products[0].rate).toBe('22');
        expect(db.products[1].ui_id).toBeUndefined();
        expect(db.products[1].product).toBe('Atrazine');
    });

    it('should strip client-only ui_id and id from products in mapRecipeToDb', () => {
        const recipe: SprayRecipe = {
            id: 'r1',
            name: 'Test Recipe',
            products: [
                { ui_id: 'client-key', id: 'db-key', product: 'Roundup', rate: '22', rateUnit: 'oz/ac' },
            ],
            farm_id: 'f1',
            deleted_at: null,
        };

        const db = mapRecipeToDb(recipe) as any;
        expect(db.products[0].ui_id).toBeUndefined();
        expect(db.products[0].id).toBeUndefined();
        expect(db.products[0].product).toBe('Roundup');
    });
});
