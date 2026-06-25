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

export type CapacityLevel = 'ok' | 'warning' | 'critical';

/** Signed bushel delta for a grain movement: negative for outbound, positive for inbound. */
export function getSignedBushels(movement: { type: 'in' | 'out'; bushels: number }): number {
    return movement.type === 'out' ? -movement.bushels : movement.bushels;
}

// 85/60 thresholds match the gauge gradient and status badge bands across the grain UI.
export function getCapacityLevel(percentFull: number): CapacityLevel {
    if (percentFull > 85) return 'critical';
    if (percentFull > 60) return 'warning';
    return 'ok';
}

export const CAPACITY_LEVEL_STYLES: Record<CapacityLevel, {
    tone: string;
    bar: string;
    statusLabel: string;
    statusClassName: string;
}> = {
    ok: {
        tone: 'text-primary',
        bar: 'bg-harvest',
        statusLabel: 'Room available',
        statusClassName: 'border-primary/30 bg-primary/10 text-primary',
    },
    warning: {
        tone: 'text-amber-700 dark:text-amber-300',
        bar: 'bg-amber-500',
        statusLabel: 'Nearing capacity',
        statusClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    },
    critical: {
        tone: 'text-destructive',
        bar: 'bg-destructive',
        statusLabel: 'Capacity alert',
        statusClassName: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
};
