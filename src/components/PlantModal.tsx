import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, PlantRecord } from '@/types/farm';
import { Sprout } from 'lucide-react';

interface PlantModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: PlantRecord;
}

export default function PlantModal({ field, open, onClose, initialData }: PlantModalProps) {
  const { addPlantRecord, updatePlantRecord, savedSeeds } = useFarm();
  const [seedVariety, setSeedVariety] = useState(initialData?.seedVariety || '');
  const [crop, setCrop] = useState(initialData?.crop || '');
  const [intendedUse, setIntendedUse] = useState(initialData?.intendedUse || field.intendedUse || '');
  const [producerShare, setProducerShare] = useState(initialData?.producerShare?.toString() || field.producerShare?.toString() || '100');
  const [irrigationPractice, setIrrigationPractice] = useState<'Irrigated' | 'Non-Irrigated'>(initialData?.irrigationPractice || field.irrigationPractice || 'Non-Irrigated');
  const [plantDate, setPlantDate] = useState(initialData?.plantDate || new Date().toISOString().split('T')[0]);

  const handleSubmit = () => {
    if (!seedVariety.trim()) return;

    if (initialData) {
      updatePlantRecord({
        ...initialData,
        seedVariety: seedVariety.trim(),
        crop: crop.trim() || undefined,
        intendedUse: intendedUse.trim() || undefined,
        plantDate: plantDate || undefined,
        producerShare: parseFloat(producerShare) || 100,
        irrigationPractice,
      });
    } else {
      addPlantRecord({
        fieldId: field.id,
        fieldName: field.name,
        seedVariety: seedVariety.trim(),
        acreage: field.acreage,
        crop: crop.trim() || undefined,
        intendedUse: intendedUse.trim() || undefined,
        plantDate: plantDate || undefined,
        producerShare: parseFloat(producerShare) || 100,
        irrigationPractice,
      });
    }

    if (!initialData) {
      setSeedVariety('');
      setCrop('');
      setIntendedUse('');
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-plant/30 max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-plant">
            <Sprout size={20} />
            {initialData ? 'Edit' : 'Plant'} — {field.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="seedVariety" className="text-muted-foreground font-mono text-xs">SEED VARIETY *</Label>
            {savedSeeds.length > 0 ? (
              <Select value={seedVariety} onValueChange={setSeedVariety}>
                <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
                  <SelectValue placeholder="Select a seed variety" />
                </SelectTrigger>
                <SelectContent>
                  {savedSeeds.map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="seedVariety"
                name="seedVariety"
                value={seedVariety}
                onChange={e => setSeedVariety(e.target.value)}
                placeholder="e.g. DKC 64-35 (add seeds in Setup)"
                className="mt-1 bg-muted border-border text-foreground"
                autoFocus
              />
            )}
          </div>
          <div>
            <Label htmlFor="cropType" className="text-muted-foreground font-mono text-xs">CROP TYPE</Label>
            <Input
              id="cropType"
              name="cropType"
              value={crop}
              onChange={e => setCrop(e.target.value)}
              placeholder="e.g. Corn, Soybeans"
              className="mt-1 bg-muted border-border text-foreground"
            />
          </div>
          <div>
            <Label htmlFor="plantDate" className="text-muted-foreground font-mono text-xs">PLANT DATE</Label>
            <Input
              id="plantDate"
              name="plantDate"
              type="date"
              value={plantDate}
              onChange={e => setPlantDate(e.target.value)}
              className="mt-1 bg-muted border-border text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="intendedUse" className="text-muted-foreground font-mono text-xs">INTENDED USE</Label>
              <Input
                id="intendedUse"
                name="intendedUse"
                value={intendedUse}
                onChange={e => setIntendedUse(e.target.value)}
                placeholder="e.g. Grain"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
            <div>
              <Label className="text-muted-foreground font-mono text-xs text-right block">ACREAGE</Label>
              <div className="mt-1 px-3 py-2 bg-muted/50 border border-border/30 rounded-md font-mono text-foreground text-center text-sm">
                {field.acreage} ac
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20">
            <div>
              <Label className="text-muted-foreground font-mono text-xs">IRRIGATION Practice *</Label>
              <Select value={irrigationPractice} onValueChange={(v: any) => setIrrigationPractice(v)}>
                <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Non-Irrigated">Non-Irrigated (NI)</SelectItem>
                  <SelectItem value="Irrigated">Irrigated (IR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="producerShare" className="text-muted-foreground font-mono text-xs">PRODUCER SHARE % *</Label>
              <Input
                id="producerShare"
                name="producerShare"
                type="number"
                step="1"
                min="0"
                max="100"
                value={producerShare}
                onChange={e => setProducerShare(e.target.value)}
                className="mt-1 bg-muted border-border text-foreground font-mono"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!seedVariety.trim()}
            className="touch-target w-full bg-plant text-plant-foreground hover:bg-plant/90 glow-plant font-bold"
          >
            {initialData ? 'Update Record' : 'Log Planting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
