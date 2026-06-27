import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, HarvestRecord } from '@/types/farm';
import { native } from '@/lib/native';
import { toast } from 'sonner';
import { Wheat, Warehouse, Truck, Loader2 } from 'lucide-react';
import { getLatestForField } from '@/lib/utils';

interface HarvestModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: HarvestRecord;
  mode?: 'edit' | 'duplicate';
}

export default function HarvestModal({ field, open, onClose, initialData, mode = 'edit' }: HarvestModalProps) {
  const isDuplicate = mode === 'duplicate' && !!initialData;
  const { addHarvestRecord, updateHarvestRecord, addGrainMovement, updateGrainMovement, grainMovements, harvestRecords, bins, viewingSeason } = useFarm();
  const [destination, setDestination] = useState<'bin' | 'town' | null>(initialData?.destination || null);
  const [binId, setBinId] = useState(initialData?.binId || '');
  const [moisture, setMoisture] = useState(initialData?.moisturePercent?.toString() || '');
  const [landlordSplit, setLandlordSplit] = useState(initialData?.landlordSplitPercent?.toString() || '');
  const [bushels, setBushels] = useState(initialData?.bushels?.toString() || '');
  const [crop, setCrop] = useState(initialData?.crop || '');
  const [landlordName, setLandlordName] = useState(initialData?.landlordName || '');
  const [scaleTicketNumber, setScaleTicketNumber] = useState(initialData?.scaleTicketNumber || '');
  const [harvestDate, setHarvestDate] = useState(initialData?.harvestDate || new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  const suggestedHarvest = useMemo(() => {
    if (initialData) return null;
    return getLatestForField(harvestRecords, field.id, 'harvestDate');
  }, [field.id, initialData, harvestRecords]);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setDestination(initialData.destination || null);
      setBinId(initialData.binId || '');
      setMoisture(initialData.moisturePercent?.toString() || '');
      setLandlordSplit(initialData.landlordSplitPercent?.toString() || '');
      setBushels(initialData.bushels?.toString() || '');
      setCrop(initialData.crop || '');
      setLandlordName(initialData.landlordName || '');
      setScaleTicketNumber(initialData.scaleTicketNumber || '');
      setHarvestDate(isDuplicate ? new Date().toISOString().split('T')[0] : (initialData.harvestDate || new Date().toISOString().split('T')[0]));
    } else {
      setDestination(null);
      setBinId('');
      setMoisture('');
      setLandlordSplit(field.producerShare ? (100 - field.producerShare).toString() : '0');
      setBushels('');
      setCrop(suggestedHarvest?.crop || field.intendedUse || '');
      setLandlordName('');
      setScaleTicketNumber('');
      setHarvestDate(new Date().toISOString().split('T')[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.id, field.id, field.producerShare, field.intendedUse, open, isDuplicate]);

  const reset = () => {
    if (!initialData) {
      setDestination(null);
      setBinId('');
      setMoisture('');
      setLandlordSplit('');
      setBushels('');
      setCrop('');
      setLandlordName('');
      setScaleTicketNumber('');
    }
  };

  const handleSubmit = async (keepOpen = false) => {
    const m = parseFloat(moisture);
    const ls = parseFloat(landlordSplit);
    const bu = parseFloat(bushels);
    if (isNaN(m) || isNaN(ls) || isNaN(bu) || !destination) {
      native.haptic.error();
      return;
    }
    if (destination === 'bin' && !binId) {
      native.haptic.error();
      return;
    }

    setIsSaving(true);
    try {
      const harvestData = {
        fieldId: field.id,
        fieldName: field.name,
        destination,
        binId: destination === 'bin' ? binId : undefined,
        moisturePercent: m,
        landlordSplitPercent: ls,
        bushels: bu,
        crop: crop.trim() || undefined,
        landlordName: landlordName.trim() || undefined,
        scaleTicketNumber: scaleTicketNumber.trim() || undefined,
        harvestDate: harvestDate || undefined,
      };

      let success = false;
      if (initialData && !isDuplicate) {
        success = await updateHarvestRecord({ ...initialData, ...harvestData });
        if (!success) {
          toast.error('Failed to update harvest record.');
          native.haptic.error();
          return;
        }

        // Sync linked grain movement
        if (initialData.destination === 'bin') {
          const movement = grainMovements.find(gm =>
            gm.sourceFieldName === field.name &&
            gm.timestamp === initialData.timestamp &&
            gm.type === 'in'
          );
          if (movement) {
            const bin = bins.find(b => b.id === binId);
            const gmSuccess = await updateGrainMovement({
              ...movement,
              binId: binId,
              binName: bin?.name || 'Unknown',
              bushels: bu,
              moisturePercent: m,
            });
            if (!gmSuccess) {
              toast.error('Harvest saved but grain movement update failed.');
              native.haptic.error();
              return;
            }
          }
        } else if (destination === 'bin') {
          const bin = bins.find(b => b.id === binId);
          const gmSuccess = await addGrainMovement({
            binId,
            binName: bin?.name || 'Unknown',
            type: 'in',
            bushels: bu,
            moisturePercent: m,
            sourceFieldName: field.name,
            timestamp: initialData.timestamp,
          });
          if (!gmSuccess) {
            toast.error('Harvest saved but grain movement addition failed.');
            native.haptic.error();
            return;
          }
        }
      } else {
        success = await addHarvestRecord(harvestData);
        if (!success) {
          toast.error('Failed to save harvest record.');
          native.haptic.error();
          return;
        }

        if (destination === 'bin') {
          const bin = bins.find(b => b.id === binId);
          const gmSuccess = await addGrainMovement({
            binId,
            binName: bin?.name || 'Unknown',
            type: 'in',
            bushels: bu,
            moisturePercent: m,
            sourceFieldName: field.name,
            timestamp: Date.now(),
          });
          if (!gmSuccess) {
            toast.error('Harvest saved but grain movement addition failed.');
            native.haptic.error();
            return;
          }
        }
      }

      native.haptic.success();
      if (keepOpen) {
        setBushels('');
        setScaleTicketNumber('');
        toast.success('Record saved. Ready for next entry.');
      } else {
        reset();
        onClose();
      }
    } catch (err) {
      console.error('Submission error:', err);
      toast.error('An unexpected error occurred while saving.');
      native.haptic.error();
    } finally {
      setIsSaving(false);
    }
  };

  const valid = destination && moisture && landlordSplit && bushels && (destination === 'town' || binId);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { reset(); onClose(); } }}>
      <DialogContent className="bg-card border-harvest/30 max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center flex-wrap gap-2 text-harvest">
            <div className="flex items-center gap-2">
              <Wheat size={20} />
              <span>{isDuplicate ? 'Duplicate' : initialData ? 'Edit' : 'Harvest'} — {field.name}</span>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-harvest/10 text-harvest border border-harvest/20">
              {initialData && !isDuplicate ? initialData.seasonYear : viewingSeason} Season
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Log a new harvest record or edit an existing one.
          </DialogDescription>
        </DialogHeader>

        {!destination ? (
          <div className="space-y-3 py-4">
            <p className="text-muted-foreground font-mono text-xs text-center">SELECT DESTINATION</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setDestination('bin')}
                className="touch-target h-20 flex-col gap-2 bg-muted hover:bg-harvest/20 text-foreground border border-border hover:border-harvest/50"
                variant="outline"
              >
                <Warehouse size={24} />
                <span className="font-mono text-sm">Bin</span>
              </Button>
              <Button
                onClick={() => setDestination('town')}
                className="touch-target h-20 flex-col gap-2 bg-muted hover:bg-harvest/20 text-foreground border border-border hover:border-harvest/50"
                variant="outline"
              >
                <Truck size={24} />
                <span className="font-mono text-sm">Town</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {suggestedHarvest && !initialData && (
              <div className="bg-harvest/5 border border-harvest/20 rounded-lg p-2.5 flex items-start gap-2 text-xs text-foreground animate-in fade-in duration-200">
                <div className="flex-grow">
                  Prefilled from last harvest on this field: <span className="font-bold">{suggestedHarvest.crop || 'Crop'}</span>.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCrop('');
                  }}
                  className="text-harvest hover:underline font-bold"
                >
                  Clear
                </button>
              </div>
            )}
            {destination === 'bin' && (
              <div>
                <Label htmlFor="harvestBinSelect" className="text-muted-foreground font-mono text-xs">SELECT BIN</Label>
                <Select value={binId} onValueChange={setBinId}>
                  <SelectTrigger id="harvestBinSelect" className="mt-1 bg-muted border-border">
                    <SelectValue placeholder="Choose bin..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {bins.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="harvestCrop" className="text-muted-foreground font-mono text-xs">CROP TYPE</Label>
              <Input
                id="harvestCrop"
                name="harvestCrop"
                value={crop}
                onChange={e => setCrop(e.target.value)}
                placeholder="e.g. Corn, Soybeans"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="landlordName" className="text-muted-foreground font-mono text-xs">LANDLORD NAME</Label>
              <Input
                id="landlordName"
                name="landlordName"
                value={landlordName}
                onChange={e => setLandlordName(e.target.value)}
                placeholder="Optional"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="scaleTicketNumber" className="text-muted-foreground font-mono text-xs">SCALE TICKET #</Label>
              <Input
                id="scaleTicketNumber"
                name="scaleTicketNumber"
                value={scaleTicketNumber}
                onChange={e => setScaleTicketNumber(e.target.value)}
                placeholder="Optional — e.g. TKT-00482"
                autoCapitalize="characters"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="harvestDate" className="text-muted-foreground font-mono text-xs">HARVEST DATE</Label>
              <Input
                id="harvestDate"
                name="harvestDate"
                type="date"
                value={harvestDate}
                onChange={e => setHarvestDate(e.target.value)}
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label htmlFor="bushels" className="text-muted-foreground font-mono text-xs">BUSHELS</Label>
              <Input
                id="bushels"
                name="bushels"
                type="number"
                value={bushels}
                onChange={e => setBushels(e.target.value)}
                placeholder="0"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="moisture" className="text-muted-foreground font-mono text-xs">MOISTURE %</Label>
                <Input
                  id="moisture"
                  name="moisture"
                  type="number"
                  value={moisture}
                  onChange={e => setMoisture(e.target.value)}
                  placeholder="0.0"
                  className="mt-1 bg-muted border-border text-foreground"
                />
              </div>
              <div>
                <Label htmlFor="landlordSplit" className="text-muted-foreground font-mono text-xs">LANDLORD %</Label>
                <Input
                  id="landlordSplit"
                  name="landlordSplit"
                  type="number"
                  value={landlordSplit}
                  onChange={e => setLandlordSplit(e.target.value)}
                  placeholder="0"
                  className="mt-1 bg-muted border-border text-foreground"
                />
              </div>
            </div>
          </div>
        )}

        {destination && (
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <div className="flex w-full gap-2">
              <Button type="button" variant="outline" onClick={() => setDestination(null)} className="touch-target flex-1 border-border text-muted-foreground h-11 text-xs">
                Back
              </Button>
              {(!initialData || isDuplicate) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSubmit(true)}
                  disabled={!valid || isSaving}
                  className="touch-target flex-1 border-harvest/30 text-harvest hover:bg-harvest/10 font-bold h-11 text-xs"
                >
                  Save & Log Another
                </Button>
              )}
              <Button
                onClick={() => handleSubmit(false)}
                disabled={!valid || isSaving}
                className="touch-target flex-1 bg-harvest text-harvest-foreground hover:bg-harvest/90 glow-harvest font-bold h-11 text-xs"
              >
                {isSaving ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Saving...</span>
                  </div>
                ) : (
                  isDuplicate ? 'Log Duplicate' : initialData ? 'Update Record' : 'Log Harvest'
                )}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog >
  );
}
