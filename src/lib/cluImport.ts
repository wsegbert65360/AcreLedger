import type { TractFeatureCollection } from '@/lib/tractLookup';

const WEB_MERCATOR_MAX = 20037508.34;

function isWebMercator(coords: number[][]): boolean {
  for (const ring of coords) {
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

function convertCoordsToWgs84(coords: number[][][]): number[][][] {
  return coords.map(ring => ring.map(pt => webMercatorToWgs84(pt[0], pt[1])));
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

function getCluNumber(props: Record<string, unknown>): string | undefined {
  const raw = readProperty(props, [
    'cluNumber',
    'clu_number',
    'CLU_NUMBER',
    'clu num',
    'clu',
    'plu_number',
    'PLU_NUMBER',
    'pluNumber',
    'plu num',
    'plu',
  ]);
  const value = raw != null ? String(raw).trim() : '';
  return value || undefined;
}

function getAcres(props: Record<string, unknown>): number {
  const raw = readProperty(props, ['acres', 'clu_acres', 'CLU_ACRES', 'calc_acres', 'calculated acres']);
  return Number(raw) || 0;
}

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

  const features = (obj.features as Record<string, unknown>[])
    .filter(f => {
      if (f.type !== 'Feature') return false;
      const geom = f.geometry as Record<string, unknown> | undefined;
      return geom?.type === 'Polygon' && Array.isArray(geom.coordinates);
    });

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
    if (isWebMercator(geom.coordinates as number[][])) {
      needsProjection = true;
      break;
    }
  }

  const collection: TractFeatureCollection = {
    type: 'FeatureCollection',
    features: featuresWithClu.map(f => {
      const props = f.properties as Record<string, unknown>;
      const geom = f.geometry as { type: string; coordinates: number[][][] };
      const coords = needsProjection ? convertCoordsToWgs84(geom.coordinates) : geom.coordinates;

      return {
        type: 'Feature',
        geometry: { type: 'Polygon' as const, coordinates: coords },
        properties: {
          cluNumber: String(getCluNumber(props)),
          acres: getAcres(props),
        },
      };
    }),
  };

  const tractKey = extractTractKey(filename, featuresWithClu);

  return { tractKey, collection };
}

function extractTractKey(filename: string, features: Record<string, unknown>[]): string {
  const basename = filename.split('/').pop()?.split('\\').pop()?.replace(/\.(json|geojson)$/i, '') ?? '';

  if (/^\d+-\d+$/.test(basename)) return basename;

  const match = basename.match(/(\d+)[-_](\d+)/);
  if (match) return `${match[1]}-${match[2]}`;

  const fMatch = basename.match(/^F(\d+)_T(\d+)/i);
  if (fMatch) return `${fMatch[1]}-${fMatch[2]}`;

  const firstProps = features[0]?.properties as Record<string, unknown> | undefined;
  const farmNum = firstProps ? readProperty(firstProps, ['farm_num', 'farmNum', 'FARM_NUM', 'farm number']) : undefined;
  const tractNum = firstProps ? readProperty(firstProps, ['tract_num', 'tractNumber', 'TRACT_NUM', 'tract number', 'tract']) : undefined;
  if (farmNum && tractNum) return `${farmNum}-${tractNum}`;

  return basename || 'unknown';
}
