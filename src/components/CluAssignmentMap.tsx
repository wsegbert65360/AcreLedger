import { useEffect, useMemo, useRef } from 'react';

import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { toast } from 'sonner';

import '@/lib/leafletSetup';

import type { CluLandUse, FsaTractImport, FieldCluAssignment } from '@/types/fsaTract';
import type { TractFeature } from '@/lib/tractLookup';
import { getLatLngsFromGeometry, hasValidGeometry, getCentroid } from '@/lib/geoHelpers';

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
  selectedCropland: { color: '#4ade80', fillColor: '#22c55e', weight: 3, opacity: 0.95, fillOpacity: 0.26 },
  selectedNonCropland: { color: '#c084fc', fillColor: '#a855f7', weight: 3, opacity: 0.95, fillOpacity: 0.32 },
  assignedCropland: { color: '#60a5fa', fillColor: '#3b82f6', weight: 2.5, opacity: 0.9, fillOpacity: 0.18 },
  assignedNonCropland: { color: '#c084fc', fillColor: '#9333ea', weight: 2.5, opacity: 0.9, fillOpacity: 0.24 },
  unassigned: { color: '#dc2626', fillColor: '#ef4444', weight: 4, opacity: 1, fillOpacity: 0.38, dashArray: '9 5' },
  unassignedHalo: { color: '#ffffff', weight: 8, opacity: 0.95, fillOpacity: 0 },
};

const HIT_TARGET_STYLE: L.PathOptions = {
  color: '#ffffff',
  fillColor: '#ffffff',
  weight: 28,
  opacity: 0.001,
  fillOpacity: 0.001,
  lineCap: 'round',
  lineJoin: 'round',
};

interface CluAssignmentMapProps {
  tracts: FsaTractImport[];
  assignments: FieldCluAssignment[];
  selectedFieldId: string | null;
  showUnassignedOnly?: boolean;
  focusCluKey?: string | null;
  onToggleClu: (tractKey: string, cluNumber: string, acres: number) => void;
}

interface CluStatus {
  fieldId: string | null;
  landUse: CluLandUse;
}

export default function CluAssignmentMap({
  tracts,
  assignments,
  selectedFieldId,
  showUnassignedOnly = false,
  focusCluKey = null,
  onToggleClu,
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
      if (a.deletedAt) continue;
      const key = `${a.tractKey}:${a.cluNumber}`;
      map.set(key, { fieldId: a.fieldId, landUse: a.landUse });
    }
    return map;
  }, [assignments]);

  const visibleFeatures = useMemo(
    () => showUnassignedOnly
      ? allFeatures.filter(feature => !assignmentMap.has(`${feature.tractKey}:${feature.properties.cluNumber}`))
      : allFeatures,
    [allFeatures, assignmentMap, showUnassignedOnly],
  );

  const center = useMemo<[number, number]>(() => {
    return getCentroid(allFeatures);
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
      tapTolerance={24}
    >
      <MapResizeHandler />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" />
      <CluPolygons
        features={visibleFeatures}
        assignmentMap={assignmentMap}
        selectedFieldId={selectedFieldId}
        focusCluKey={focusCluKey}
        onToggleClu={onToggleClu}
      />
    </MapContainer>
  );
}

function CluPolygons({
  features,
  assignmentMap,
  selectedFieldId,
  focusCluKey,
  onToggleClu,
}: {
  features: (TractFeature & { tractKey: string })[];
  assignmentMap: Map<string, CluStatus>;
  selectedFieldId: string | null;
  focusCluKey: string | null;
  onToggleClu: (tractKey: string, cluNumber: string, acres: number) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const initialized = useRef(false);
  const onToggleCluRef = useRef(onToggleClu);

  useEffect(() => {
    onToggleCluRef.current = onToggleClu;
  }, [onToggleClu]);

  useEffect(() => {
    if (groupRef.current) {
      map.removeLayer(groupRef.current);
      groupRef.current = null;
    }

    if (features.length === 0) return;

    const group = L.featureGroup();
    let polyCount = 0;
    let focusBounds: L.LatLngBounds | null = null;

    for (const feat of features) {
      if (!feat.properties.cluNumber) continue;

      if (!hasValidGeometry(feat.geometry)) continue;

      const key = `${feat.tractKey}:${feat.properties.cluNumber}`;
      const status = assignmentMap.get(key);
      const isUnassigned = !status;
      const isSelected = selectedFieldId && status?.fieldId === selectedFieldId;

      const style = isSelected
        ? status?.landUse === 'non_cropland' ? COLORS.selectedNonCropland : COLORS.selectedCropland
        : status
          ? status.landUse === 'non_cropland' ? COLORS.assignedNonCropland : COLORS.assignedCropland
          : COLORS.unassigned;
      const latlngs = getLatLngsFromGeometry(feat.geometry);
      if (isUnassigned) {
        L.polygon(latlngs, {
          ...COLORS.unassignedHalo,
          interactive: false,
          lineJoin: 'round',
        }).addTo(group);
      }
      const poly = L.polygon(latlngs, style);
      poly.addTo(group);
      polyCount++;

      if (key === focusCluKey) {
        focusBounds = poly.getBounds();
        L.polygon(latlngs, {
          color: '#ffffff',
          weight: 12,
          opacity: 0.98,
          fillOpacity: 0,
          interactive: false,
          lineJoin: 'round',
        }).addTo(group);
        L.polygon(latlngs, {
          color: '#facc15',
          weight: 6,
          opacity: 1,
          fillOpacity: 0,
          interactive: false,
          dashArray: '2 8',
          lineJoin: 'round',
        }).addTo(group);
      }

      if (feat.properties.cluNumber) {
        const landUseLabel = status?.landUse === 'non_cropland' ? 'Non-cropland' : 'Cropland';
        poly.bindTooltip(status ? `${feat.properties.cluNumber} · ${landUseLabel}` : `UNASSIGNED ${feat.properties.cluNumber}`, {
          permanent: true,
          direction: 'center',
          className: isUnassigned ? 'tract-clu-tooltip tract-clu-tooltip-unassigned' : 'tract-clu-tooltip',
        });
      }

      const handleCluSelect = () => {
        if (!selectedFieldId) {
          toast('Select a field first');
          return;
        }
        onToggleCluRef.current(feat.tractKey, feat.properties.cluNumber, feat.properties.acres);
      };

      poly.on('click', handleCluSelect);
      L.polygon(latlngs, {
        ...HIT_TARGET_STYLE,
        bubblingMouseEvents: false,
      }).on('click', handleCluSelect).addTo(group);
    }

    group.addTo(map);

    if (!initialized.current && polyCount > 0) {
      map.fitBounds(focusBounds ?? group.getBounds(), { padding: [12, 12], maxZoom: 17 });
      initialized.current = true;
    } else if (focusBounds) {
      map.fitBounds(focusBounds, { padding: [28, 28], maxZoom: 18 });
    }

    groupRef.current = group;

    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
  }, [features, assignmentMap, selectedFieldId, focusCluKey, map]);

  return null;
}
