import { hasValidGeometry, type GeoJSONGeometry } from '@/lib/geoHelpers';
import type { Field } from '@/types/farm';
import type { FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';
import { parseTractKeys } from '@/lib/tractLookup';

export const THUMBNAIL_VIEWBOX_SIZE = 44;
export const THUMBNAIL_PADDING = 5;
const DRAWABLE = THUMBNAIL_VIEWBOX_SIZE - 2 * THUMBNAIL_PADDING;

export interface FieldGeometryOptions {
  /** Resolve CLU geometry before falling back to the saved field boundary. */
  preferAssignments?: boolean;
  /** Include only assignments explicitly marked as cropland. */
  croplandOnly?: boolean;
}

export function geometryToThumbnailPath(
  geometry: GeoJSONGeometry | undefined | null,
): string | null {
  if (!hasValidGeometry(geometry ?? undefined)) return null;

  try {
    const polygons: number[][][][] =
      geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry?.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];

    if (polygons.length === 0) return null;

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let pointCount = 0;

    for (const poly of polygons) {
      for (const ring of poly) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          pointCount++;
        }
      }
    }

    if (pointCount < 3) return null;

    const lngRange = maxLng - minLng;
    const latRange = maxLat - minLat;
    if (lngRange <= 0 || latRange <= 0) return null;

    const scale = DRAWABLE / Math.max(lngRange, latRange);
    const offsetX = (THUMBNAIL_VIEWBOX_SIZE - lngRange * scale) / 2;
    const offsetY = (THUMBNAIL_VIEWBOX_SIZE - latRange * scale) / 2;

    const project = (lng: number, lat: number): [number, number] => {
      const x = offsetX + (lng - minLng) * scale;
      const y = THUMBNAIL_VIEWBOX_SIZE - (offsetY + (lat - minLat) * scale);
      return [x, y];
    };

    const subpaths: string[] = [];
    for (const poly of polygons) {
      for (const ring of poly) {
        if (ring.length < 3) continue;
        const [fx, fy] = project(ring[0][0], ring[0][1]);
        let d = `M ${fx.toFixed(2)} ${fy.toFixed(2)}`;
        for (let i = 1; i < ring.length; i++) {
          const [x, y] = project(ring[i][0], ring[i][1]);
          d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
        }
        d += ' Z';
        subpaths.push(d);
      }
    }

    return subpaths.length > 0 ? subpaths.join(' ') : null;
  } catch {
    return null;
  }
}

export function getFieldThumbnailGeometry(
  field: Pick<Field, 'id' | 'boundary' | 'cluNumbers' | 'fsaFarmNumber' | 'fsaTractNumber'>,
  assignments: FieldCluAssignment[],
  tracts: FsaTractImport[],
  options: FieldGeometryOptions = {},
): GeoJSONGeometry | null {
  if (!options.preferAssignments && hasValidGeometry(field.boundary ?? undefined)) {
    return field.boundary ?? null;
  }

  const tractByKey = new Map(
    tracts
      .filter(tract => !tract.deletedAt)
      .map(tract => [tract.tractKey, tract] as const),
  );
  const allActiveAssignments = assignments.filter(
    assignment => assignment.fieldId === field.id && !assignment.deletedAt,
  );
  const activeAssignments = options.croplandOnly
    ? allActiveAssignments.filter(assignment => assignment.landUse === 'cropland')
    : allActiveAssignments;
  const assignmentKeys = new Set(activeAssignments.map(assignment => `${assignment.tractKey}:${assignment.cluNumber}`));

  // Legacy fields do not store land use per CLU. Treat their saved CLU list as
  // cropland only when no explicit assignment records exist.
  if (allActiveAssignments.length === 0 && field.cluNumbers?.length) {
    for (const tractKey of parseTractKeys(field.fsaFarmNumber, field.fsaTractNumber)) {
      for (const cluNumber of field.cluNumbers) {
        assignmentKeys.add(`${tractKey}:${cluNumber}`);
      }
    }
  }

  const polygons: number[][][][] = [];
  for (const key of assignmentKeys) {
    const [tractKey, cluNumber] = key.split(':');
    const tract = tractByKey.get(tractKey);
    if (!tract) continue;

    const feature = tract.geojson.features.find(item => item.properties.cluNumber === cluNumber);
    if (!feature || !hasValidGeometry(feature.geometry)) continue;

    if (feature.geometry.type === 'Polygon') {
      polygons.push(feature.geometry.coordinates);
    } else {
      polygons.push(...feature.geometry.coordinates);
    }
  }

  if (polygons.length > 0) {
    return { type: 'MultiPolygon', coordinates: polygons };
  }

  // When explicit assignments exist, a cropland-only request must not fall
  // back to a boundary that can include non-cropland acres.
  if (options.croplandOnly && allActiveAssignments.length > 0) {
    return null;
  }

  return hasValidGeometry(field.boundary ?? undefined) ? field.boundary ?? null : null;
}
