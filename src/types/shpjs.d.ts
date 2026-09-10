/**
 * Minimal local declaration for shpjs 6, which ships no TypeScript types.
 * Only the local shapefile-ZIP conversion surface AcreLedger uses is declared.
 */
declare module 'shpjs' {
  export interface ShpjsFeature {
    type: string;
    geometry?: { type: string; coordinates?: unknown } | null;
    properties?: Record<string, unknown> | null;
  }

  export interface ShpjsFeatureCollection {
    type: 'FeatureCollection';
    features?: ShpjsFeature[];
  }

  export default function shp(base: ArrayBuffer | Uint8Array): Promise<ShpjsFeatureCollection | ShpjsFeatureCollection[]>;
}
