/**
 * Parse a date-only string (YYYY-MM-DD) as local midnight,
 * avoiding timezone shift from UTC parsing.
 */
export function parseLocalDate(iso: string): Date {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day); // local midnight, no UTC shift
}

/**
 * Render an epoch timestamp as a local YYYY-MM-DD string. Complements
 * parseLocalDate: `toISOString().split('T')[0]` renders UTC and shifts
 * evening entries to the next day in western timezones.
 */
export function toLocalIsoDate(ts: number): string {
    const d = new Date(ts);
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Format a Date for display using the user's local timezone.
 */
export function formatDisplayDate(date: Date): string {
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Format a date-only ISO string for display without timezone shift.
 */
export function formatIsoDate(iso?: string | null): string {
    if (!iso) return '';
    // Handle full ISO strings by taking only the date part
    const datePart = iso.split('T')[0];
    return formatDisplayDate(parseLocalDate(datePart));
}

/**
 * Format a timestamp into a short date/time string.
 */
export const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });

export const formatShortDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Fields used to sort an activity record by the date shown to the user. */
export interface WorkDateFields {
    date?: string;
    plantDate?: string;
    sprayDate?: string;
    harvestDate?: string;
    timestamp?: number;
}

/**
 * Milliseconds for sorting by the work date printed on the row, not when the
 * record was typed in. Falls back to timestamp when no work date is stored
 * (grain movements, legacy rows).
 */
export function getWorkDateMs(record: WorkDateFields): number {
    const dateStr = record.date || record.plantDate || record.sprayDate || record.harvestDate;
    if (dateStr) {
        const datePart = String(dateStr).split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
            const parsed = parseLocalDate(datePart);
            if (!isNaN(parsed.getTime())) return parsed.getTime();
        }
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
    if (typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)) {
        return record.timestamp;
    }
    return 0;
}

/** Newest work date first; same-day rows keep later save-time last as a tiebreaker. */
export function compareWorkDateDesc(a: WorkDateFields, b: WorkDateFields): number {
    const byDate = getWorkDateMs(b) - getWorkDateMs(a);
    if (byDate !== 0) return byDate;
    return (b.timestamp ?? 0) - (a.timestamp ?? 0);
}
