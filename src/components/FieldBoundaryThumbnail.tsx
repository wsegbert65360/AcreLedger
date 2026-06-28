import { useMemo } from 'react';
import { MapPin } from 'lucide-react';

import { geometryToThumbnailPath } from '@/lib/fieldThumbnail';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';

const thumbnailPathCache = new Map<string, string | null>();

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

    const path = geometryToThumbnailPath(geometry);
    thumbnailPathCache.set(geometryKey, path);
    return path;
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
