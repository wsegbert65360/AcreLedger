export type ReportExportType =
  | 'fsa-plant'
  | 'spray-audit'
  | 'fertilizer-summary'
  | 'fsa-harvest'
  | 'hay-summary'
  | 'landlord-statement';

export interface ReportExportHistoryEntry {
  exportedAt: string;
  fingerprint: string;
}
export interface ReportExportStatus {
  exportedAt: string | null;
  hasChanges: boolean;
}

interface ReportExportScope {
  userId: string;
  farmId: string;
  seasonYear: number;
  reportType: ReportExportType;
}

function stableSerialize(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

export function buildReportFingerprint(value: unknown): string {
  const serialized = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function storageKey(scope: ReportExportScope): string {
  return `al_report_export_${scope.userId}_${scope.farmId}_${scope.seasonYear}_${scope.reportType}`;
}

export function readReportExportHistory(scope: ReportExportScope): ReportExportHistoryEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReportExportHistoryEntry>;
    if (typeof parsed.exportedAt !== 'string' || typeof parsed.fingerprint !== 'string') return null;
    return { exportedAt: parsed.exportedAt, fingerprint: parsed.fingerprint };
  } catch {
    return null;
  }
}

export function recordReportExport(
  scope: ReportExportScope,
  fingerprint: string,
  exportedAt = new Date().toISOString(),
): ReportExportHistoryEntry {
  const entry = { exportedAt, fingerprint };
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(entry));
  } catch {
    // Export history is helpful metadata; storage failures must not fail an export.
  }
  return entry;
}

export function getReportExportStatus(scope: ReportExportScope, fingerprint: string): ReportExportStatus {
  const history = readReportExportHistory(scope);
  return {
    exportedAt: history?.exportedAt ?? null,
    hasChanges: history ? history.fingerprint !== fingerprint : false,
  };
}
