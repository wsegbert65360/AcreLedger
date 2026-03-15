/**
 * Exports data as a JSON file and triggers a download in the browser.
 */
export function exportDataAsJson(data: any, filename: string): boolean {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Failed to export data as JSON:', error);
    return false;
  }
}

/**
 * Creates a standard farm data backup object.
 */
export function createBackupData(dataToBackup: any) {
  return {
    ...dataToBackup,
    backupDate: new Date().toISOString(),
  };
}
