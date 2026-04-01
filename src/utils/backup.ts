/**
 * Exports data as a JSON file and triggers a download in the browser.
 * Returns true on success, false on failure.
 */
export function exportDataAsJson(data: unknown, filename: string): boolean {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
