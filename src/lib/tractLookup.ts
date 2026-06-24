export interface TractProperties {
  cluNumber: string;
  acres: number;
}

export interface TractFeature {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: TractProperties;
}

export interface TractFeatureCollection {
  type: 'FeatureCollection';
  features: TractFeature[];
}

const tractCache = new Map<string, TractFeatureCollection>();

export function parseTractKeys(fsaFarmNumber: string | null | undefined, fsaTractNumber: string | null | undefined): string[] {
  if (!fsaFarmNumber) return [];

  const farms = fsaFarmNumber.split('/').map(k => k.trim()).filter(Boolean);
  const tracts = (fsaTractNumber || '').split('/').map(k => k.trim()).filter(Boolean);

  // Combined format: "6418-1417/7653-12050"
  if (tracts.length === 0) {
    return Array.from(new Set(farms.filter(farm => farm.includes('-'))));
  }

  const keys: string[] = [];
  for (let i = 0; i < Math.max(farms.length, tracts.length); i++) {
    const farm = farms[Math.min(i, farms.length - 1)];
    const tract = tracts[Math.min(i, tracts.length - 1)];
    const farmNum = farm.includes('-') ? farm.split('-')[0] : farm;
    keys.push(`${farmNum}-${tract}`);
  }
  return Array.from(new Set(keys));
}

export async function loadTractData(keys: string[]): Promise<TractFeatureCollection[]> {
  const results: TractFeatureCollection[] = [];

  for (const key of keys) {
    if (tractCache.has(key)) {
      results.push(tractCache.get(key)!);
      continue;
    }

    try {
      const mod = await import(`../data/fsaTracts/${key}.json`);
      const collection = mod.default as TractFeatureCollection;
      tractCache.set(key, collection);
      results.push(collection);
    } catch {
      console.warn(`[tractLookup] Tract not found: ${key}`);
    }
  }

  return results;
}

export function loadTractDataFromStore(
  tractKeys: string[],
  importedTracts: { tractKey: string; geojson: TractFeatureCollection }[],
): TractFeatureCollection[] {
  const results: TractFeatureCollection[] = [];
  for (const key of tractKeys) {
    const tract = importedTracts.find(t => t.tractKey === key);
    if (tract) {
      results.push(tract.geojson);
    }
  }
  return results;
}
