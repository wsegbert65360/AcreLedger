/**
 * Parse a date-only string (YYYY-MM-DD) as local midnight,
 * avoiding timezone shift from UTC parsing.
 */
export function parseLocalDate(iso: string): Date {
    if (!iso || typeof iso !== 'string') return new Date(NaN);

    const parts = iso.split('-');
    if (parts.length !== 3) return new Date(NaN);

    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date(NaN);

    return new Date(year, month - 1, day); // local midnight, no UTC shift
}

/**
 * Format a Date for display using the user's local timezone.
 */
export function formatDisplayDate(date: Date): string {
    if (!date || isNaN(date.getTime())) return '';
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
export const formatDate = (ts: number) => {
    if (!ts || isNaN(ts)) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};
