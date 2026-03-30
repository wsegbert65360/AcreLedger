import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { MapPin, Plus, Pencil, Map as MapIcon, RotateCcw } from 'lucide-react';

// Leaflet & GIS
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { calculateAcreage } from '@/lib/gisService';

// Fix for default marker icon in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapInteraction({ onPointAdd, isCapturing }: { onPointAdd: (latlng: [number, number]) => void; isCapturing: boolean }) {
  useMapEvents({
    click(e) {
      if (isCapturing) {
        onPointAdd([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

// Helper to update map view when geolocation is found
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

interface FieldManageModalProps {
  open: boolean;
  onClose: () => void;
  editField?: Field | null;
}

export default function FieldManageModal({ open, onClose, editField }: FieldManageModalProps) {
  const { addField, updateField } = useFarm();
  const [name, setName] = useState(editField?.name || '');
  const [acreage, setAcreage] = useState(editField?.acreage?.toString() || '');
  const [lat, setLat] = useState(editField?.lat?.toString() || '');
  const [lng, setLng] = useState(editField?.lng?.toString() || '');
  const [fsaFarm, setFsaFarm] = useState(editField?.fsaFarmNumber || '');
  const [fsaTract, setFsaTract] = useState(editField?.fsaTractNumber || '');
  const [fsaField, setFsaField] = useState(editField?.fsaFieldNumber || '');
  const [producerShare, setProducerShare] = useState(editField?.producerShare?.toString() || '100');
  const [irrigation, _setIrrigation] = useState<Field['irrigationPractice']>(editField?.irrigationPractice || 'Non-Irrigated');
  const [intendedUse, setIntendedUse] = useState(editField?.intendedUse || 'Grain');
  const [isSaving, setIsSaving] = useState(false);

  // GIS State
  const [points, setPoints] = useState<[number, number][]>(editField?.boundary?.coordinates?.[0]?.slice(0, -1).map((c: any) => [c[1], c[0]]) || []);
  const [isCapturing, setIsCapturing] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(points.length > 0 ? points[0] : [38.5, -92.5]);
  const [mapZoom, setMapZoom] = useState(points.length > 0 ? 15 : 4);

  // Attempt Geolocation on Mount if no field is being edited
  useEffect(() => {
    if (!editField && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newCenter: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setMapCenter(newCenter);
          setMapZoom(15);
        },
        (err) => console.warn('Geolocation error:', err),
        { enableHighAccuracy: true }
      );
    }
  }, [editField]);

  const isEdit = !!editField;

  const handlePointAdd = useCallback(async (latlng: [number, number]) => {
    const newPoints = [...points, latlng];
    setPoints(newPoints);

    if (newPoints.length === 1) {
      setLat(latlng[0].toFixed(6));
      setLng(latlng[1].toFixed(6));
    }

    if (newPoints.length >= 3) {
      const geojson: { type: 'Polygon'; coordinates: number[][][] } = {
        type: 'Polygon',
        coordinates: [[...newPoints, newPoints[0]].map(p => [p[1], p[0]])]
      };
      const area = calculateAcreage(geojson);
      setAcreage(area.toString());
    }
  }, [points]);

  const clearPoints = () => {
    setPoints([]);
    setAcreage('');
    setIsCapturing(true);
  };

  const handleSubmit = async () => {
    const ac = parseFloat(acreage);
    if (!name.trim() || isNaN(ac) || ac <= 0) return;
    // lat/lng may be null if geocoding skipped (BLUEPRINT)
    const la = lat.trim() === '' ? null : parseFloat(lat);
    const ln = lng.trim() === '' ? null : parseFloat(lng);
    if (la !== null && (isNaN(la) || la < -90 || la > 90)) return;
    if (ln !== null && (isNaN(ln) || ln < -180 || ln > 180)) return;

    let boundary: { type: 'Polygon'; coordinates: number[][][] } | null = null;
    if (points.length >= 3) {
      boundary = {
        type: 'Polygon',
        coordinates: [[...points, points[0]].map(p => [p[1], p[0]])]
      };
    }

    const fieldData = {
      name: name.trim(),
      acreage: ac,
      lat: la,
      lng: ln,
      boundary,
      fsaFarmNumber: fsaFarm.trim() || undefined,
      fsaTractNumber: fsaTract.trim() || undefined,
      fsaFieldNumber: fsaField.trim() || undefined,
      producerShare: parseFloat(producerShare) || undefined,
      irrigationPractice: irrigation,
      intendedUse: intendedUse.trim() || undefined,
      deleted_at: null as string | null
    };

    setIsSaving(true);
    try {
      let success = false;
      if (isEdit) {
        success = await updateField({ id: editField.id, ...fieldData, deleted_at: editField.deleted_at ?? null } as Field);
      } else {
        success = await addField(fieldData as Omit<Field, 'id'>);
      }
      if (success) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const valid = !!name.trim() && !!acreage && !isNaN(parseFloat(acreage)) && parseFloat(acreage) > 0;

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-primary/30 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            {isEdit ? <Pencil size={20} /> : <Plus size={20} />}
            {isEdit ? 'Edit Field' : 'Add Field'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Map Preview / Drawing Area */}
          <div className="relative group">
            <div className="h-48 w-full rounded-lg overflow-hidden border border-border bg-muted mb-2 z-0">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                />
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                />
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                />
                <ChangeView center={mapCenter} zoom={mapZoom} />
                <MapInteraction onPointAdd={handlePointAdd} isCapturing={isCapturing} />
                {points.map((p, i) => (
                  <Marker key={i} position={p} />
                ))}
                {points.length >= 2 && (
                  <Polygon positions={points.length >= 3 ? [...points, points[0]] : points} pathOptions={{ color: 'var(--primary)' }} />
                )}
              </MapContainer>
            </div>

            <div className="flex gap-2">
              <Button
                variant={isCapturing ? "secondary" : "outline"}
                size="sm"
                onClick={() => setIsCapturing(!isCapturing)}
                className="flex-1 font-mono text-[10px]"
              >
                <MapIcon size={14} className="mr-2" />
                {isCapturing ? 'TAP MAP TO DRAW' : 'ENABLE MAP DRAWING'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPoints}
                className="px-3"
                aria-label="Reset map drawing"
              >
                <RotateCcw size={14} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="fieldName" className="text-muted-foreground font-mono text-xs">FIELD NAME</Label>
              <Input
                id="fieldName"
                name="fieldName"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. North 80"
                className="mt-1 bg-muted border-border text-foreground"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="acreage" className="text-muted-foreground font-mono text-xs flex items-center gap-1">
                ACREAGE {points.length >= 3 && <span className="text-[10px] text-primary">(AUTO)</span>}
              </Label>
              <Input
                id="acreage"
                name="acreage"
                type="number"
                value={acreage}
                onChange={e => setAcreage(e.target.value)}
                placeholder="0"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="fsaField" className="text-muted-foreground font-mono text-xs">FSA FIELD #</Label>
              <Input
                id="fsaField"
                name="fsaField"
                value={fsaField}
                onChange={e => setFsaField(e.target.value)}
                placeholder="1"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="latitude" className="text-muted-foreground font-mono text-xs flex items-center gap-1">
                <MapPin size={10} /> LATITUDE
              </Label>
              <Input
                id="latitude"
                name="latitude"
                type="number"
                step="0.000001"
                value={lat}
                onChange={e => setLat(e.target.value)}
                className="mt-1 bg-muted border-border text-foreground font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="longitude" className="text-muted-foreground font-mono text-xs flex items-center gap-1">
                <MapPin size={10} /> LONGITUDE
              </Label>
              <Input
                id="longitude"
                name="longitude"
                type="number"
                step="0.000001"
                value={lng}
                onChange={e => setLng(e.target.value)}
                className="mt-1 bg-muted border-border text-foreground font-mono text-xs"
              />
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-primary font-mono text-[10px] font-bold">FSA COMPLIANCE DATA</Label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fsaFarm" className="text-muted-foreground font-mono text-xs uppercase">FSA Farm #</Label>
                <Input
                  id="fsaFarm"
                  name="fsaFarm"
                  value={fsaFarm}
                  onChange={e => setFsaFarm(e.target.value)}
                  placeholder="Enter Farm #"
                  className="mt-1 bg-background border-border text-foreground h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="fsaTract" className="text-muted-foreground font-mono text-xs uppercase">Tract #</Label>
                <Input
                  id="fsaTract"
                  name="fsaTract"
                  value={fsaTract}
                  onChange={e => setFsaTract(e.target.value)}
                  placeholder="Enter Tract #"
                  className="mt-1 bg-background border-border text-foreground h-8 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20">
            <div>
              <Label htmlFor="fieldProducerShare" className="text-muted-foreground font-mono text-xs uppercase">Producer Share %</Label>
              <Input
                id="fieldProducerShare"
                name="fieldProducerShare"
                type="number"
                value={producerShare}
                onChange={e => setProducerShare(e.target.value)}
                className="mt-1 bg-muted border-border text-foreground font-mono"
              />
            </div>
            <div>
              <Label htmlFor="fieldIntendedUse" className="text-muted-foreground font-mono text-xs uppercase">Intended Use</Label>
              <Input
                id="fieldIntendedUse"
                name="fieldIntendedUse"
                value={intendedUse}
                onChange={e => setIntendedUse(e.target.value)}
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !valid}
            className="touch-target w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-plant font-bold"
          >
            {isSaving ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save Changes' : 'Add Field')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
