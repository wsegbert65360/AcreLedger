import { useEffect, useMemo, useRef, useState } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Bin } from '@/types/farm';
import { native } from '@/lib/native';
import { getLatestForField } from '@/lib/utils';
import { localDateTimeMs, toLocalIsoDate, toLocalTime } from '@/utils/dates';
import { ArrowLeftRight, Calendar, Hash, Plus, Warehouse, Wheat } from 'lucide-react';

interface AddGrainModalProps {
    bin: Bin;
    open: boolean;
    onClose: () => void;
}

type AddPath = 'harvest' | 'adjust';

export default function AddGrainModal({ bin, open, onClose }: AddGrainModalProps) {
    const { addGrainMovement, addHarvestWithGrain, fields, harvestRecords, viewingSeason } = useFarm();
    const [path, setPath] = useState<AddPath | null>(null);
    const [bushels, setBushels] = useState('');
    const [moisture, setMoisture] = useState('15.0');
    const [date, setDate] = useState(() => toLocalIsoDate(Date.now()));

    const [time, setTime] = useState(() => toLocalTime(Date.now()));

    // Harvest path state
    const [fieldId, setFieldId] = useState('');
    const [crop, setCrop] = useState('');
    const [landlordName, setLandlordName] = useState('');
    const [landlordSplit, setLandlordSplit] = useState('0');
    const cropEditedRef = useRef(false);
    const landlordSplitEditedRef = useRef(false);

    // Adjustment path state (plain inventory movement — not tied to a field harvest)
    const [source, setSource] = useState('');

    // Retry-stable IDs so a failed atomic create can be retried with the same
    // idempotency key instead of orphaning the first attempt (HarvestModal pattern).
    const createIdsRef = useRef<{ harvestId: string; grainMovementId: string } | null>(null);
    const getCreateIds = () => {
        if (!createIdsRef.current) {
            createIdsRef.current = {
                harvestId: crypto.randomUUID(),
                grainMovementId: crypto.randomUUID(),
            };
        }
        return createIdsRef.current;
    };

    const activeFields = useMemo(() => fields.filter(f => !f.deleted_at), [fields]);

    useEffect(() => {
        if (!open) return;
        const now = Date.now();
        setDate(toLocalIsoDate(now));
        setTime(toLocalTime(now));
    }, [open]);

    // Suggested-record prefill: when the chosen field changes, seed crop and
    // landlord split from that field until the user edits them manually.
    useEffect(() => {
        if (!open || path !== 'harvest' || !fieldId) return;
        const field = activeFields.find(f => f.id === fieldId);
        if (!field) return;
        if (!cropEditedRef.current) {
            const suggestedHarvest = getLatestForField(harvestRecords, field.id, 'harvestDate', record => record.seasonYear === viewingSeason);
            setCrop(suggestedHarvest?.crop || field.intendedUse || '');
        }
        if (!landlordSplitEditedRef.current) {
            setLandlordSplit(field.producerShare != null ? (100 - field.producerShare).toString() : '0');
        }
        setLandlordName(field.landlordName || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, path, fieldId]);

    const reset = () => {
        setPath(null);
        setBushels('');
        setMoisture('15.0');
        setSource('');
        setFieldId('');
        setCrop('');
        setLandlordName('');
        setLandlordSplit('0');
        cropEditedRef.current = false;
        landlordSplitEditedRef.current = false;
        createIdsRef.current = null;
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const [isSaving, setIsSaving] = useState(false);

    const sharedNumbersValid = (() => {
        const amount = parseFloat(bushels);
        const m = parseFloat(moisture);
        return Number.isFinite(amount) && amount > 0 && Number.isFinite(m) && Number.isFinite(localDateTimeMs(date, time));
    })();

    const harvestValid = sharedNumbersValid
        && !!fieldId
        && !!crop.trim()
        && landlordSplit !== ''
        && Number.isFinite(parseFloat(landlordSplit));

    const adjustValid = sharedNumbersValid;

    const handleSave = async () => {
        const amount = parseFloat(bushels);
        const m = parseFloat(moisture);
        const ts = localDateTimeMs(date, time);
        if (!sharedNumbersValid || !Number.isFinite(ts)) {
            native.haptic.error();
            return;
        }

        if (path === 'harvest') {
            const ls = parseFloat(landlordSplit);
            const field = activeFields.find(f => f.id === fieldId);
            if (!field || isNaN(ls) || !crop.trim()) {
                native.haptic.error();
                return;
            }

            const ids = getCreateIds();
            setIsSaving(true);
            try {
                const success = await addHarvestWithGrain({
                    harvest: {
                        id: ids.harvestId,
                        fieldId: field.id,
                        fieldName: field.name,
                        destination: 'bin',
                        binId: bin.id,
                        bushels: amount,
                        moisturePercent: m,
                        landlordSplitPercent: ls,
                        crop: crop.trim(),
                        landlordName: landlordName.trim() || undefined,
                        harvestDate: date || undefined,
                        timestamp: ts,
                    },
                    grainMovement: {
                        id: ids.grainMovementId,
                        binId: bin.id,
                        binName: bin.name,
                        type: 'in',
                        bushels: amount,
                        moisturePercent: m,
                        sourceFieldName: field.name,
                        timestamp: ts,
                        harvestRecordId: ids.harvestId,
                    },
                });
                if (success) {
                    native.haptic.success();
                    createIdsRef.current = null;
                    handleClose();
                } else {
                    native.haptic.error();
                }
            } catch (_error) {
                native.haptic.error();
            } finally {
                setIsSaving(false);
            }
            return;
        }

        setIsSaving(true);
        try {
            const success = await addGrainMovement({
                binId: bin.id,
                binName: bin.name,
                type: 'in',
                bushels: amount,
                moisturePercent: m,
                timestamp: ts,
                sourceFieldName: source.trim() || undefined,
            });
            if (success) {
                native.haptic.success();
                handleClose();
            } else {
                native.haptic.error();
            }
        } catch (_error) {
            native.haptic.error();
        } finally {
            setIsSaving(false);
        }
    };

    const saveDisabled = isSaving || (path === 'harvest' ? !harvestValid : !adjustValid);

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
            <DialogContent className="bg-card border-harvest/30 max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center flex-wrap gap-2 text-harvest font-bold text-lg">
                        <div className="flex items-center gap-2">
                            <Plus size={24} className="bg-harvest/20 rounded p-1" />
                            <span>Add Grain — {bin.name}</span>
                        </div>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-harvest/10 text-harvest border border-harvest/20">
                            {viewingSeason} Season
                        </span>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Record grain entering a bin as a field harvest or as a plain inventory adjustment.
                    </DialogDescription>
                </DialogHeader>

                {!path ? (
                    <div className="space-y-3 py-4">
                        <p className="text-muted-foreground font-mono text-xs text-center">WHAT IS ENTERING THIS BIN?</p>
                        <div className="grid grid-cols-1 gap-3">
                            <Button
                                onClick={() => setPath('harvest')}
                                className="touch-target h-20 flex-col gap-1.5 bg-muted hover:bg-harvest/20 text-foreground border border-border hover:border-harvest/50"
                                variant="outline"
                            >
                                <Wheat size={22} />
                                <span className="font-mono text-sm">Harvest from field</span>
                                <span className="text-[11px] text-muted-foreground">Crop is tracked for FSA reports</span>
                            </Button>
                            <Button
                                onClick={() => setPath('adjust')}
                                className="touch-target h-16 flex-col gap-1 bg-muted hover:bg-harvest/20 text-foreground border border-border hover:border-harvest/50"
                                variant="outline"
                            >
                                <ArrowLeftRight size={20} />
                                <span className="font-mono text-sm">Other / inventory adjustment</span>
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        {path === 'harvest' && (
                            <>
                                <div>
                                    <Label htmlFor="addHarvestField" className="text-muted-foreground font-mono text-xs">SOURCE FIELD</Label>
                                    <Select value={fieldId} onValueChange={setFieldId}>
                                        <SelectTrigger id="addHarvestField" name="addHarvestField" className="mt-1 bg-muted border-border">
                                            <SelectValue placeholder="Choose field..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-popover border-border">
                                            {activeFields.map(f => (
                                                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="addHarvestCrop" className="text-muted-foreground font-mono text-xs">CROP TYPE *</Label>
                                    <Input
                                        id="addHarvestCrop"
                                        name="addHarvestCrop"
                                        value={crop}
                                        onChange={e => { cropEditedRef.current = true; setCrop(e.target.value); }}
                                        placeholder="e.g. Corn, Soybeans"
                                        className="mt-1 bg-muted border-border text-foreground"
                                    />
                                </div>
                            </>
                        )}

                        <div>
                            <Label htmlFor="addBushels" className="text-muted-foreground font-mono text-xs font-bold flex items-center gap-1.5">
                                <Hash size={12} /> BUSHELS *
                            </Label>
                            <Input
                                id="addBushels"
                                name="addBushels"
                                type="number"
                                value={bushels}
                                onChange={e => setBushels(e.target.value)}
                                placeholder="e.g. 1000"
                                className="mt-1 bg-muted border-border font-mono focus:ring-harvest"
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="addMoisture" className="text-muted-foreground font-mono text-xs font-bold">MOISTURE % *</Label>
                                <Input
                                    id="addMoisture"
                                    name="addMoisture"
                                    type="number"
                                    step="0.1"
                                    value={moisture}
                                    onChange={e => setMoisture(e.target.value)}
                                    className="mt-1 bg-muted border-border font-mono"
                                />
                            </div>
                            <div>
                                <Label htmlFor="addDate" className="text-muted-foreground font-mono text-xs font-bold flex items-center gap-1.5">
                                    <Calendar size={12} /> DATE
                                </Label>
                                <Input
                                    id="addDate"
                                    name="addDate"
                                    type="date"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    className="mt-1 bg-muted border-border font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="addTime" className="text-muted-foreground font-mono text-xs font-bold">TIME</Label>
                            <Input id="addTime" name="addTime" type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1 bg-muted border-border font-mono" />
                        </div>

                        {path === 'harvest' ? (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="addHarvestLandlordName" className="text-muted-foreground font-mono text-xs">LANDLORD NAME</Label>
                                    <Input
                                        id="addHarvestLandlordName"
                                        name="addHarvestLandlordName"
                                        value={landlordName}
                                        onChange={e => setLandlordName(e.target.value)}
                                        placeholder="Optional"
                                        className="mt-1 bg-muted border-border text-foreground"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="addHarvestLandlordSplit" className="text-muted-foreground font-mono text-xs">LANDLORD %</Label>
                                    <Input
                                        id="addHarvestLandlordSplit"
                                        name="addHarvestLandlordSplit"
                                        type="number"
                                        value={landlordSplit}
                                        onChange={e => { landlordSplitEditedRef.current = true; setLandlordSplit(e.target.value); }}
                                        placeholder="0"
                                        className="mt-1 bg-muted border-border text-foreground"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <Label htmlFor="source" className="text-muted-foreground font-mono text-xs font-bold flex items-center gap-1.5">
                                    <Warehouse size={12} /> SOURCE / FIELD NAME
                                </Label>
                                <Input
                                    id="source"
                                    name="source"
                                    value={source}
                                    onChange={e => setSource(e.target.value)}
                                    placeholder="e.g. Home Place, Storage Unit"
                                    className="mt-1 bg-muted border-border text-foreground"
                                />
                            </div>
                        )}
                    </div>
                )}

                {path && (
                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <div className="flex w-full gap-2">
                            <Button type="button" variant="outline" onClick={() => setPath(null)} className="touch-target flex-1 border-border text-muted-foreground h-11 text-xs">
                                Back
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={saveDisabled}
                                className="touch-target flex-[2] bg-harvest text-white hover:bg-harvest/90 glow-harvest font-bold h-11 text-xs"
                            >
                                {isSaving ? 'Saving...' : path === 'harvest' ? 'Save Harvest' : 'Save Inventory'}
                            </Button>
                        </div>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
