/**
 * Seeds the app with 100 of every entity type for stress testing.
 * Call this from the dev tools console or a dev-mode button.
 */

import { generateAllTestData } from './generateTestData';

interface SeedableFarmStore {
  addField: (f: any) => void;
  addBin: (b: any) => void;
  addSeed: (name: string) => void;
  addSprayRecipe: (r: any) => void;
  addPlantRecord: (r: any) => void;
  addSprayRecord: (r: any) => void;
  addHarvestRecord: (r: any) => void;
  addHayHarvestRecord: (r: any) => void;
  addFertilizerApplication: (r: any) => void;
  addGrainMovement: (r: any) => void;
}

/**
 * Seeds the database with `count` of every entity type.
 * 
 * @param store - The farm store (from useFarm())
 * @param count - How many of each entity to create (default 100)
 * @param onProgress - Optional progress callback (current, total, label)
 * 
 * Adds items with a small delay between batches to avoid overwhelming
 * the Supabase API with 1000 simultaneous requests.
 */
export async function seedDatabase(
  store: SeedableFarmStore,
  count = 100,
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<{ totalCreated: number; errors: string[] }> {
  const data = generateAllTestData(count);
  const errors: string[] = [];
  let created = 0;
  const totalItems = count * 10; // 10 entity types

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const batchProcess = async <T>(
    label: string,
    items: T[],
    addFn: (item: T) => void,
  ) => {
    onProgress?.(created, totalItems, label);
    for (let i = 0; i < items.length; i++) {
      try {
        addFn(items[i]);
        created++;
      } catch (err) {
        errors.push(`${label}[${i}]: ${err}`);
      }
      // Small delay every 10 items to let Supabase breathe
      if (i > 0 && i % 10 === 0) {
        await delay(50);
        onProgress?.(created, totalItems, label);
      }
    }
    // Gap between entity types
    await delay(200);
  };

  // Order matters: fields & bins first (they're referenced by records)
  await batchProcess('Fields', data.fields, (f) => {
    const { id, ...rest } = f;
    store.addField(rest);
  });

  await batchProcess('Bins', data.bins, (b) => {
    const { id, ...rest } = b;
    store.addBin(rest);
  });

  await batchProcess('Seeds', data.seeds, (s) => {
    store.addSeed(s.name);
  });

  await batchProcess('Spray Recipes', data.recipes, (r) => {
    store.addSprayRecipe(r);
  });

  // Wait for fields/bins to settle before adding records that reference them
  await delay(500);

  await batchProcess('Plant Records', data.plantRecords, (r) => {
    store.addPlantRecord(r);
  });

  await batchProcess('Spray Records', data.sprayRecords, (r) => {
    store.addSprayRecord(r);
  });

  await batchProcess('Harvest Records', data.harvestRecords, (r) => {
    store.addHarvestRecord(r);
  });

  await batchProcess('Hay Records', data.hayRecords, (r) => {
    store.addHayHarvestRecord(r);
  });

  await batchProcess('Fertilizer Records', data.fertilizerRecords, (r) => {
    store.addFertilizerApplication(r);
  });

  await batchProcess('Grain Movements', data.grainMovements, (r) => {
    store.addGrainMovement(r);
  });

  onProgress?.(totalItems, totalItems, 'Complete');

  return { totalCreated: created, errors };
}
