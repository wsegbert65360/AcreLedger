/**
 * Parse a date-only string (YYYY-MM-DD) as local midnight,
 * avoiding timezone shift from UTC parsing.
 */
export function parseLocalDate(iso: string): Date {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day); // local midnight, no UTC shift
}

/**
 * Format a Date for display using the user's local timezone.
 */
export function formatDisplayDate(date: Date): string {
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
