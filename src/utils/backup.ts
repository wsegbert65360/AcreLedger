/**
 * Exports data as a JSON file and triggers a download in the browser.
 */
export function exportDataAsJson(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Creates a standard farm data backup object.
 */
export function createBackupData(store: any) {
  return {
    fields: store.fields,
    plantRecords: store.plantRecords,
    sprayRecords: store.sprayRecords,
    harvestRecords: store.harvestRecords,
    hayHarvestRecords: store.hayHarvestRecords,
    grainMovements: store.grainMovements,
    savedSeeds: store.savedSeeds,
    sprayRecipes: store.sprayRecipes,
    backupDate: new Date().toISOString(),
  };
}
