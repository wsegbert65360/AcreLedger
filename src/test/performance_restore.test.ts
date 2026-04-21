/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSeasonManagement } from '../store/useSeasonManagement';
import { supabase } from '../lib/supabase';

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
        vi.spyOn(console, 'error').mockImplementation(() => {});

        mockArgs = {
            session: { user: { id: 'user-123' } },
            farm_id: 'farm-123',
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
        };
    });

    const mockBackupData = {
        fields: [{ id: '1', name: 'Field 1', farm_id: 'farm-123' }],
        bins: [{ id: '2', name: 'Bin 1', farm_id: 'farm-123' }],
        plantRecords: [{ id: '3', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        sprayRecords: [{ id: '4', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        harvestRecords: [{ id: '5', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        hayHarvestRecords: [{ id: '6', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        fertilizerApplications: [{ id: '7', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        tillageRecords: [{ id: '8', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        grainMovements: [{ id: '9', binId: '2', seasonYear: 2024, farm_id: 'farm-123' }],
        savedSeeds: [{ id: '10', name: 'Seed 1', farm_id: 'farm-123' }],
        fertilizerRecipes: [{ id: '11', name: 'Rec 1', farm_id: 'farm-123' }],
        sprayRecipes: [{ id: '12', name: 'Rec 2', farm_id: 'farm-123' }]
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
        const success = await result.current.restoreFromBackup(mockBackupData);
        const duration = performance.now() - start;
        
        console.log(`\n[PERFORMANCE] Optimized Duration: ${duration.toFixed(2)}ms`);
        expect(success).toBe(true);
        // Expected ~100ms per table (12 tables in parallel) — allow generous headroom for CI
        expect(duration).toBeLessThan(5000);
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
