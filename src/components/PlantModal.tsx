import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, PlantRecord } from '@/types/farm';
import { Sprout, Loader2 } from 'lucide-react';

interface PlantModalProps {
  field: Field;
  open: boolean;
  onClose: () => void;
  initialData?: PlantRecord;
}

export default function PlantModal({ field, open, onClose, initialData }: PlantModalProps) {
  const { addPlantRecord, updatePlantRecord, savedSeeds, plantRecords, activeSeason } = useFarm();

  // ─── Form state ──────────────────────────────────────────────────────────
  const [seedVariety, setSeedVariety] = useState(initialData?.seedVariety || '');
  const [crop, setCrop] = useState(initialData?.crop || '');
  const [intendedUse, setIntendedUse] = useState(initialData?.intendedUse || field.intendedUse || 'Grain');
  const [producerShare, setProducerShare] = useState(initialData?.producerShare?.toString() || field.producerShare?.toString() || '100');
  const [irrigationPractice, setIrrigationPractice] = useState<'Irrigated' | 'Non-Irrigated'>(initialData?.irrigationPractice || field.irrigationPractice || 'Non-Irrigated');
  const [plantDate, setPlantDate] = useState(initialData?.plantDate || new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Validation state (spray-pattern) ────────────────────────────────────
  const [showValidation, setShowValidation] = useState(() => !!initialData?.nonCompliant);

  /** Red background + red outline on an empty field during validation. */
  const missingStyle = (value: string): React.CSSProperties =>
    showValidation && !value.trim()
      ? { backgroundColor: '#fecaca', outline: '2px solid #ef4444', outlineOffset: '-2px' }
      : {};

  /** Bold red label text for empty field during validation. */
  const missingLabelStyle = (value: string): React.CSSProperties =>
    showValidation && !value.trim()
      ? { color: '#dc2626', fontWeight: 800 }
      : {};

  /** Inline "← FILL THIS" badge rendered next to label text. */
  const needBadge = (value: string) =>
    showValidation && !value.trim()
      ? <span style={{ color: '#dc2626', fontWeight: 800, marginLeft: 4, fontSize: 10 }}>← FILL THIS</span>
      : null;

  // ─── Two-tier validation ─────────────────────────────────────────────────
  /** Hard gate: seed variety + plant date required to save. */
  const isMinimumValid = !!seedVariety.trim() && !!plantDate;

  /** Soft gate: all FSA 578 fields present. Missing = warning, not blocker. */
  const isFullyCompliant =
    !!seedVariety.trim() &&
    !!crop.trim() &&
    !!plantDate &&
    !!intendedUse.trim() &&
    !!producerShare.trim() &&
    parseFloat(producerShare) > 0 &&
    !!irrigationPractice &&
    !!field.fsaFarmNumber?.trim() &&
    !!field.fsaTractNumber?.trim() &&
    !!field.fsaFieldNumber?.trim();

  /** List of human-readable field names that are missing for the red banner. */
  const missingComplianceFields = useMemo(() => {
    const fields: string[] = [];
    if (!crop.trim()) fields.push('Crop type');
    if (!intendedUse.trim()) fields.push('Intended use');
    if (!producerShare.trim() || parseFloat(producerShare) <= 0) fields.push('Producer share %');
    if (!field.fsaFarmNumber?.trim()) fields.push('FSA Farm #');
    if (!field.fsaTractNumber?.trim()) fields.push('FSA Tract #');
    if (!field.fsaFieldNumber?.trim()) fields.push('FSA Field #');
    return fields;
  }, [crop, intendedUse, producerShare, field]);

  // ─── Duplicate plant guard (BUG-11) ──────────────────────────────────────
  const hasDuplicatePlant = useMemo(() => {
    if (initialData) return false; // editing existing is fine
    return plantRecords.some(
      r => r.fieldId === field.id && r.seasonYear === activeSeason && !r.deleted_at
    );
  }, [plantRecords, field.id, activeSeason, initialData]);

  // ─── Reset on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (initialData) {
      // Edit mode: use ONLY saved values — no field defaults.
      // This preserves intentionally-empty compliance fields so the
      // red highlights and missing-fields banner work correctly.
      setSeedVariety(initialData.seedVariety || '');
      setCrop(initialData.crop || '');
      setIntendedUse(initialData.intendedUse || '');
      setProducerShare(initialData.producerShare?.toString() || '');
      setIrrigationPractice(initialData.irrigationPractice || field.irrigationPractice || 'Non-Irrigated');
      setPlantDate(initialData.plantDate || new Date().toISOString().split('T')[0]);
      setShowValidation(!!initialData.nonCompliant);
    } else {
      // Add mode: pre-fill from field defaults for convenience
      setSeedVariety('');
      setCrop('');
      setIntendedUse(field.intendedUse || 'Grain');
      setProducerShare(field.producerShare?.toString() || '100');
      setIrrigationPractice(field.irrigationPractice || 'Non-Irrigated');
      setPlantDate(new Date().toISOString().split('T')[0]);
      setShowValidation(false);
    }
  }, [initialData, field, open]);

  // ─── Seed selection auto-populates crop (BUG-7) ─────────────────────────
  const handleSeedSelect = (val: string) => {
    setSeedVariety(val);
    const seed = savedSeeds.find(s => s.name === val);
    if (seed?.crop && !crop.trim()) {
      setCrop(seed.crop);
    }
  };

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (hasDuplicatePlant) {
      toast.error('This field already has a planting record for this season.');
      return;
    }
    if (!isMinimumValid) {
      setShowValidation(true);
      toast.error('Enter a seed variety and plant date to save.');
      return;
    }
    if (!isFullyCompliant) {
      setShowValidation(true);
      // does NOT return — save proceeds with warning
    }

    setIsSaving(true);
    try {
      let success = false;
      if (initialData) {
        success = await updatePlantRecord({
          ...initialData,
          seedVariety: seedVariety.trim(),
          crop: crop.trim() || undefined,
          intendedUse: intendedUse.trim() || undefined,
          plantDate: plantDate || undefined,
          producerShare: producerShare.trim() ? parseFloat(producerShare) : undefined,
          irrigationPractice,
          nonCompliant: !isFullyCompliant,
        });
      } else {
        success = await addPlantRecord({
          fieldId: field.id,
          fieldName: field.name,
          seedVariety: seedVariety.trim(),
          acreage: field.acreage,
          crop: crop.trim() || undefined,
          intendedUse: intendedUse.trim() || undefined,
          plantDate: plantDate || undefined,
          producerShare: producerShare.trim() ? parseFloat(producerShare) : undefined,
          irrigationPractice,
          nonCompliant: !isFullyCompliant,
        });
      }

      if (success) {
        onClose();
      }
    } catch (err) {
      console.error('Submission error:', err);
      toast.error('An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-plant/30 max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-plant">
            <Sprout size={20} />
            {initialData ? 'Edit' : 'Plant'} — {field.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* ── Seed Variety ──────────────────────────────────────────────── */}
          <div>
            <Label htmlFor="seedVariety" className="text-muted-foreground font-mono text-xs" style={missingLabelStyle(seedVariety)}>
              SEED VARIETY *{needBadge(seedVariety)}
            </Label>
            {savedSeeds.length > 0 ? (
              <Select value={seedVariety} onValueChange={handleSeedSelect}>
                <SelectTrigger className="mt-1 bg-muted border-border text-foreground" style={missingStyle(seedVariety)}>
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
                style={missingStyle(seedVariety)}
                autoFocus
              />
            )}
          </div>

          {/* ── Crop Type ─────────────────────────────────────────────────── */}
          <div>
            <Label htmlFor="cropType" className="text-muted-foreground font-mono text-xs" style={missingLabelStyle(crop)}>
              CROP TYPE *{needBadge(crop)}
            </Label>
            <Input
              id="cropType"
              name="cropType"
              value={crop}
              onChange={e => setCrop(e.target.value)}
              placeholder="e.g. Corn, Soybeans"
              className="mt-1 bg-muted border-border text-foreground"
              style={missingStyle(crop)}
            />
          </div>

          {/* ── Plant Date ────────────────────────────────────────────────── */}
          <div>
            <Label htmlFor="plantDate" className="text-muted-foreground font-mono text-xs" style={missingLabelStyle(plantDate)}>
              PLANT DATE *{needBadge(plantDate)}
            </Label>
            <Input
              id="plantDate"
              name="plantDate"
              type="date"
              value={plantDate}
              onChange={e => setPlantDate(e.target.value)}
              className="mt-1 bg-muted border-border text-foreground"
              style={missingStyle(plantDate)}
            />
          </div>

          {/* ── Intended Use + Acreage ────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="intendedUse" className="text-muted-foreground font-mono text-xs" style={missingLabelStyle(intendedUse)}>
                INTENDED USE *{needBadge(intendedUse)}
              </Label>
              <Input
                id="intendedUse"
                name="intendedUse"
                value={intendedUse}
                onChange={e => setIntendedUse(e.target.value)}
                placeholder="e.g. Grain"
                className="mt-1 bg-muted border-border text-foreground"
                style={missingStyle(intendedUse)}
              />
            </div>
            <div>
              <Label className="text-muted-foreground font-mono text-xs text-right block">ACREAGE</Label>
              <div className="mt-1 px-3 py-2 bg-muted/50 border border-border/30 rounded-md font-mono text-foreground text-center text-sm">
                {field.acreage} ac
              </div>
            </div>
          </div>

          {/* ── FSA Compliance Section ────────────────────────────────────── */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-primary font-mono text-[10px] font-bold">FSA COMPLIANCE DATA</Label>
              {showValidation && missingComplianceFields.length > 0 && (
                <span className="inline-flex items-center bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {missingComplianceFields.length} needed
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-muted-foreground font-mono text-[9px] uppercase" style={missingLabelStyle(field.fsaFarmNumber || '')}>
                  FARM #{needBadge(field.fsaFarmNumber || '')}
                </Label>
                <div className="mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs font-mono text-foreground text-center">
                  {field.fsaFarmNumber || <span className="text-muted-foreground/50">Not set</span>}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground font-mono text-[9px] uppercase" style={missingLabelStyle(field.fsaTractNumber || '')}>
                  TRACT #{needBadge(field.fsaTractNumber || '')}
                </Label>
                <div className="mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs font-mono text-foreground text-center">
                  {field.fsaTractNumber || <span className="text-muted-foreground/50">Not set</span>}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground font-mono text-[9px] uppercase" style={missingLabelStyle(field.fsaFieldNumber || '')}>
                  FIELD #{needBadge(field.fsaFieldNumber || '')}
                </Label>
                <div className="mt-0.5 px-2 py-1.5 bg-background border border-border rounded text-xs font-mono text-foreground text-center">
                  {field.fsaFieldNumber || <span className="text-muted-foreground/50">Not set</span>}
                </div>
              </div>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground/60">
              Set FSA numbers in field settings to complete report data.
            </p>
          </div>

          {/* ── Irrigation + Producer Share ───────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20">
            <div>
              <Label className="text-muted-foreground font-mono text-xs">IRRIGATION PRACTICE</Label>
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
              <Label htmlFor="producerShare" className="text-muted-foreground font-mono text-xs" style={missingLabelStyle(producerShare)}>
                PRODUCER SHARE % *{needBadge(producerShare)}
              </Label>
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
                style={missingStyle(producerShare)}
              />
            </div>
          </div>

          {/* ── Duplicate warning ─────────────────────────────────────────── */}
          {hasDuplicatePlant && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-amber-600 font-mono text-xs font-bold uppercase tracking-wider">
                <AlertTriangle size={14} />
                Duplicate planting
              </div>
              <p className="text-[10px] font-mono text-amber-600/80 mt-1">
                This field already has a planting record for this season.
              </p>
            </div>
          )}

          {/* ── Missing fields banner (spray pattern) ──────────────────────── */}
          {showValidation && !isFullyCompliant && isMinimumValid && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1">
              <div className="flex items-center gap-2 text-destructive font-mono text-xs font-bold uppercase tracking-wider">
                <AlertTriangle size={14} />
                Missing {missingComplianceFields.length} field{missingComplianceFields.length !== 1 ? 's' : ''} — record will be saved as incomplete
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {missingComplianceFields.map(f => (
                  <li key={f} className="text-xs font-mono text-destructive font-semibold">✗ {f}</li>
                ))}
              </ul>
              <p className="text-[10px] font-mono text-destructive/60 mt-1.5">
                Fill these in now or complete later by editing the record or field settings.
              </p>
            </div>
          )}
        </div>

        {/* ── Tristate submit button (spray pattern) ─────────────────────── */}
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!isMinimumValid || isSaving || hasDuplicatePlant}
            className={`touch-target w-full font-bold ${
              isFullyCompliant
                ? 'bg-plant text-plant-foreground hover:bg-plant/90 glow-plant'
                : 'bg-yellow-600 text-white hover:bg-yellow-500'
            }`}
          >
            {isSaving ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={20} />
                <span>Saving...</span>
              </div>
            ) : hasDuplicatePlant ? (
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} />
                <span>Already Planted This Season</span>
              </div>
            ) : !isMinimumValid ? (
              'Enter Seed Variety to Save'
            ) : !isFullyCompliant ? (
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} />
                <span>{initialData ? 'Update (Incomplete Record)' : 'Save (Incomplete Record)'}</span>
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
