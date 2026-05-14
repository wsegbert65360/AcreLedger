import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, HarvestRecord } from '@/types/farm';
import { Wheat, Warehouse, Truck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface HarvestModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: HarvestRecord;
}

export default function HarvestModal({ field, open, onClose, initialData }: HarvestModalProps) {
  const { addHarvestRecord, updateHarvestRecord, addGrainMovement, updateGrainMovement, grainMovements, bins } = useFarm();
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
      setHarvestDate(initialData.harvestDate || new Date().toISOString().split('T')[0]);
    } else {
      setDestination(null);
      setBinId('');
      setMoisture('');
      setLandlordSplit(field.producerShare ? (100 - field.producerShare).toString() : '0');
      setBushels('');
      setCrop(field.intendedUse || '');
      setLandlordName('');
      setScaleTicketNumber('');
      setHarvestDate(new Date().toISOString().split('T')[0]);
    }
  }, [initialData, field, open]);

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

  const handleSubmit = async () => {
    const m = parseFloat(moisture);
    const ls = parseFloat(landlordSplit);
    const bu = parseFloat(bushels);
    if (isNaN(m) || isNaN(ls) || isNaN(bu) || !destination) return;
    if (destination === 'bin' && !binId) return;

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
      if (initialData) {
        success = await updateHarvestRecord({ ...initialData, ...harvestData });
        if (!success) {
          toast.error('Failed to update harvest record.');
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
            return;
          }
        }
      } else {
        success = await addHarvestRecord(harvestData);
        if (!success) {
          toast.error('Failed to save harvest record.');
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
            return;
          }
        }
      }

      reset();
      onClose();
    } catch (err) {
      console.error('Submission error:', err);
      toast.error('An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const valid = destination && moisture && landlordSplit && bushels && (destination === 'town' || binId);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { reset(); onClose(); } }}>
      <DialogContent className="bg-card border-harvest/30 max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-harvest">
            <Wheat size={20} />
            {initialData ? 'Edit' : 'Harvest'} — {field.name}
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
            {destination === 'bin' && (
              <div>
                <Label className="text-muted-foreground font-mono text-xs">SELECT BIN</Label>
                <Select value={binId} onValueChange={setBinId}>
                  <SelectTrigger className="mt-1 bg-muted border-border">
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
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setDestination(null)} className="touch-target border-border text-muted-foreground">
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!valid || isSaving}
              className="touch-target flex-1 bg-harvest text-harvest-foreground hover:bg-harvest/90 glow-harvest font-bold"
            >
              {isSaving ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  <span>Saving...</span>
                </div>
              ) : (
                initialData ? 'Update Record' : 'Log Harvest'
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog >
  );
}
