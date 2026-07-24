import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';

import '@/lib/leafletSetup';

import type { GeoJSONGeometry } from '@/lib/geoHelpers';
import {
  ESRI_STREET_MAP_ATTRIBUTION,
  getFieldMapBounds,
  type GpsPoint,
} from '@/lib/workRequests/fieldMapImage';

interface WorkRequestFieldMapProps {
  geometry: GeoJSONGeometry | null;
  navPoint: GpsPoint | null;
  fallbackPoint: GpsPoint | null;
}

function CropGeometryLayer({ geometry }: { geometry: GeoJSONGeometry | null }) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!geometry) return;

    const layer = L.geoJSON(
      { type: 'Feature', properties: {}, geometry } as GeoJSON.Feature,
      {
        style: {
          color: '#14532d',
          weight: 4,
          opacity: 1,
          fillColor: '#22c55e',
          fillOpacity: 0.32,
        },
      },
    ).addTo(map);
    layerRef.current = layer;
    map.fitBounds(layer.getBounds(), { padding: [34, 34], maxZoom: 16 });

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [geometry, map]);

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(container);
    map.invalidateSize({ pan: false });
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export default function WorkRequestFieldMap({
  geometry,
  navPoint,
  fallbackPoint,
}: WorkRequestFieldMapProps) {
  const bounds = useMemo(() => getFieldMapBounds(geometry), [geometry]);
  const center = useMemo<[number, number]>(() => {
    if (bounds) return [(bounds.south + bounds.north) / 2, (bounds.west + bounds.east) / 2];
    const point = fallbackPoint ?? navPoint;
    return point ? [point.lat, point.lng] : [38.47, -93.54];
  }, [bounds, fallbackPoint, navPoint]);

  return (
    <div className="relative aspect-square max-h-[28rem] min-h-64 w-full overflow-hidden rounded-xl border border-border bg-muted">
      <MapContainer
        center={center}
        zoom={bounds ? 15 : 14}
        style={{ height: '100%', width: '100%' }}
        zoomControl
        attributionControl={false}
      >
        <MapResizeHandler />
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
        <CropGeometryLayer geometry={geometry} />
        {navPoint && (
          <CircleMarker
            center={[navPoint.lat, navPoint.lng]}
            radius={7}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }}
          />
        )}
      </MapContainer>

      {!geometry && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background/90 px-3 py-2 text-center text-xs font-semibold text-muted-foreground shadow">
          No crop-acre boundary available
        </div>
      )}
      <div className="pointer-events-none absolute bottom-1 right-1 z-[500] max-w-[85%] rounded bg-white/85 px-1.5 py-0.5 text-right text-[8px] leading-tight text-slate-600">
        {ESRI_STREET_MAP_ATTRIBUTION}
      </div>
    </div>
  );
}
