/**
 * Shared logic for MRMS GRIB2 processing in Supabase Edge Functions (Deno).
 */
import { decode } from "https://esm.sh/fast-png@6.1.0";

export interface Coordinate {
  lat: number;
  lng: number;
}

export const MRMS_CONFIG = {
  baseUrl: 'https://mrms.ncep.noaa.gov/2D/',
  // CONUS grid from NOAA MRMS QPE documentation: 0.01° resolution, 3500×7000
  grid: {
    latStart: 54.995,
    latEnd: 20.005,
    lonStart: -129.995,
    lonEnd: -60.005,
    latStep: -0.01,
    lonStep: 0.01,
    rows: 3500,
    cols: 7000
  }
};

/**
 * Downloads and decompresses an MRMS GRIB2 file.
 */
export async function downloadAndDecompress(url: string): Promise<Uint8Array | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) return null;

  const stream = response.body?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) return null;

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Parses a GRIB2 file from MRMS MultiSensor_QPE_01H and extracts rainfall
 * values (in inches) for the given coordinates.
 *
 * Pipeline: raw GRIB2 → locate Section 5 (DRS) + Section 7 (data) →
 * decode embedded PNG → map lat/lng to pixel index → apply DRS formula.
 */
export function extractRainfall(data: Uint8Array, coords: Coordinate[]): number[] {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    
    // Find Section 5 (Data Representation) and Section 7 (Data)
    let offset = 16; // Skip Message Header (Section 0)
    let section5: { ref: number, exp: number, decimal: number, bits: number } | null = null;
    let section7Offset = -1;

    while (offset + 20 <= data.length) {
        if (data[offset] === 0x37 && data[offset+1] === 0x37 && data[offset+2] === 0x37 && data[offset+3] === 0x37) break;
        const sectLen = view.getInt32(offset);
        const sectNum = view.getUint8(offset + 4);

        if (sectNum === 5) {
            section5 = {
                ref: view.getFloat32(offset + 11),
                exp: view.getInt16(offset + 15),
                decimal: view.getInt16(offset + 17),
                bits: view.getUint8(offset + 19)
            };
        } else if (sectNum === 7) {
            section7Offset = offset + 5;
            break;
        }
        if (sectLen <= 0) break; 
        offset += sectLen;
    }

    if (!section5 || section7Offset === -1) return coords.map(() => 0);

    const { ref, exp, decimal } = section5;
    const pngData = data.slice(section7Offset);
    
    // fast-png@6.x: depth===16 produces Uint16Array, lower depths produce Uint8Array
    let pixels: Uint16Array | Uint8Array;
    try {
        const decoded = decode(pngData);
        if (decoded.depth !== 16) {
            console.warn(`[MRMS] PNG depth=${decoded.depth}, expected 16-bit grayscale`);
        }
        pixels = decoded.data as Uint16Array | Uint8Array;

        const expectedPixels = MRMS_CONFIG.grid.rows * MRMS_CONFIG.grid.cols;
        if (pixels.length < expectedPixels) {
            console.warn(`[MRMS] Pixel buffer too small: ${pixels.length} < ${expectedPixels}`);
            return coords.map(() => 0);
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[MRMS] PNG decode failed: ${msg}`);
        return coords.map(() => 0);
    }

    const values: number[] = [];
    const multiplier = (Math.pow(2, exp) / Math.pow(10, decimal)) * 0.0393701; // mm to inches

    for (const coord of coords) {
        const row = Math.round((MRMS_CONFIG.grid.latStart - coord.lat) / Math.abs(MRMS_CONFIG.grid.latStep));
        const col = Math.round((coord.lng - MRMS_CONFIG.grid.lonStart) / MRMS_CONFIG.grid.lonStep);

        if (row < 0 || row >= MRMS_CONFIG.grid.rows || col < 0 || col >= MRMS_CONFIG.grid.cols) {
            values.push(0);
            continue;
        }

        const index = row * MRMS_CONFIG.grid.cols + col;
        if (index >= pixels.length) {
            values.push(0);
            continue;
        }

        const raw = pixels[index];
        const val = (ref + raw) * multiplier;
        values.push(Math.max(0, val));
    }

    return values;
}

/** Validates that MRMS_CONFIG.grid dimensions match the lat/lon range and step size. */
export function validateGridConfig(): void {
  const g = MRMS_CONFIG.grid;
  const expectedRows = Math.round((g.latStart - g.latEnd) / Math.abs(g.latStep)) + 1;
  const expectedCols = Math.round((g.lonEnd - g.lonStart) / g.lonStep) + 1;
  if (expectedRows !== g.rows || expectedCols !== g.cols) {
    console.warn(`[MRMS] Grid config mismatch: calculated ${expectedRows}x${expectedCols} vs configured ${g.rows}x${g.cols}`);
  }
}
