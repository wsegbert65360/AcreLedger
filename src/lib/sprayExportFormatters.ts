import { formatIsoDate } from '@/utils/dates';

/**
 * Formats a decimal number to a sensible precision for reports.
 * Typically 2 decimal places for rates/acres.
 */
export function formatNumber(val: number | undefined | null): string {
  if (val == null) return '—';
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
export function getComplianceStatus(nonCompliant?: boolean): string {
  return nonCompliant 
    ? 'Compliance Warning: Some recommended record details are missing.' 
    : 'Compliance Status: Complete';
}

/**
 * Formats time strings (HH:MM or full ISO) into human-readable 12h format.
 */
export function formatTime(timeStr?: string | null): string {
  if (!timeStr) return '—';
  
  // If it's just HH:mm (e.g. "08:30")
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
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
  } catch (e) {
    // fallback
  }

  return timeStr;
}

/**
 * Formats the spray date for the report header.
 */
export function formatReportDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return formatIsoDate(dateStr);
}

/**
 * Safely joins multiple strings with a separator, filtering out empty values.
 */
export function joinParts(parts: (string | number | undefined | null)[], sep: string = ' '): string {
  return parts.filter(p => p != null && p !== '').join(sep) || '—';
}

/**
 * Removes illegal characters from filenames.
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'export';
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}
