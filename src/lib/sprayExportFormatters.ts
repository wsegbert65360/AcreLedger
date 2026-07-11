import { formatIsoDate } from '@/utils/dates';
import type { SprayRecord } from '@/types/farm';

export const MISSING_VALUE = '-';

/**
 * Formats a decimal number to a sensible precision for reports.
 * Typically 2 decimal places for rates/acres.
 */
export function formatNumber(val: number | undefined | null): string {
  if (val == null) return MISSING_VALUE;
  return val.toLocaleString(undefined, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 2 
  });
}

/**
 * Formats a unit string, defaulting to common units if missing.
 */
export function formatUnit(unit: string | undefined | null): string {
  if (!unit) return '';
  return unit.toLowerCase();
}

/**
 * Returns a readable compliance status string.
 */
export function getRecordOmissions(record: SprayRecord): string[] {
  const omissions: string[] = [];

  if (record.temperature == null) omissions.push('temperature');
  if (record.relativeHumidity == null) omissions.push('relative humidity');
  if (!record.products?.length) {
    omissions.push('products');
  } else if (record.products.some(product => !product.totalProductAmount || !product.totalProductUnit)) {
    omissions.push('one or more product totals');
  }

  return omissions;
}

export function getComplianceStatus(nonCompliant?: boolean, omissions: string[] = []): string {
  if (nonCompliant) {
    return 'Compliance Warning: Some recommended record details are missing.';
  }
  if (omissions.length > 0) {
    return `Record Status: Review needed - missing ${omissions.join(', ')}.`;
  }
  return 'Compliance Status: Complete';
}

/**
 * Formats time strings (HH:MM or full ISO) into human-readable 12h format.
 */
export function formatTime(timeStr?: string | null): string {
  if (!timeStr) return MISSING_VALUE;
  
  // If it's just HH:mm (e.g. "08:30")
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`;
  }

  // If it's a full Date object or ISO string
  try {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  } catch {
    // fallback
  }

  return timeStr;
}

/**
 * Formats the spray date for the report header.
 */
export function formatReportDate(dateStr?: string | null): string {
  if (!dateStr) return MISSING_VALUE;
  return formatIsoDate(dateStr);
}

/**
 * Safely joins multiple strings with a separator, filtering out empty values.
 */
export function joinParts(parts: (string | number | undefined | null)[], sep: string = ' '): string {
  return parts.filter(p => p != null && p !== '').join(sep) || MISSING_VALUE;
}

export function getChronologicalDateRange(records: SprayRecord[]): { start?: string; end?: string } {
  const dates = records
    .map(record => record.sprayDate)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => a.localeCompare(b));

  return { start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Removes illegal characters from filenames.
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'export';
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}
