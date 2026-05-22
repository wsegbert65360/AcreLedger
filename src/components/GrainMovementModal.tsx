import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { GrainMovement } from '@/types/farm';
import { native } from '@/lib/native';
import { Warehouse, ArrowUpRight, ArrowDownLeft, Calendar, AlertTriangle } from 'lucide-react';

interface GrainMovementModalProps {
  open: boolean;
  onClose: () => void;
  /** Must be a fully-formed GrainMovement — this modal is edit-only. */
  initialData: GrainMovement;
}

export default function GrainMovementModal({ open, onClose, initialData }: GrainMovementModalProps) {
  const { updateGrainMovement, bins, fields, viewingSeason } = useFarm();
  const [binId, setBinId] = useState(initialData.binId);
  const [bushels, setBushels] = useState(initialData.bushels.toString());
  const [moisture, setMoisture] = useState(initialData.moisturePercent.toString());
  const [price, setPrice] = useState(initialData.price?.toString() || '');
  const [destination, setDestination] = useState(initialData.destination || '');
  const [sourceField, setSourceField] = useState(initialData.sourceFieldName || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setBinId(initialData.binId);
      setBushels(initialData.bushels.toString());
      setMoisture(initialData.moisturePercent.toString());
      setPrice(initialData.price?.toString() || '');
      setDestination(initialData.destination || '');
      setSourceField(initialData.sourceFieldName || '');
      setErrors({});
    }
  }, [open, initialData]);

  const bu = parseFloat(bushels);
  const m = parseFloat(moisture);
  const isNegativeBushels = !isNaN(bu) && bu < 0;

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!binId) next.binId = 'Select a storage bin.';
    if (isNaN(bu)) next.bushels = 'Enter a valid number.';
    if (isNaN(m) || m < 0 || m > 100) next.moisture = 'Enter a value between 0 and 100.';
    if (price && isNaN(parseFloat(price))) next.price = 'Enter a valid price.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      native.haptic.error();
      return;
    }

    const bin = bins.find(b => b.id === binId);
    if (!bin) {
      setErrors({ binId: 'Selected bin no longer exists. Please choose another.' });
      native.haptic.error();
      return;
    }

    setIsSaving(true);
    try {
      const success = await updateGrainMovement({
        ...initialData,
        binId,
        binName: bin.name,
        bushels: bu,
        moisturePercent: m,
        price: price ? parseFloat(price) : undefined,
        destination: destination || undefined,
        sourceFieldName: sourceField || undefined,
      });

      if (success) {
        native.haptic.success();
        onClose();
      } else {
        native.haptic.error();
      }
    } catch (err) {
      console.error('Update error:', err);
      native.haptic.error();
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass = (key: string) =>
    `mt-1 bg-muted border-border font-mono text-sm ${errors[key] ? 'border-destructive focus-visible:ring-destructive' : ''}`;

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-harvest/30 max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center flex-wrap gap-2 text-harvest font-bold">
            <div className="flex items-center gap-2">
              <Warehouse size={20} />
              <span>Edit Grain Movement</span>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-harvest/10 text-harvest border border-harvest/20">
              {initialData ? initialData.seasonYear : viewingSeason} Season
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit grain movement record details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type Indicator */}
          <div className={`p-3 rounded-lg border flex items-center justify-between ${
            initialData.type === 'in'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400'
          }`}>
            <div className="flex items-center gap-2">
              {initialData.type === 'in' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              <span className="font-mono text-sm font-bold uppercase">
                {initialData.type === 'in' ? 'Inventory In' : 'Sale / Out'}
              </span>
            </div>
            <span className="text-[11px] font-mono opacity-70 italic">
              ID: {initialData.id?.slice(0, 8) ?? '—'}
            </span>
          </div>

          {/* Storage Bin */}
          <div>
            <Label className="text-muted-foreground font-mono text-xs font-bold">STORAGE BIN *</Label>
            <Select value={binId} onValueChange={(val) => { setBinId(val); setErrors(e => ({ ...e, binId: '' })); }}>
              <SelectTrigger className={`mt-1 bg-muted border-border font-mono text-xs ${errors.binId ? 'border-destructive' : ''}`}>
                <SelectValue placeholder="Choose bin..." />
              </SelectTrigger>
              <SelectContent>
                {bins.length === 0
                  ? <SelectItem value="__none__" disabled>No bins configured</SelectItem>
                  : bins.map(b => (
                    <SelectItem key={b.id} value={b.id} className="font-mono text-xs">{b.name}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            {errors.binId && <p className="text-xs text-destructive font-mono mt-1">{errors.binId}</p>}
          </div>

          {/* Bushels + Moisture */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bushels" className="text-muted-foreground font-mono text-xs font-bold">BUSHELS *</Label>
              <Input
                id="bushels"
                type="number"
                step="0.1"
                value={bushels}
                onChange={e => { setBushels(e.target.value); setErrors(ex => ({ ...ex, bushels: '' })); }}
                className={fieldClass('bushels')}
              />
              {errors.bushels && <p className="text-xs text-destructive font-mono mt-1">{errors.bushels}</p>}
              {/* Negative bushel warning — allowed but flag it clearly */}
              {isNegativeBushels && !errors.bushels && (
                <div className="flex items-center gap-1 mt-1 text-amber-500 dark:text-amber-400">
                  <AlertTriangle size={12} />
                  <p className="text-[11px] font-mono">Negative — adjustment recorded</p>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="moisture" className="text-muted-foreground font-mono text-xs font-bold">MOISTURE % *</Label>
              <Input
                id="moisture"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={moisture}
                onChange={e => { setMoisture(e.target.value); setErrors(ex => ({ ...ex, moisture: '' })); }}
                className={fieldClass('moisture')}
              />
              {errors.moisture && <p className="text-xs text-destructive font-mono mt-1">{errors.moisture}</p>}
            </div>
          </div>

          {/* Type-specific fields */}
          {initialData.type === 'in' ? (
            <div>
              <Label className="text-muted-foreground font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                SOURCE FIELD
              </Label>
              <Select value={sourceField} onValueChange={(val) => setSourceField(val)}>
                <SelectTrigger className="mt-1 bg-muted border-border font-mono text-sm">
                  <SelectValue placeholder="Select field name..." />
                </SelectTrigger>
                <SelectContent>
                  {fields.filter(f => !f.deleted_at).map(f => (
                    <SelectItem key={f.id} value={f.name} className="font-mono text-xs">{f.name}</SelectItem>
                  ))}
                  {sourceField && !fields.find(f => f.name === sourceField) && (
                    <SelectItem value={sourceField} className="font-mono text-xs">{sourceField} (Current)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="destination" className="text-muted-foreground font-mono text-xs font-bold text-orange-600 dark:text-orange-400">
                  DESTINATION / BUYER
                </Label>
                <Input
                  id="destination"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="e.g. ADM, Cargill"
                  className="mt-1 bg-muted border-border font-mono text-sm"
                />
              </div>
              <div>
                <Label htmlFor="price" className="text-muted-foreground font-mono text-xs font-bold text-orange-600 dark:text-orange-400">
                  PRICE PER BUSHEL ($)
                </Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={e => { setPrice(e.target.value); setErrors(ex => ({ ...ex, price: '' })); }}
                  placeholder="0.00"
                  className={fieldClass('price')}
                />
                {errors.price && <p className="text-xs text-destructive font-mono mt-1">{errors.price}</p>}
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar size={14} />
              <span className="text-[11px] font-mono uppercase">
                Recorded: {new Date(initialData.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={isSaving || bins.length === 0}
            className="w-full bg-harvest text-white hover:bg-harvest/90 font-bold glow-harvest"
          >
            {isSaving ? 'Updating...' : 'Update Movement Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}