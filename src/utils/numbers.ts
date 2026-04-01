/**
 * Round a number to a given number of decimal places.
 * Avoids floating-point precision errors.
 */
export function roundTo(val: number, decimals: number = 2): number {
    if (typeof val !== 'number' || isNaN(val)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
}

/**
 * Format a measurement for display (e.g., acreage, yield).
 */
export function formatMeasurement(value: number, unit: string, decimals = 2): string {
    return `${roundTo(value, decimals).toLocaleString()} ${unit}`;
}
