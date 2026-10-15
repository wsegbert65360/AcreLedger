export interface GridSpec {
  latStart: number;
  lonStart: number;
  latStep: number;
  lonStep: number;
  rows: number;
  cols: number;
}

export interface GridPoint {
  lat: number;
  lng: number;
}

/** 16-bit and 8-bit PNG packings use the all-ones code as the MRMS missing sentinel. */
const MISSING_RAW_16 = 0xffff;
const MISSING_RAW_8 = 0xff;

export function gridCell(coord: GridPoint, grid: GridSpec): { row: number; col: number } | null {
  const row = Math.round((grid.latStart - coord.lat) / Math.abs(grid.latStep));
  const col = Math.round((coord.lng - grid.lonStart) / grid.lonStep);
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return null;
  return { row, col };
}

/**
 * Unpack one GRIB2 PNG sample to inches.
 * Out-of-range callers never reach here. Missing sentinels and negative
 * results are null so ingestion does not store a fake zero.
 */
export function inchesFromPacked(
  raw: number,
  ref: number,
  exp: number,
  decimal: number,
  depth: number,
): number | null {
  if (!Number.isFinite(raw)) return null;
  if (depth >= 16 ? raw === MISSING_RAW_16 : raw === MISSING_RAW_8) return null;
  const multiplier = (Math.pow(2, exp) / Math.pow(10, decimal)) * 0.0393701;
  const inches = (ref + raw) * multiplier;
  if (!Number.isFinite(inches) || inches < 0) return null;
  return inches;
}
