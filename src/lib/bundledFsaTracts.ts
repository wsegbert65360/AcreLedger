import type { TractFeatureCollection } from '@/lib/tractLookup';
import type { FsaTractImport } from '@/types/fsaTract';

const tractModules = import.meta.glob('../data/fsaTracts/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, TractFeatureCollection>;

function tractKeyFromPath(path: string): string {
  return path.split('/').pop()?.replace(/\.json$/i, '') || 'unknown';
}

export function getBundledFsaTracts(): FsaTractImport[] {
  return Object.entries(tractModules).map(([path, geojson]) => {
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
  });
}

export function mergeBundledFsaTracts(importedTracts: FsaTractImport[]): FsaTractImport[] {
  const importedKeys = new Set(importedTracts.filter(tract => !tract.deletedAt).map(tract => tract.tractKey));
  return [
    ...getBundledFsaTracts().filter(tract => !importedKeys.has(tract.tractKey)),
    ...importedTracts,
  ];
}
