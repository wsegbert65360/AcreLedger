import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { native } from '@/lib/native';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, PlantRecord } from '@/types/farm';
import { Sprout, Loader2 } from 'lucide-react';

const CROP_STATUS_OPTIONS: NonNullable<PlantRecord['cropStatus']>[] = [
  'Planted',
  'Prevented Planting',
  'Failed',
  'Volunteer',
  'Cover Crop',
];

interface PlantModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: PlantRecord;
}

export default function PlantModal({ field, open, onClose, initialData }: PlantModalProps) {
  const { addPlantRecord, updatePlantRecord, savedSeeds, viewingSeason } = useFarm();
  const fieldIntendedUse = field.intendedUse || '';
  const fieldProducerShare = field.producerShare?.toString() || '100';
  const fieldIrrigationPractice = field.irrigationPractice || 'Non-Irrigated';
  const [seedVariety, setSeedVariety] = useState(initialData?.seedVariety || '');
  const [crop, setCrop] = useState(initialData?.crop || '');
  const [intendedUse, setIntendedUse] = useState(initialData?.intendedUse || fieldIntendedUse);
  const [producerShare, setProducerShare] = useState(initialData?.producerShare?.toString() || fieldProducerShare);
  const [irrigationPractice, setIrrigationPractice] = useState<'Irrigated' | 'Non-Irrigated'>(initialData?.irrigationPractice || fieldIrrigationPractice);
  const [cropStatus, setCropStatus] = useState<NonNullable<PlantRecord['cropStatus']>>(initialData?.cropStatus || 'Planted');
  const [plantingPattern, setPlantingPattern] = useState(initialData?.plantingPattern || '');
  const [plantDate, setPlantDate] = useState(initialData?.plantDate || new Date().toISOString().split('T')[0]);
  const [memo, setMemo] = useState(initialData?.memo || '');
  const [isSaving, setIsSaving] = useState(false);
  const requiresSeedVariety = cropStatus !== 'Prevented Planting';

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setSeedVariety(initialData.seedVariety || '');
      setCrop(initialData.crop || '');
      setIntendedUse(initialData.intendedUse || fieldIntendedUse);
      setProducerShare(initialData.producerShare?.toString() || fieldProducerShare);
      setIrrigationPractice(initialData.irrigationPractice || fieldIrrigationPractice);
      setCropStatus(initialData.cropStatus || 'Planted');
      setPlantingPattern(initialData.plantingPattern || '');
      setPlantDate(initialData.plantDate || new Date().toISOString().split('T')[0]);
      setMemo(initialData.memo || '');
    } else {
      setSeedVariety('');
      setCrop('');
      setIntendedUse(fieldIntendedUse);
      setProducerShare(fieldProducerShare);
      setIrrigationPractice(fieldIrrigationPractice);
      setCropStatus('Planted');
      setPlantingPattern('');
      setPlantDate(new Date().toISOString().split('T')[0]);
      setMemo('');
    }
  }, [initialData, fieldIntendedUse, fieldIrrigationPractice, fieldProducerShare, open]);

  const handleSubmit = async () => {
    if (requiresSeedVariety && !seedVariety.trim()) {
      native.haptic.error();
      return;
    }

    setIsSaving(true);
    try {
      let success = false;
      const savedSeedVariety = seedVariety.trim() || (cropStatus === 'Prevented Planting' ? 'N/A' : '');
      if (initialData) {
        success = await updatePlantRecord({
          ...initialData,
          seedVariety: savedSeedVariety,
          crop: crop.trim() || undefined,
          intendedUse: intendedUse.trim() || undefined,
          plantDate: plantDate || undefined,
          producerShare: parseFloat(producerShare) || 100,
          irrigationPractice,
          cropStatus,
          plantingPattern: plantingPattern.trim() || undefined,
          memo: memo.trim() || undefined,
        });
      } else {
        success = await addPlantRecord({
          fieldId: field.id,
          fieldName: field.name,
          seedVariety: savedSeedVariety,
          acreage: field.acreage,
          crop: crop.trim() || undefined,
          intendedUse: intendedUse.trim() || undefined,
          plantDate: plantDate || undefined,
          producerShare: parseFloat(producerShare) || 100,
          irrigationPractice,
          cropStatus,
          plantingPattern: plantingPattern.trim() || undefined,
          memo: memo.trim() || undefined,
        });
      }

      if (success) {
        native.haptic.success();
        if (!initialData) {
          setSeedVariety('');
          setCrop('');
          setIntendedUse('');
        }
        onClose();
      } else {
        native.haptic.error();
      }
    } catch (err) {
      console.error('Submission error:', err);
      toast.error('An unexpected error occurred while saving.');
      native.haptic.error();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-plant/30 max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center flex-wrap gap-2 text-plant">
            <div className="flex items-center gap-2">
              <Sprout size={20} />
              <span>{initialData ? 'Edit' : 'Plant'} — {field.name}</span>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-plant/10 text-plant border border-plant/20">
              {initialData ? initialData.seasonYear : viewingSeason} Season
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Log a new planting record or edit an existing one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="seedVariety" className="text-muted-foreground font-mono text-xs">
              SEED VARIETY {requiresSeedVariety ? '*' : ''}
            </Label>
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
              <span className="text-muted-foreground font-mono text-xs text-right block">ACREAGE</span>
              <div className="mt-1 px-3 py-2 bg-muted/50 border border-border/30 rounded-lg font-mono text-foreground text-center text-sm">
                {field.acreage} ac
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20">
            <div>
              <Label htmlFor="irrigationPracticeSelect" className="text-muted-foreground font-mono text-xs">IRRIGATION Practice *</Label>
              <Select value={irrigationPractice} onValueChange={(v: any) => setIrrigationPractice(v)}>
                <SelectTrigger id="irrigationPracticeSelect" className="mt-1 bg-muted border-border text-foreground">
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

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20">
            <div>
              <Label htmlFor="cropStatusSelect" className="text-muted-foreground font-mono text-xs">FSA STATUS</Label>
              <Select value={cropStatus} onValueChange={(v: NonNullable<PlantRecord['cropStatus']>) => setCropStatus(v)}>
                <SelectTrigger id="cropStatusSelect" className="mt-1 bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CROP_STATUS_OPTIONS.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="plantingPattern" className="text-muted-foreground font-mono text-xs">PATTERN</Label>
              <Input
                id="plantingPattern"
                name="plantingPattern"
                value={plantingPattern}
                onChange={e => setPlantingPattern(e.target.value)}
                placeholder="Optional"
                className="mt-1 bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border/20">
            <Label htmlFor="plantMemo" className="text-muted-foreground font-mono text-xs">MEMO</Label>
            <Textarea
              id="plantMemo"
              name="plantMemo"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="Optional notes about this planting..."
              className="mt-1 bg-muted border-border text-foreground resize-none"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={(requiresSeedVariety && !seedVariety.trim()) || isSaving}
            className="touch-target w-full bg-plant text-plant-foreground hover:bg-plant/90 glow-plant font-bold"
          >
            {isSaving ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={20} />
                <span>Saving...</span>
              </div>
            ) : (
              initialData ? 'Update Record' : 'Log Planting'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
