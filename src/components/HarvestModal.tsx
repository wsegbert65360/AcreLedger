import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, HarvestRecord } from '@/types/farm';
import { Wheat, Warehouse, Truck } from 'lucide-react';

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
  const [harvestDate, setHarvestDate] = useState(initialData?.harvestDate || new Date().toISOString().split('T')[0]);

  const reset = () => {
    if (!initialData) {
      setDestination(null);
      setBinId('');
      setMoisture('');
      setLandlordSplit('');
      setBushels('');
      setCrop('');
    }
  };

  const handleSubmit = () => {
    const m = parseFloat(moisture);
    const ls = parseFloat(landlordSplit);
    const bu = parseFloat(bushels);
    if (isNaN(m) || isNaN(ls) || isNaN(bu) || !destination) return;
    if (destination === 'bin' && !binId) return;

    const harvestData = {
      fieldId: field.id,
      fieldName: field.name,
      destination,
      binId: destination === 'bin' ? binId : undefined,
      moisturePercent: m,
      landlordSplitPercent: ls,
      bushels: bu,
      crop: crop.trim() || undefined,
      harvestDate: harvestDate || undefined,
    };

    if (initialData) {
      updateHarvestRecord({ ...initialData, ...harvestData });

      // Sync linked grain movement
      if (initialData.destination === 'bin') {
        const movement = grainMovements.find(gm =>
          gm.sourceFieldName === field.name &&
          gm.timestamp === initialData.timestamp &&
          gm.type === 'in'
        );
        if (movement) {
          const bin = bins.find(b => b.id === binId);
          updateGrainMovement({
            ...movement,
            binId: binId,
            binName: bin?.name || 'Unknown',
            bushels: bu,
            moisturePercent: m,
          });
        }
      } else if (destination === 'bin') {
        const bin = bins.find(b => b.id === binId);
        addGrainMovement({
          binId,
          binName: bin?.name || 'Unknown',
          type: 'in',
          bushels: bu,
          moisturePercent: m,
          sourceFieldName: field.name,
          timestamp: initialData.timestamp
        });
      }
    } else {
      addHarvestRecord(harvestData);
      if (destination === 'bin') {
        const bin = bins.find(b => b.id === binId);
        addGrainMovement({
          binId,
          binName: bin?.name || 'Unknown',
          type: 'in',
          bushels: bu,
          moisturePercent: m,
          sourceFieldName: field.name,
          timestamp: Date.now()
        });
      }
    }

    reset();
    onClose();
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
              disabled={!valid}
              className="touch-target flex-1 bg-harvest text-harvest-foreground hover:bg-harvest/90 glow-harvest font-bold"
            >
              {initialData ? 'Update Record' : 'Log Harvest'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog >
  );
}
