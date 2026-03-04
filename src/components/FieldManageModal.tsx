import { useState, useCallback, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { MapPin, Plus, Pencil, Trash2, Map as MapIcon, RotateCcw, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Leaflet & GIS
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet';
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
  const map = useMapEvents({});
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
  const [irrigation, setIrrigation] = useState<Field['irrigationPractice']>(editField?.irrigationPractice || 'Non-Irrigated');
  const [intendedUse, setIntendedUse] = useState(editField?.intendedUse || 'Grain');

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
          setMapZoom(15); // Zoomed in for ~300 acres
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
      const geojson = {
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

  const handleSubmit = () => {
    const ac = parseFloat(acreage);
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (!name.trim() || isNaN(ac) || isNaN(la) || isNaN(ln)) return;

    let boundary = null;
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
      intendedUse: intendedUse.trim() || undefined
    };

    if (isEdit) {
      updateField({ id: editField.id, ...fieldData });
    } else {
      addField(fieldData);
    }
    onClose();
  };

  const valid = name.trim() && acreage && lat && lng;

  return (
    <Dialog open={open} onOpenChange={onClose}>
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
            disabled={!valid}
            className="touch-target w-full bg-primary text-primary-foreground hover:bg-primary/90 glow-plant font-bold"
          >
            {isEdit ? 'Save Changes' : 'Add Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FieldManager() {
  const { fields: allFields, deleteField } = useFarm();
  const { rowCrops, pastureHay } = useMemo(() => {
    const activeFields = allFields.filter(f => !f.deleted_at);
    const sorted = [...activeFields].sort((a, b) => a.name.localeCompare(b.name));

    return {
      rowCrops: sorted.filter(f => {
        const use = (f.intendedUse || '').toLowerCase();
        return !use.includes('pasture') && !use.includes('hay');
      }),
      pastureHay: sorted.filter(f => {
        const use = (f.intendedUse || '').toLowerCase();
        return use.includes('pasture') || use.includes('hay');
      })
    };
  }, [allFields]);

  const [editField, setEditField] = useState<Field | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  return (
    <>
      <div className="space-y-2">
        <button
          onClick={() => setAddOpen(true)}
          className="touch-target w-full flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-lg py-3 font-mono text-sm font-bold active:scale-95 transition-transform"
        >
          <Plus size={18} />
          Add New Field
        </button>

        {[...rowCrops, ...pastureHay].length > 0 && (
          <div className="space-y-4">
            {rowCrops.length > 0 && (
              <div className="space-y-2">
                {pastureHay.length > 0 && (
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Row Crops</h3>
                )}
                {rowCrops.map((field: Field) => (
                  <div key={field.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-foreground text-sm">{field.name}</span>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">
                        {field.acreage} ac · {field.lat.toFixed(3)}, {field.lng.toFixed(3)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditField(field)}
                        className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(field.id)}
                        className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pastureHay.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Pasture & Hay</h3>
                {pastureHay.map((field: Field) => (
                  <div key={field.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-foreground text-sm">{field.name}</span>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">
                        {field.acreage} ac · {field.lat.toFixed(3)}, {field.lng.toFixed(3)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditField(field)}
                        className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(field.id)}
                        className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {addOpen && (
        <FieldManageModal open onClose={() => setAddOpen(false)} />
      )}
      {editField && (
        <FieldManageModal open editField={editField} onClose={() => setEditField(null)} />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Field</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently remove this field. Existing records will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteConfirm) deleteField(deleteConfirm); setDeleteConfirm(null); }}
              className="touch-target bg-destructive text-destructive-foreground glow-destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
