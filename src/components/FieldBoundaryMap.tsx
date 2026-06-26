import { useEffect, useMemo, useRef, useState } from 'react';

import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import '@/lib/leafletSetup';

import { useFarm } from '@/store/farmStore';
import { loadTractData, parseTractKeys, type TractFeature, type TractFeatureCollection } from '@/lib/tractLookup';
import type { CluLandUse, FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';
import type { Field } from '@/types/farm';
import { getLatLngsFromGeometry, hasValidGeometry } from '@/lib/geoHelpers';

interface FieldBoundaryMapProps {
  fieldId: string;
}

type DisplayFeature = TractFeature & {
  tractKey: string;
  landUse: CluLandUse | null;
  isAssigned: boolean;
};

interface KeyedCollection {
  tractKey: string;
  collection: TractFeatureCollection;
}

const CLU_STYLES = {
  assignedCropland: { color: '#86efac', fillColor: '#22c55e', weight: 3, opacity: 1, fillOpacity: 0.32 },
  assignedNonCropland: { color: '#fbbf24', fillColor: '#f97316', weight: 3, opacity: 1, fillOpacity: 0.3 },
  legacy: { color: '#93c5fd', fillColor: '#3b82f6', weight: 3, opacity: 0.92, fillOpacity: 0.22 },
  context: { color: '#cbd5e1', fillColor: '#64748b', weight: 2, opacity: 0.65, fillOpacity: 0.08 },
};

async function loadKeyedCollections(
  tractKeys: string[],
  importedTracts: FsaTractImport[],
): Promise<KeyedCollection[]> {
  const importedByKey = new Map(
    importedTracts
      .filter(tract => !tract.deletedAt)
      .map(tract => [tract.tractKey, tract.geojson] as const),
  );
  const collections: KeyedCollection[] = [];

  for (const tractKey of tractKeys) {
    const imported = importedByKey.get(tractKey);
    if (imported) {
      collections.push({ tractKey, collection: imported });
      continue;
    }

    const [bundled] = await loadTractData([tractKey]);
    if (bundled) {
      collections.push({ tractKey, collection: bundled });
    }
  }

  return collections;
}

function boundaryRings(field: Field | undefined): L.LatLngExpression[][] {
  return (field?.boundary?.coordinates ?? [])
    .map(ring => ring.map(point => [point[1], point[0]] as L.LatLngExpression))
    .filter(ring => ring.length >= 3);
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });

    observer.observe(container);
    map.invalidateSize({ pan: false });

    return () => observer.disconnect();
  }, [map]);

  return null;
}

function TractPolygons({ features, field }: { features: DisplayFeature[]; field: Field | undefined }) {
  const map = useMap();
  const groupRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    // Always remove old layers first
    if (groupRef.current) {
      map.removeLayer(groupRef.current);
      groupRef.current = null;
    }

    if (features.length === 0) return;

    const group = L.featureGroup();

    let polyCount = 0;
    for (const feat of features) {
      if (!hasValidGeometry(feat.geometry)) continue;

      const latlngs = getLatLngsFromGeometry(feat.geometry);
      const style = feat.isAssigned
        ? feat.landUse === 'non_cropland' ? CLU_STYLES.assignedNonCropland : CLU_STYLES.assignedCropland
        : feat.landUse ? CLU_STYLES.legacy : CLU_STYLES.context;
      const poly = L.polygon(latlngs, {
        ...style,
        lineJoin: 'round',
      });

      poly.addTo(group);
      polyCount++;

      if (feat.properties.cluNumber) {
        const landUseLabel = feat.landUse === 'non_cropland' ? 'Non-crop' : 'Crop';
        poly.bindTooltip(feat.landUse ? `${feat.properties.cluNumber} · ${landUseLabel}` : feat.properties.cluNumber, {
          permanent: true,
          direction: 'center',
          className: 'tract-clu-tooltip',
        });
      }
    }

    const rings = boundaryRings(field);
    for (const ring of rings) {
      L.polygon(ring, {
        color: '#020617',
        weight: 6,
        opacity: 0.55,
        fillOpacity: 0,
        interactive: false,
        lineJoin: 'round',
      }).addTo(group);
      L.polygon(ring, {
        color: '#f8fafc',
        weight: 3,
        opacity: 0.95,
        fillOpacity: 0,
        interactive: false,
        lineJoin: 'round',
      }).addTo(group);
      L.polygon(ring, {
        color: '#4ade80',
        weight: 1.5,
        opacity: 0.9,
        dashArray: '6 5',
        fillOpacity: 0,
        interactive: false,
        lineJoin: 'round',
      }).addTo(group);
      polyCount++;
    }

    group.addTo(map);

    if (polyCount > 0) {
      const bounds = group.getBounds();
      map.fitBounds(bounds, { padding: [18, 18], maxZoom: 17 });
    }

    groupRef.current = group;

    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
  }, [features, field, map]);

  return null;
}

export default function FieldBoundaryMap({ fieldId }: FieldBoundaryMapProps) {
  const { fields, fsaTracts, cluAssignments } = useFarm();
  const field = fields.find(f => f.id === fieldId);

  const [features, setFeatures] = useState<DisplayFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const center: [number, number] = useMemo(() => {
    if (field?.lat == null || field.lng == null) return [38.47, -93.54];
    return [field.lat, field.lng];
  }, [field?.lat, field?.lng]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeatures() {
      setLoading(true);
      const fieldAssignments = cluAssignments.filter(a => a.fieldId === fieldId && !a.deletedAt);

      if (fieldAssignments.length > 0) {
        const tractKeys = [...new Set(fieldAssignments.map(a => a.tractKey))];
        const assignmentByKey = new Map<string, FieldCluAssignment>();
        for (const assignment of fieldAssignments) {
          assignmentByKey.set(`${assignment.tractKey}:${assignment.cluNumber}`, assignment);
        }

        const collections = await loadKeyedCollections(tractKeys, fsaTracts);
        if (cancelled) return;

        const assignedFeatures = collections.flatMap(({ tractKey, collection }) =>
          collection.features
            .filter(feature => assignmentByKey.has(`${tractKey}:${feature.properties.cluNumber}`))
            .map(feature => {
              const assignment = assignmentByKey.get(`${tractKey}:${feature.properties.cluNumber}`);
              return {
                ...feature,
                tractKey,
                landUse: assignment?.landUse ?? 'cropland',
                isAssigned: true,
              };
            }),
        );

        setFeatures(assignedFeatures);
        setLoading(false);
        return;
      }

      const keys = parseTractKeys(field?.fsaFarmNumber, field?.fsaTractNumber);
      if (keys.length === 0) {
        setFeatures([]);
        setLoading(false);
        return;
      }

      const legacyClus = new Set(field?.cluNumbers?.filter(Boolean) ?? []);
      const collections = await loadKeyedCollections(keys, fsaTracts);
      if (cancelled) return;

      const fallbackFeatures = collections.flatMap(({ tractKey, collection }) =>
        collection.features
          .filter(feature => legacyClus.size === 0 || legacyClus.has(feature.properties.cluNumber))
          .map(feature => ({
            ...feature,
            tractKey,
            landUse: legacyClus.size > 0 ? 'cropland' as CluLandUse : null,
            isAssigned: false,
          })),
      );

      setFeatures(fallbackFeatures);
      setLoading(false);
    }

    loadFeatures().catch((err) => {
      console.error('[FieldBoundaryMap] Load error:', err);
      if (!cancelled) {
        setFeatures([]);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [fieldId, field?.fsaFarmNumber, field?.fsaTractNumber, field?.cluNumbers, cluAssignments, fsaTracts]);

  if (field?.lat == null || field.lng == null) return null;

  return (
    <div className="h-48 w-full rounded-lg overflow-hidden border border-border bg-muted relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted">
          <span className="text-sm font-bold text-muted-foreground animate-pulse">Loading map...</span>
        </div>
      )}
      <MapContainer
        center={center}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <MapResizeHandler />
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" />
        <TractPolygons features={features} field={field} />
        {features.length === 0 && boundaryRings(field).length === 0 && <Marker position={center} />}
      </MapContainer>

      {features.length === 0 && !loading && (
        <div className="absolute bottom-2 left-2 z-10 bg-background/80 backdrop-blur px-2 py-1 rounded text-[11px] font-medium text-muted-foreground">
          No boundary data
        </div>
      )}
    </div>
  );
}
