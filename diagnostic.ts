import { backupSchema } from './src/lib/backupSchema';
import {
    mapFieldToDb, mapBinToDb, mapPlantToDb, mapSprayToDb,
    mapHarvestToDb, mapHayToDb, mapGrainToDb, mapSeedToDb,
    mapRecipeToDb, mapFertilizerToDb, mapFertilizerRecipeToDb, mapTillageToDb
} from './src/lib/mappers';

const mockBackupData = {
    fields: [{ id: '1', name: 'Field 1', acreage: 100, farm_id: 'farm-123' }],
    bins: [{ id: '2', name: 'Bin 1', capacity: 1000, farm_id: 'farm-123' }],
    plantRecords: [{ id: '3', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
    sprayRecords: [{ id: '4', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
    harvestRecords: [{ id: '5', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
    hayHarvestRecords: [{ id: '6', fieldId: '1', seasonYear: 2024, farm_id: 'farm-123' }],
    fertilizerApplications: [{ id: '7', fieldId: '1', seasonYear: 2024, date: '2024-05-01', acres: 100, fertilizer_formula: '10-10-10', farm_id: 'farm-123' }],
    tillageRecords: [{ id: '8', fieldId: '1', seasonYear: 2024, date: '2024-04-01', implementType: 'Disk', farm_id: 'farm-123' }],
    grainMovements: [{ id: '9', binId: '2', seasonYear: 2024, farm_id: 'farm-123' }],
    savedSeeds: [{ id: '10', name: 'Seed 1', farm_id: 'farm-123' }],
    fertilizerRecipes: [{ id: '11', name: 'Rec 1', npkRatio: '10-10-10', farm_id: 'farm-123' }],
    sprayRecipes: [{ id: '12', name: 'Rec 2', farm_id: 'farm-123' }]
};

const farm_id = 'farm-123';

try {
    console.log("Starting validation...");
    const backupData = backupSchema.parse(mockBackupData);
    console.log("Validation successful.");

    console.log("Starting mapping...");
    mapFieldToDb({ ...backupData.fields![0], farm_id } as any);
    mapBinToDb({ ...backupData.bins![0], farm_id } as any);
    mapPlantToDb({ ...backupData.plantRecords![0], farm_id } as any);
    mapSprayToDb({ ...backupData.sprayRecords![0], farm_id } as any);
    mapHarvestToDb({ ...backupData.harvestRecords![0], farm_id } as any);
    mapHayToDb({ ...backupData.hayHarvestRecords![0], farm_id } as any);
    mapFertilizerToDb({ ...backupData.fertilizerApplications![0], farm_id } as any);
    mapTillageToDb({ ...backupData.tillageRecords![0], farm_id } as any);
    mapGrainToDb({ ...backupData.grainMovements![0], farm_id } as any);
    mapSeedToDb({ ...backupData.savedSeeds![0], farm_id } as any);
    mapFertilizerRecipeToDb({ ...backupData.fertilizerRecipes![0], farm_id } as any);
    mapRecipeToDb({ ...backupData.sprayRecipes![0] as any, farm_id } as any);
    console.log("Mapping successful.");
} catch (e: any) {
    console.error("Diagnostic failed:");
    if (e.errors) {
        console.error(JSON.stringify(e.errors, null, 2));
    } else {
        console.error(e.message);
    }
    process.exit(1);
}
