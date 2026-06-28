import type { TractFeatureCollection } from '@/lib/tractLookup';
import type { FsaTractImport } from '@/types/fsaTract';

const tractModules = import.meta.glob('../data/fsaTracts/*.json', {
  import: 'default',
}) as Record<string, () => Promise<TractFeatureCollection>>;

let bundledFsaTractsPromise: Promise<FsaTractImport[]> | null = null;

function tractKeyFromPath(path: string): string {
  return path.split('/').pop()?.replace(/\.json$/i, '') || 'unknown';
}

function toBundledTract(path: string, geojson: TractFeatureCollection): FsaTractImport {
  const tractKey = tractKeyFromPath(path);

  return {
    id: `bundled-${tractKey}`,
    farmId: 'bundled',
    tractKey,
    filename: `${tractKey}.json`,
    featureCount: geojson.features.length,
    geojson,
    importedAt: '',
    deletedAt: null,
  };
}

export function loadBundledFsaTracts(): Promise<FsaTractImport[]> {
  bundledFsaTractsPromise ??= Promise.all(
    Object.entries(tractModules).map(async ([path, loadTract]) => toBundledTract(path, await loadTract())),
  ).catch(err => {
    bundledFsaTractsPromise = null;
    throw err;
  });

  return bundledFsaTractsPromise;
}

export function mergeBundledFsaTracts(
  importedTracts: FsaTractImport[],
  bundledTracts: FsaTractImport[],
): FsaTractImport[] {
  const importedKeys = new Set(importedTracts.filter(tract => !tract.deletedAt).map(tract => tract.tractKey));
  return [
    ...bundledTracts.filter(tract => !importedKeys.has(tract.tractKey)),
    ...importedTracts,
  ];
}

export async function loadMergedFsaTracts(importedTracts: FsaTractImport[]): Promise<FsaTractImport[]> {
  return mergeBundledFsaTracts(importedTracts, await loadBundledFsaTracts());
}
