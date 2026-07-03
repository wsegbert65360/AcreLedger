import { useMemo } from 'react';
import { MapPin } from 'lucide-react';

import { geometryToThumbnailPath } from '@/lib/fieldThumbnail';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';

/**
 * Path cache shared across thumbnail rows so each distinct boundary geometry is
 * projected at most once per session. Capped to keep memory bounded if boundaries
 * are edited repeatedly (each revision produces a new key); the oldest entry is
 * evicted FIFO when the cap is reached.
 */
const THUMBNAIL_CACHE_MAX = 256;
const thumbnailPathCache = new Map<string, string | null>();

function cacheThumbnailPath(key: string, path: string | null): string | null {
  if (thumbnailPathCache.size >= THUMBNAIL_CACHE_MAX) {
    // Map iterates in insertion order; drop the oldest entry.
    const oldestKey = thumbnailPathCache.keys().next().value;
    if (oldestKey !== undefined) thumbnailPathCache.delete(oldestKey);
  }
  thumbnailPathCache.set(key, path);
  return path;
}

interface FieldBoundaryThumbnailProps {
  geometry: GeoJSONGeometry | undefined | null;
}

export default function FieldBoundaryThumbnail({ geometry }: FieldBoundaryThumbnailProps) {
  const pathD = useMemo(() => {
    if (!geometry) return null;

    const geometryKey = JSON.stringify(geometry);
    if (thumbnailPathCache.has(geometryKey)) {
      return thumbnailPathCache.get(geometryKey) ?? null;
    }

    return cacheThumbnailPath(geometryKey, geometryToThumbnailPath(geometry));
  }, [geometry]);

  if (!pathD) {
    return <MapPin size={12} />;
  }

  return (
    <svg
      viewBox="0 0 44 44"
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className="w-full h-full"
      aria-hidden="true"
    >
      <path
        d={pathD}
        fillRule="evenodd"
        fill="currentColor"
        fillOpacity={0.35}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
