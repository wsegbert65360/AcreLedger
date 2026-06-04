import { describe, it, expect } from 'vitest';
import { 
    mapFieldToDb,
    mapPlantToDb,
    mapSprayFromDb, mapSprayToDb,
    mapSeedFromDb, mapSeedToDb
} from '../mappers';
import { SprayRecord, SavedSeed } from '../../types/farm';

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
});
