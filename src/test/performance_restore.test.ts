/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSeasonManagement } from '../store/useSeasonManagement';
import { supabase } from '../lib/supabase';
import { backupSchema } from '../lib/backupSchema';

// Mock backupSchema
vi.mock('../lib/backupSchema', () => ({
    backupSchema: {
        parse: vi.fn((data) => data)
    }
}));

// Mock supabase
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            upsert: vi.fn()
        }))
    }
}));

// Mock toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

describe('Restore Performance Benchmark', () => {
    let mockArgs: any;
    const mockApiKey = 'test-api-key'; // Define mockApiKey for vi.stubEnv

    beforeEach(() => {
        vi.stubEnv('VITE_VISUALCROSSING_KEY', mockApiKey);
        vi.clearAllMocks();
        vi.resetModules();
        global.fetch = vi.fn();

        // Explicitly spy on console.error so we can see what happened if it fails
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            // Log to stdout so it appears in CI logs
            process.stdout.write(`[CONSOLE ERROR SPY] ${args.join(' ')}\n`);
        });

        // Robust Browser API mocks using stubGlobal
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'mock-url'),
            revokeObjectURL: vi.fn(),
        });

        vi.stubGlobal('Blob', class Blob {
            constructor(public parts: any[], public options: any) {}
        });

        // Mock document.createElement and body methods more safely
        const mockAnchor = {
            click: vi.fn(),
            setAttribute: vi.fn(),
            style: {},
            href: '',
            download: ''
        };

        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            if (tag === 'a') return mockAnchor as any;
            return global.document.createElement(tag);
        });

        vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
        vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

        mockArgs = {
            session: { user: { id: 'user-123' } },
            farm_id: 'farm-123',
            fields: [],
            bins: [],
            plantRecords: [],
            sprayRecords: [],
            harvestRecords: [],
            hayHarvestRecords: [],
            fertilizerApplications: [],
            grainMovements: [],
            savedSeeds: [],
            fertilizerRecipes: [],
            sprayRecipes: [],
            tillageRecords: [],
            activeSeason: 2024,
            setLoading: vi.fn(),
            setFields: vi.fn(),
            setBins: vi.fn(),
            setPlantRecords: vi.fn(),
            setSprayRecords: vi.fn(),
            setHarvestRecords: vi.fn(),
            setHayHarvestRecords: vi.fn(),
            setFertilizerApplications: vi.fn(),
            setGrainMovements: vi.fn(),
            setSavedSeeds: vi.fn(),
            setFertilizerRecipes: vi.fn(),
            setSprayRecipes: vi.fn(),
            setTillageRecords: vi.fn(),
            setActiveSeason: vi.fn(),
            setViewingSeason: vi.fn(),
            setFarmId: vi.fn(),
        };
    });

    const mockBackupData = {
        fields: [{
            id: '1', name: 'Field 1', acreage: 100, farm_id: 'farm-123',
            lat: null, lng: null, deleted_at: null, notes: ''
        }],
        bins: [{
            id: '2', name: 'Bin 1', capacity: 1000, farm_id: 'farm-123',
            deleted_at: null
        }],
        plantRecords: [{
            id: '3', fieldId: '1', fieldName: 'Field 1', seedVariety: 'Corn',
            acreage: 100, timestamp: Date.now(), seasonYear: 2024,
            farm_id: 'farm-123', deleted_at: null
        }],
        sprayRecords: [{
            id: '4', fieldId: '1', fieldName: 'Field 1', products: [],
            windSpeed: 5, temperature: 70, timestamp: Date.now(),
            seasonYear: 2024, farm_id: 'farm-123', deleted_at: null
        }],
        harvestRecords: [{
            id: '5', fieldId: '1', fieldName: 'Field 1', destination: 'bin',
            bushels: 1000, moisturePercent: 15, landlordSplitPercent: 0,
            timestamp: Date.now(), seasonYear: 2024, farm_id: 'farm-123',
            deleted_at: null
        }],
        hayHarvestRecords: [{
            id: '6', fieldId: '1', fieldName: 'Field 1', date: '2024-06-01',
            baleCount: 50, cuttingNumber: 1, baleType: 'Round',
            timestamp: Date.now(), seasonYear: 2024, farm_id: 'farm-123',
            deleted_at: null
        }],
        fertilizerApplications: [{
            id: '7', fieldId: '1', fieldName: 'Field 1', date: '2024-05-01',
            acres: 100, fertilizer_formula: '10-10-10', timestamp: Date.now(),
            created_at: '2024-05-01T00:00:00Z', updated_at: '2024-05-01T00:00:00Z',
            seasonYear: 2024, farm_id: 'farm-123', deleted_at: null
        }],
        tillageRecords: [{
            id: '8', fieldId: '1', fieldName: 'Field 1', date: '2024-04-01',
            implementType: 'Disk', timestamp: Date.now(), seasonYear: 2024,
            farm_id: 'farm-123', deleted_at: null
        }],
        grainMovements: [{
            id: '9', binId: '2', binName: 'Bin 1', type: 'in', bushels: 1000,
            moisturePercent: 15, timestamp: Date.now(), seasonYear: 2024,
            farm_id: 'farm-123', deleted_at: null
        }],
        savedSeeds: [{
            id: '10', name: 'Seed 1', crop: 'Corn', variety: 'V1',
            supplier: 'S1', lotNumber: 'L1', year: 2024, notes: '',
            farm_id: 'farm-123', deleted_at: null
        }],
        fertilizerRecipes: [{
            id: '11', name: 'Rec 1', npkRatio: '10-10-10',
            farm_id: 'farm-123', deleted_at: null
        }],
        sprayRecipes: [{
            id: '12', name: 'Rec 2', products: [],
            farm_id: 'farm-123', deleted_at: null
        }]
    };

    it('should measure optimized performance (parallel)', async () => {
        // Simulate 100ms latency per table
        (supabase.from as any).mockImplementation(() => ({
            upsert: async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return { error: null };
            }
        }));

        const { result } = renderHook(() => useSeasonManagement(mockArgs));
        
        const start = performance.now();
        let success = false;
        try {
            success = await result.current.restoreFromBackup(mockBackupData);
        } catch (e: any) {
            console.error('RESTORE ERROR:', e.message);
        }
        const duration = performance.now() - start;
        
        console.log(`\n[PERFORMANCE] Optimized Duration: ${duration.toFixed(2)}ms`);
        expect(success).toBe(true);
        // Expected ~100ms (plus some overhead, but definitely < 500ms)
        expect(duration).toBeLessThan(500);
    });

    it('should fail fast if any upsert fails', async () => {
        (supabase.from as any).mockImplementation((table: string) => ({
            upsert: async () => {
                if (table === 'plant_records') {
                    return { error: { message: 'DB Failure' } };
                }
                return { error: null };
            }
        }));

        const { result } = renderHook(() => useSeasonManagement(mockArgs));
        const success = await result.current.restoreFromBackup(mockBackupData);
        
        expect(success).toBe(false);
        // Ensure state updates were NOT called (since it should throw before them)
        expect(mockArgs.setFields).not.toHaveBeenCalled();
    });
});
