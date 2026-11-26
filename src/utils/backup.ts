import { downloadFile } from '@/lib/downloadFile';


/**
 * Exports data as a JSON file and triggers a download in the browser.
 * Returns true on success, false on failure.
 */
export async function exportDataAsJson(data: unknown, filename: string): Promise<boolean> {
  try {
    const json = JSON.stringify(data, null, 2);

    return await downloadFile(json, filename, 'application/json', `AcreLedger Backup: ${filename}`);
  } catch (error) {
    console.error('Failed to export data as JSON:', error);
    return false;
  }
}

// Backup payload is constructed explicitly at call sites per BLUEPRINT.md.
