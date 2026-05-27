/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSeasonManagement } from '../store/useSeasonManagement';
import { supabase } from '../lib/supabase';

// Mock supabase
vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            update: vi.fn(),
            eq: vi.fn()
        })),
        rpc: vi.fn()
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
            setFarmId: vi.fn(),
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
            refetchFarmData: vi.fn().mockResolvedValue(true),
            isOnline: true,
        };
    });

    const mockBackupData = {
        fields: [{ id: '1', name: 'Field 1', farm_id: 'farm-123', acreage: 100 }],
        bins: [{ id: '2', name: 'Bin 1', farm_id: 'farm-123', capacity: 5000 }],
        plantRecords: [{ id: '3', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123', acreage: 100 }],
        sprayRecords: [{ id: '4', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        harvestRecords: [{ id: '5', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123', bushels: 200 }],
        hayHarvestRecords: [{ id: '6', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123', baleCount: 50 }],
        fertilizerApplications: [{ id: '7', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123', acres: 100 }],
        tillageRecords: [{ id: '8', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
        grainMovements: [{ id: '9', binId: '2', seasonYear: 2024, farm_id: 'farm-123', bushels: 200 }],
        savedSeeds: [{ id: '10', name: 'Seed 1', farm_id: 'farm-123' }],
        fertilizerRecipes: [{ id: '11', name: 'Rec 1', farm_id: 'farm-123' }],
        sprayRecipes: [{ id: '12', name: 'Rec 2', farm_id: 'farm-123' }],
        activeSeason: 2024
    };

    it('should measure transactional restore performance', async () => {
        // Simulate RPC latency
        (supabase.rpc as any).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return { data: { ok: true }, error: null };
        });

        const { result } = renderHook(() => useSeasonManagement(mockArgs));
        
        const start = performance.now();
        const success = await result.current.restoreFromBackup(mockBackupData);
        const duration = performance.now() - start;
        
        console.log(`\n[PERFORMANCE] Optimized Duration: ${duration.toFixed(2)}ms`);
        expect(success).toBe(true);
        expect(mockArgs.refetchFarmData).toHaveBeenCalledTimes(1);
        expect(mockArgs.setFields).not.toHaveBeenCalled();
        // Expected to complete under broad CI headroom.
        expect(duration).toBeLessThan(5000);
    });

    it('should fail when restore RPC returns error', async () => {
        (supabase.rpc as any).mockResolvedValue({
            data: null,
            error: { message: 'DB Failure' }
        });

        const { result } = renderHook(() => useSeasonManagement(mockArgs));
        const success = await result.current.restoreFromBackup(mockBackupData);
        
        expect(success).toBe(false);
        expect(mockArgs.refetchFarmData).not.toHaveBeenCalled();
        expect(mockArgs.setFields).not.toHaveBeenCalled();
    });

    it('should fail when cloud reload fails after successful restore RPC', async () => {
        (supabase.rpc as any).mockResolvedValue({ data: { ok: true }, error: null });
        mockArgs.refetchFarmData = vi.fn().mockResolvedValue(false);

        const { result } = renderHook(() => useSeasonManagement(mockArgs));
        const success = await result.current.restoreFromBackup(mockBackupData);

        expect(success).toBe(false);
        expect(mockArgs.refetchFarmData).toHaveBeenCalledTimes(1);
        expect(mockArgs.setFields).not.toHaveBeenCalled();
    });
});
