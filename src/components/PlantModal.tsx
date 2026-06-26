import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Sprout } from 'lucide-react';
import { toast } from 'sonner';
import { getLatestForField } from '@/lib/utils';

import { native } from '@/lib/native';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFarm } from '@/store/farmStore';
import { Field, PlantRecord } from '@/types/farm';
import { formatIsoDate } from '@/utils/dates';

const CROP_STATUS_OPTIONS: NonNullable<PlantRecord['cropStatus']>[] = [
  'Planted',
  'Prevented Planting',
  'Failed',
  'Volunteer',
  'Cover Crop',
];

const CROP_SEQUENCE_OPTIONS: NonNullable<PlantRecord['cropSequence']>[] = [
  'First Crop',
  'Second Crop',
];

interface PlantModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: PlantRecord;
  mode?: 'edit' | 'duplicate';
}

export default function PlantModal({ field, open, onClose, initialData, mode = 'edit' }: PlantModalProps) {
  const isDuplicate = mode === 'duplicate' && !!initialData;
  const { addPlantRecord, updatePlantRecord, plantRecords, savedSeeds, viewingSeason } = useFarm();
  const fieldIntendedUse = field.intendedUse || '';
  const fieldProducerShare = field.producerShare?.toString() || '100';
  const fieldIrrigationPractice = field.irrigationPractice || 'Non-Irrigated';
  const [seedVariety, setSeedVariety] = useState(initialData?.seedVariety || '');
  const [crop, setCrop] = useState(initialData?.crop || '');
  const [intendedUse, setIntendedUse] = useState(initialData?.intendedUse || fieldIntendedUse);
  const [producerShare, setProducerShare] = useState(initialData?.producerShare?.toString() || fieldProducerShare);
  const [irrigationPractice, setIrrigationPractice] = useState<'Irrigated' | 'Non-Irrigated'>(initialData?.irrigationPractice || fieldIrrigationPractice);
  const [cropStatus, setCropStatus] = useState<NonNullable<PlantRecord['cropStatus']>>(initialData?.cropStatus || 'Planted');
  const [cropSequence, setCropSequence] = useState<NonNullable<PlantRecord['cropSequence']>>(initialData?.cropSequence || 'First Crop');
  const [plantingPattern, setPlantingPattern] = useState(initialData?.plantingPattern || '');
  const [plantDate, setPlantDate] = useState(initialData?.plantDate || new Date().toISOString().split('T')[0]);
  const [acreage, setAcreage] = useState((initialData?.acreage ?? field.acreage).toString());
  const [memo, setMemo] = useState(initialData?.memo || '');
  const [isSaving, setIsSaving] = useState(false);
  const requiresSeedVariety = cropStatus !== 'Prevented Planting';
  const duplicatePlanting = useMemo(() => {
    const targetSeason = initialData && !isDuplicate ? initialData.seasonYear : viewingSeason;

    return (plantRecords || [])
      .filter(record =>
        record.fieldId === field.id
        && record.seasonYear === targetSeason
        && record.id !== (isDuplicate ? undefined : initialData?.id)
        && !record.deleted_at
        && (record.cropStatus ?? 'Planted') === 'Planted'
        && (record.cropSequence ?? 'First Crop') === cropSequence
      )
      .sort((a, b) => {
        const bTime = new Date(b.plantDate || b.timestamp).getTime();
        const aTime = new Date(a.plantDate || a.timestamp).getTime();
        return bTime - aTime;
      })[0];
  }, [cropSequence, field.id, initialData, isDuplicate, plantRecords, viewingSeason]);
  const duplicatePlantingDate = duplicatePlanting
    ? formatIsoDate(duplicatePlanting.plantDate)
        || (Number.isFinite(new Date(duplicatePlanting.timestamp).getTime())
            ? new Date(duplicatePlanting.timestamp).toLocaleDateString()
            : '')
    : '';

  const suggestedPlanting = useMemo(() => {
    if (initialData) return null;
    return getLatestForField(
      plantRecords,
      field.id,
      'plantDate',
      record => (record.cropStatus ?? 'Planted') === 'Planted'
    );
  }, [field.id, initialData, plantRecords]);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setSeedVariety(initialData.seedVariety || '');
      setCrop(initialData.crop || '');
      setIntendedUse(initialData.intendedUse || fieldIntendedUse);
      setProducerShare(initialData.producerShare?.toString() || fieldProducerShare);
      setIrrigationPractice(initialData.irrigationPractice || fieldIrrigationPractice);
      setCropStatus(initialData.cropStatus || 'Planted');
      setCropSequence(initialData.cropSequence || 'First Crop');
      setPlantingPattern(initialData.plantingPattern || '');
      setPlantDate(isDuplicate ? new Date().toISOString().split('T')[0] : (initialData.plantDate || new Date().toISOString().split('T')[0]));
      setAcreage((initialData.acreage ?? field.acreage).toString());
      setMemo(initialData.memo || '');
    } else {
      setSeedVariety(suggestedPlanting?.seedVariety || '');
      setCrop(suggestedPlanting?.crop || '');
      setIntendedUse(fieldIntendedUse);
      setProducerShare(fieldProducerShare);
      setIrrigationPractice(fieldIrrigationPractice);
      setCropStatus('Planted');
      setCropSequence('First Crop');
      setPlantingPattern('');
      setPlantDate(new Date().toISOString().split('T')[0]);
      setAcreage(field.acreage.toString());
      setMemo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.acreage, initialData?.id, fieldIntendedUse, fieldIrrigationPractice, fieldProducerShare, open, isDuplicate]);

  const handleSubmit = async () => {
    if (requiresSeedVariety && !seedVariety.trim()) {
      native.haptic.error();
      return;
    }

    const plantedAcres = parseFloat(acreage);
    if (!Number.isFinite(plantedAcres) || plantedAcres <= 0) {
      toast.error('Enter planted acres greater than 0.');
      native.haptic.error();
      return;
    }

    setIsSaving(true);
    try {
      let success = false;
      const savedSeedVariety = seedVariety.trim() || (cropStatus === 'Prevented Planting' ? 'N/A' : '');
      if (initialData && !isDuplicate) {
        success = await updatePlantRecord({
          ...initialData,
          seedVariety: savedSeedVariety,
          acreage: plantedAcres,
          crop: crop.trim() || undefined,
          intendedUse: intendedUse.trim() || undefined,
          plantDate: plantDate || undefined,
          producerShare: parseFloat(producerShare) || 100,
          irrigationPractice,
          cropStatus,
          cropSequence: cropStatus === 'Planted' ? cropSequence : undefined,
          plantingPattern: plantingPattern.trim() || undefined,
          memo: memo.trim() || undefined,
        });
      } else {
        success = await addPlantRecord({
          fieldId: field.id,
          fieldName: field.name,
          seedVariety: savedSeedVariety,
          acreage: plantedAcres,
          crop: crop.trim() || undefined,
          intendedUse: intendedUse.trim() || undefined,
          plantDate: plantDate || undefined,
          producerShare: parseFloat(producerShare) || 100,
          irrigationPractice,
          cropStatus,
          cropSequence: cropStatus === 'Planted' ? cropSequence : undefined,
          plantingPattern: plantingPattern.trim() || undefined,
          memo: memo.trim() || undefined,
        });
      }

      if (success) {
        native.haptic.success();
        if (!initialData || isDuplicate) {
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
              <span>{isDuplicate ? 'Duplicate' : initialData ? 'Edit' : 'Plant'} — {field.name}</span>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-plant/10 text-plant border border-plant/20">
              {initialData && !isDuplicate ? initialData.seasonYear : viewingSeason} Season
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Log a new planting record or edit an existing one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {cropStatus === 'Planted' && duplicatePlanting && (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-foreground [&>svg]:text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                Already marked planted
              </AlertTitle>
              <AlertDescription className="text-sm text-muted-foreground">
                {field.name} already has a {cropSequence.toLowerCase()} planting{duplicatePlantingDate ? ` on ${duplicatePlantingDate}` : ' this season'}.
              </AlertDescription>
            </Alert>
          )}
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
              <Label htmlFor="plantedAcres" className="text-muted-foreground font-mono text-xs">PLANTED ACRES</Label>
              <Input
                id="plantedAcres"
                name="plantedAcres"
                type="number"
                min="0"
                step="0.01"
                value={acreage}
                onChange={e => setAcreage(e.target.value)}
                className="mt-1 bg-muted border-border text-foreground font-mono"
              />
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
            {cropStatus === 'Planted' && (
              <div>
                <Label htmlFor="cropSequenceSelect" className="text-muted-foreground font-mono text-xs">CROP SEQUENCE</Label>
                <Select value={cropSequence} onValueChange={(v: NonNullable<PlantRecord['cropSequence']>) => setCropSequence(v)}>
                  <SelectTrigger id="cropSequenceSelect" className="mt-1 bg-muted border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CROP_SEQUENCE_OPTIONS.map(sequence => (
                      <SelectItem key={sequence} value={sequence}>{sequence}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              isDuplicate ? 'Log Duplicate' : initialData ? 'Update Record' : 'Log Planting'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
