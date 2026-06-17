import { useEffect, useMemo, useRef } from 'react';

import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { toast } from 'sonner';

import '@/lib/leafletSetup';

import type { CluLandUse, FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import type { TractFeature } from '@/lib/tractLookup';

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

const COLORS = {
  selectedCropland: { color: '#4ade80', fillColor: '#22c55e', weight: 3, opacity: 0.95, fillOpacity: 0.28 },
  selectedNonCropland: { color: '#f59e0b', fillColor: '#f97316', weight: 3, opacity: 0.95, fillOpacity: 0.3 },
  otherCropland: { color: '#60a5fa', fillColor: '#3b82f6', weight: 2, opacity: 0.7, fillOpacity: 0.15 },
  otherNonCropland: { color: '#fb923c', fillColor: '#f97316', weight: 2, opacity: 0.75, fillOpacity: 0.16 },
  unassigned: { color: '#94a3b8', fillColor: '#64748b', weight: 2, opacity: 0.5, fillOpacity: 0.08 },
};

interface CluAssignmentMapProps {
  tracts: FsaTractImport[];
  assignments: FieldCluAssignment[];
  selectedFieldId: string | null;
  selectedLandUse: CluLandUse;
  onToggleClu: (tractKey: string, cluNumber: string, acres: number) => void;
}

interface CluStatus {
  fieldId: string | null;
  landUse: CluLandUse;
}

export default function CluAssignmentMap({
  tracts, assignments, selectedFieldId, selectedLandUse, onToggleClu,
}: CluAssignmentMapProps) {
  const allFeatures = useMemo(() => {
    const feats: (TractFeature & { tractKey: string })[] = [];
    for (const tract of tracts) {
      for (const f of tract.geojson.features) {
        feats.push({ ...f, tractKey: tract.tractKey });
      }
    }
    return feats;
  }, [tracts]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, CluStatus>();
    for (const a of assignments) {
      const key = `${a.tractKey}:${a.cluNumber}`;
      map.set(key, { fieldId: a.fieldId, landUse: a.landUse });
    }
    return map;
  }, [assignments]);

  const center = useMemo<[number, number]>(() => {
    if (allFeatures.length === 0) return [38.47, -93.54];
    let lat = 0, lng = 0, n = 0;
    for (const f of allFeatures) {
      const ring = f.geometry.coordinates[0];
      if (!ring) continue;
      for (const c of ring) { lng += c[0]; lat += c[1]; n++; }
    }
    return n > 0 ? [lat / n, lng / n] : [38.47, -93.54];
  }, [allFeatures]);

  if (allFeatures.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-muted text-muted-foreground text-sm">
        Import tract files to see CLU boundaries here.
      </div>
    );
  }

  return (
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
      <CluPolygons
        features={allFeatures}
        assignmentMap={assignmentMap}
        selectedFieldId={selectedFieldId}
        selectedLandUse={selectedLandUse}
        onToggleClu={onToggleClu}
      />
    </MapContainer>
  );
}

function CluPolygons({
  features,
  assignmentMap,
  selectedFieldId,
  selectedLandUse,
  onToggleClu,
}: {
  features: (TractFeature & { tractKey: string })[];
  assignmentMap: Map<string, CluStatus>;
  selectedFieldId: string | null;
  selectedLandUse: CluLandUse;
  onToggleClu: (tractKey: string, cluNumber: string, acres: number) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (groupRef.current) {
      map.removeLayer(groupRef.current);
      groupRef.current = null;
    }

    if (features.length === 0) return;

    const group = L.featureGroup();
    let polyCount = 0;

    for (const feat of features) {
      if (!feat.properties.cluNumber) continue;

      const ring = feat.geometry.coordinates[0];
      if (!ring || ring.length < 3) continue;

      const key = `${feat.tractKey}:${feat.properties.cluNumber}`;
      const status = assignmentMap.get(key);
      const isSelected = selectedFieldId && status?.fieldId === selectedFieldId;
      const isOther = status && status.fieldId && status.fieldId !== selectedFieldId;

      const style = isSelected
        ? status?.landUse === 'non_cropland' ? COLORS.selectedNonCropland : COLORS.selectedCropland
        : isOther
          ? status?.landUse === 'non_cropland' ? COLORS.otherNonCropland : COLORS.otherCropland
          : COLORS.unassigned;
      const latlngs: L.LatLngExpression[] = ring.map(c => [c[1], c[0]]);
      const poly = L.polygon(latlngs, style);
      poly.addTo(group);
      polyCount++;

      if (feat.properties.cluNumber) {
        const landUseLabel = status?.landUse === 'non_cropland' ? 'Non-cropland' : 'Cropland';
        poly.bindTooltip(status ? `${feat.properties.cluNumber} · ${landUseLabel}` : feat.properties.cluNumber, {
          permanent: true,
          direction: 'center',
          className: 'tract-clu-tooltip',
        });
      }

      poly.on('click', () => {
        if (!selectedFieldId) {
          toast('Select a field first');
          return;
        }
        onToggleClu(feat.tractKey, feat.properties.cluNumber, feat.properties.acres);
      });
    }

    group.addTo(map);

    if (!initialized.current && polyCount > 0) {
      map.fitBounds(group.getBounds(), { padding: [10, 10], maxZoom: 16 });
      initialized.current = true;
    }

    groupRef.current = group;

    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
  }, [features, assignmentMap, selectedFieldId, selectedLandUse, map, onToggleClu]);

  return null;
}
