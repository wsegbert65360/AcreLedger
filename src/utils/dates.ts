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
