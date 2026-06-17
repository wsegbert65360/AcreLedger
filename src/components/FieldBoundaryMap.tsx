import { useEffect, useMemo, useRef, useState } from 'react';

import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import '@/lib/leafletSetup';

import { useFarm } from '@/store/farmStore';
import { loadTractData, loadTractDataFromStore, parseTractKeys, type TractFeature } from '@/lib/tractLookup';

interface FieldBoundaryMapProps {
  fieldId: string;
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

function TractPolygons({ features }: { features: TractFeature[] }) {
  const map = useMap();
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const initialized = useRef(false);

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
      const ring = feat.geometry.coordinates[0];
      if (!ring || ring.length < 3) continue;

      const latlngs: L.LatLngExpression[] = ring.map(c => [c[1], c[0]]);
      const poly = L.polygon(latlngs, {
        color: '#4ade80',
        fillColor: '#22c55e',
        weight: 3,
        opacity: 0.95,
        fillOpacity: 0.18,
      });

      poly.addTo(group);
      polyCount++;

      if (feat.properties.cluNumber) {
        poly.bindTooltip(feat.properties.cluNumber, {
          permanent: true,
          direction: 'center',
          className: 'tract-clu-tooltip',
        });
      }
    }

    group.addTo(map);

    if (!initialized.current && polyCount > 0) {
      const bounds = group.getBounds();
      map.fitBounds(bounds, { padding: [10, 10], maxZoom: 16 });
      initialized.current = true;
    }

    groupRef.current = group;

    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
  }, [features, map]);

  return null;
}

export default function FieldBoundaryMap({ fieldId }: FieldBoundaryMapProps) {
  const { fields, fsaTracts, cluAssignments } = useFarm();
  const field = fields.find(f => f.id === fieldId);

  const [features, setFeatures] = useState<TractFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const center: [number, number] = useMemo(() => {
    if (field?.lat == null || field.lng == null) return [38.47, -93.54];
    return [field.lat, field.lng];
  }, [field?.lat, field?.lng]);

  useEffect(() => {
    // If field has CLU assignments from imported tracts, use those
    const fieldAssignments = cluAssignments.filter(a => a.fieldId === fieldId);
    if (fieldAssignments.length > 0 && fsaTracts.length > 0) {
      const tractKeys = [...new Set(fieldAssignments.map(a => a.tractKey))];
      const collections = loadTractDataFromStore(tractKeys, fsaTracts);
      const cluNums = new Set(fieldAssignments.map(a => a.cluNumber));
      const feats = collections.flatMap(c => c.features.filter(f => cluNums.has(f.properties.cluNumber)));
      setFeatures(feats);
      setLoading(false);
      return;
    }

    // Fallback: load from bundled JSON files
    if (!field?.fsaFarmNumber) { setLoading(false); return; }
    const keys = parseTractKeys(field.fsaFarmNumber, field.fsaTractNumber);
    if (keys.length === 0) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    loadTractData(keys).then(collections => {
      if (cancelled) return;
      const feats = collections.flatMap(c => c.features);
      setFeatures(feats);
      setLoading(false);
    }).catch((err) => { console.error('[FieldBoundaryMap] Load error:', err); setLoading(false); });
    return () => { cancelled = true; };
  }, [fieldId, field?.fsaFarmNumber, field?.fsaTractNumber, cluAssignments, fsaTracts]);

  if (field?.lat == null || field.lng == null) return null;

  return (
    <div className="h-48 w-full rounded-lg overflow-hidden border border-border bg-muted relative">
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-muted">
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
        <TractPolygons features={features} />
        <Marker position={center} />
      </MapContainer>

      {features.length === 0 && !loading && (
        <div className="absolute bottom-2 left-2 z-[1000] bg-background/80 backdrop-blur px-2 py-1 rounded text-[11px] font-medium text-muted-foreground">
          No boundary data
        </div>
      )}
    </div>
  );
}
