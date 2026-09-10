import type { ShpjsFeatureCollection } from 'shpjs';
import type { TractFeature, TractFeatureCollection } from '@/lib/tractLookup';
import { calculateAcreage } from '@/lib/gisService';

/** One farm/tract group parsed from a boundary file. */
export interface ParsedCluTract {
  tractKey: string;
  collection: TractFeatureCollection;
}

interface RawFeature {
  type: string;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

const WEB_MERCATOR_MAX = 20037508.34;

function isWebMercator(coords: number[][][] | number[][][][]): boolean {
  // If it's a MultiPolygon, grab the first polygon
  const firstPoly = (coords.length > 0 && Array.isArray(coords[0][0][0])) ? coords[0] as number[][][] : coords as number[][][];
  for (const ring of firstPoly) {
    for (const pt of ring) {
      if (Math.abs(pt[0]) > 180 || Math.abs(pt[1]) > 90) return true;
    }
  }
  return false;
}

function webMercatorToWgs84(x: number, y: number): [number, number] {
  const lng = (x / WEB_MERCATOR_MAX) * 180;
  const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / WEB_MERCATOR_MAX) * Math.PI)) - Math.PI / 2);
  return [lng, lat];
}

function convertCoordsToWgs84(coords: any[]): any[] {
  if (coords.length === 0) return [];
  if (typeof coords[0] === 'number') {
    const pt = webMercatorToWgs84(coords[0], coords[1]);
    return pt;
  }
  return coords.map(c => convertCoordsToWgs84(c));
}

function normalizePropertyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readProperty(props: Record<string, unknown>, names: string[]): unknown {
  const wanted = new Set(names.map(normalizePropertyName));
  for (const [key, value] of Object.entries(props)) {
    if (wanted.has(normalizePropertyName(key))) return value;
  }
  return undefined;
}

function readTrimmedProperty(props: Record<string, unknown>, names: string[]): string | undefined {
  const raw = readProperty(props, names);
  const value = raw != null ? String(raw).trim() : '';
  return value || undefined;
}

const CLU_NUMBER_FIELDS = [
  'cluNumber',
  'clu_number',
  'CLU_NUMBER',
  'clu num',
  'clu',
  'clu_no',
  'CLU_NO',
  'plu_number',
  'PLU_NUMBER',
  'pluNumber',
  'plu num',
  'plu',
];

const ACRES_FIELDS = [
  'acres',
  'clu_acres',
  'CLU_ACRES',
  'calc_acres',
  'calculated acres',
  'calculated_acres',
  'CALCULATED_ACRES',
];

const FARM_NUMBER_FIELDS = [
  'farm_num',
  'farm_number',
  'farmNum',
  'farmNumber',
  'FARM_NUM',
  'farm number',
  'farm_no',
  'farmNo',
  'fsa_farm_number',
];

const TRACT_NUMBER_FIELDS = [
  'tract_num',
  'tract_number',
  'tractNum',
  'tractNumber',
  'TRACT_NUM',
  'tract number',
  'tract_no',
  'tractNo',
  'tract',
];

function getCluNumber(props: Record<string, unknown>): string | undefined {
  return readTrimmedProperty(props, CLU_NUMBER_FIELDS);
}

function getAcres(props: Record<string, unknown>): number | null {
  const raw = readProperty(props, ACRES_FIELDS);
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return null;
  const numeric = Number(typeof raw === 'string' ? raw.replace(/,/g, '') : raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function getFarmTractKey(props: Record<string, unknown>): string | null {
  const farmNumber = readTrimmedProperty(props, FARM_NUMBER_FIELDS);
  const tractNumber = readTrimmedProperty(props, TRACT_NUMBER_FIELDS);
  if (!farmNumber || !tractNumber) return null;
  // FSA farm and tract numbers are numeric; placeholders like "TBD" must not
  // become a made-up tract key.
  if (!/^\d+$/.test(farmNumber) || !/^\d+$/.test(tractNumber)) return null;
  return `${farmNumber}-${tractNumber}`;
}

function isPolygonFeature(feature: RawFeature): boolean {
  if (feature.type !== 'Feature') return false;
  const geom = feature.geometry;
  return (geom?.type === 'Polygon' || geom?.type === 'MultiPolygon') && Array.isArray(geom.coordinates);
}

function buildTractFeature(feature: RawFeature, convertProjection: boolean): TractFeature {
  const props = feature.properties ?? {};
  const geom = feature.geometry as { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
  const coordinates = convertProjection ? convertCoordsToWgs84(geom.coordinates) : geom.coordinates;
  const geometry = { type: geom.type, coordinates } as TractFeature['geometry'];

  return {
    type: 'Feature',
    geometry,
    properties: {
      cluNumber: String(getCluNumber(props)),
      acres: getAcres(props) ?? calculateAcreage(geometry),
    },
  };
}

/**
 * Compatibility single-tract reader. The import path goes through
 * `parseCluFile`, which groups boundaries by farm/tract and rejects files
 * with missing CLU numbers; keep this export's lenient behavior stable for
 * existing callers.
 */
export function parseCluGeoJson(contents: string, filename: string): { tractKey: string; collection: TractFeatureCollection } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection with CLU polygon features.');
  }

  const features = (obj.features as unknown as RawFeature[]).filter(isPolygonFeature);

  if (features.length === 0) {
    throw new Error('No CLU polygon features found in this file.');
  }

  const featuresWithClu = features.filter(f => {
    const props = f.properties as Record<string, unknown> | undefined;
    const cluNum = getCluNumber(props ?? {});
    return cluNum !== undefined && String(cluNum).trim();
  });

  if (featuresWithClu.length === 0) {
    throw new Error('No features with CLU numbers found. Ensure features have a CLU/PLU number property such as "cluNumber", "clu_number", "CLU_NUMBER", or "plu_number".');
  }

  let needsProjection = false;
  for (const f of featuresWithClu) {
    const geom = f.geometry as Record<string, unknown>;
    if (isWebMercator(geom.coordinates as any)) {
      needsProjection = true;
      break;
    }
  }

  const collection: TractFeatureCollection = {
    type: 'FeatureCollection',
    features: featuresWithClu.map(f => buildTractFeature(f, needsProjection)),
  };

  const tractKey = extractTractKey(filename, featuresWithClu);

  return { tractKey, collection };
}

/**
 * Rejects the whole file when any boundary polygon lacks its field or CLU
 * number. Importing only the numbered boundaries would silently drop fields,
 * so the farmer is asked to request a complete file instead.
 */
function requireCompleteCluNumbers(polygons: RawFeature[]): void {
  const missing = polygons.filter(f => getCluNumber(f.properties ?? {}) === undefined);
  if (missing.length === 0) return;

  if (missing.length === polygons.length) {
    throw new Error('AcreLedger could not find FSA field or CLU numbers in this file. Ask FSA for a complete file that includes the field or CLU number for every boundary.');
  }
  throw new Error(`This file is missing the field or CLU number on ${missing.length} of ${polygons.length} field boundaries. Ask FSA for a complete file that includes the field or CLU number for every boundary.`);
}

const UNIDENTIFIED_TRACT_MESSAGE = 'AcreLedger could not tell which FSA farm and tract these field boundaries belong to. Please rename the file to include the farm and tract number, like 4251-9747.zip, or ask FSA to include the farm and tract numbers in the file.';

/**
 * Groups validated features into one tract collection per farm/tract
 * combination. When the file name carries no farm-tract number, every feature
 * must identify its own farm and tract — a generic name like "fields.zip"
 * must never become a made-up tract number.
 */
function groupTractFeatures(features: RawFeature[], filenameKey: string | null, convertProjection: boolean): ParsedCluTract[] {
  if (filenameKey === null && features.some(feature => getFarmTractKey(feature.properties ?? {}) === null)) {
    throw new Error(UNIDENTIFIED_TRACT_MESSAGE);
  }

  const groups = new Map<string, TractFeature[]>();
  for (const feature of features) {
    const tractKey = getFarmTractKey(feature.properties ?? {}) ?? filenameKey!;
    const built = groups.get(tractKey) ?? [];
    built.push(buildTractFeature(feature, convertProjection));
    groups.set(tractKey, built);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tractKey, groupedFeatures]) => ({
      tractKey,
      collection: { type: 'FeatureCollection' as const, features: groupedFeatures },
    }));
}

/**
 * Parses a GeoJSON file into one tract per farm/tract combination, mirroring
 * the shapefile ZIP import path. Files where any boundary polygon is missing
 * its CLU number are rejected outright.
 */
export function parseCluGeoJsonTracts(contents: string, filename: string): ParsedCluTract[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection with CLU polygon features.');
  }

  const polygons = (obj.features as unknown as RawFeature[]).filter(isPolygonFeature);

  if (polygons.length === 0) {
    throw new Error('No CLU polygon features found in this file.');
  }

  requireCompleteCluNumbers(polygons);

  let needsProjection = false;
  for (const f of polygons) {
    const geom = f.geometry as Record<string, unknown>;
    if (isWebMercator(geom.coordinates as any)) {
      needsProjection = true;
      break;
    }
  }

  const fallbackKey = filenameTractKey(filename);
  return groupTractFeatures(polygons, fallbackKey, needsProjection);
}

function stripExtension(filename: string): string {
  return filename.split('/').pop()?.split('\\').pop()?.replace(/\.(zip|json|geojson)$/i, '') ?? '';
}

function filenameTractKey(filename: string): string | null {
  const basename = stripExtension(filename);

  if (/^\d+-\d+$/.test(basename)) return basename;

  const match = basename.match(/(\d+)[-_](\d+)/);
  if (match) return `${match[1]}-${match[2]}`;

  const fMatch = basename.match(/^F(\d+)_T(\d+)/i);
  if (fMatch) return `${fMatch[1]}-${fMatch[2]}`;

  return null;
}

function extractTractKey(filename: string, features: RawFeature[]): string {
  const fromFilename = filenameTractKey(filename);
  if (fromFilename) return fromFilename;

  const firstProps = features[0]?.properties as Record<string, unknown> | undefined;
  const fromProps = firstProps ? getFarmTractKey(firstProps) : null;
  if (fromProps) return fromProps;

  return stripExtension(filename) || 'unknown';
}

/** True when every coordinate pair is within WGS84 longitude/latitude bounds. */
function coordsWithinWgs84(coords: unknown): boolean {
  if (!Array.isArray(coords) || coords.length === 0) return true;
  if (typeof coords[0] === 'number') {
    const [x, y] = coords as number[];
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90;
  }
  return (coords as unknown[]).every(coordsWithinWgs84);
}

/**
 * Converts an FSA shapefile ZIP into grouped CLU tract collections, entirely
 * on the device. One returned tract per farm/tract combination in the file.
 */
export async function parseCluZip(buffer: ArrayBuffer, filename: string): Promise<ParsedCluTract[]> {
  let parsed: ShpjsFeatureCollection | ShpjsFeatureCollection[];
  try {
    const shp = (await import('shpjs')).default;
    parsed = await shp(buffer);
  } catch (err) {
    console.error('[cluImport] Failed to read shapefile ZIP:', err);
    throw new Error('This ZIP does not contain a complete shapefile. Ask FSA to include the SHP, DBF, SHX, and PRJ files.');
  }

  const collections = Array.isArray(parsed) ? parsed : [parsed];
  const polygons = collections.flatMap(collection => collection.features ?? []).filter(isPolygonFeature);

  if (polygons.length === 0) {
    throw new Error('No field boundary polygons were found.');
  }

  // A shapefile ZIP with no attributes at all means the DBF sidecar is missing.
  const hasAttributes = polygons.some(feature => feature.properties && Object.keys(feature.properties).length > 0);
  if (!hasAttributes) {
    throw new Error('This ZIP does not contain a complete shapefile. Ask FSA to include the SHP, DBF, SHX, and PRJ files.');
  }

  for (const feature of polygons) {
    if (!coordsWithinWgs84(feature.geometry?.coordinates)) {
      throw new Error('This boundary file uses a map coordinate system AcreLedger could not identify. Ask FSA to include the PRJ file with the shapefile.');
    }
  }

  requireCompleteCluNumbers(polygons);

  return groupTractFeatures(polygons, filenameTractKey(filename), false);
}

/** Blob.text() fallback for engines (and test environments) without it. */
function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
    reader.readAsText(file);
  });
}

/** Blob.arrayBuffer() fallback for engines (and test environments) without it. */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Shared file entry point: reads a .zip shapefile or a .json/.geojson file into CLU tracts. */
export async function parseCluFile(file: File): Promise<ParsedCluTract[]> {
  if (file.name.toLowerCase().endsWith('.zip')) {
    return parseCluZip(await readFileAsArrayBuffer(file), file.name);
  }

  const contents = await readFileAsText(file);
  return parseCluGeoJsonTracts(contents, file.name);
}
