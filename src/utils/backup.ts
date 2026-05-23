import { Capacitor } from '@capacitor/core';

import { native } from '@/lib/native';

/**
 * Exports data as a JSON file and triggers a download in the browser.
 * Returns true on success, false on failure.
 */
export async function exportDataAsJson(data: unknown, filename: string): Promise<boolean> {
  try {
    const json = JSON.stringify(data, null, 2);

    if (Capacitor.isNativePlatform()) {
      return native.shareFile({
        fileName: filename,
        data: json,
        title: `AcreLedger Backup: ${filename}`,
        encoding: 'utf8'
      });
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revoke so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (error) {
    console.error('Failed to export data as JSON:', error);
    return false;
  }
}

// Backup payload is constructed explicitly at call sites per BLUEPRINT.md.
