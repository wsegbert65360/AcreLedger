import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { Field, HayHarvestRecord } from '@/types/farm';
import { Tractor, Thermometer, Cloud, Hash, Layers, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { WeatherService } from '@/services/WeatherService';

interface HayModalProps {
    field: Field;
    open: boolean;
    onClose: () => void;
    initialData?: HayHarvestRecord;
}

export default function HayModal({ field, open, onClose, initialData }: HayModalProps) {
    const { addHayHarvestRecord, updateHayHarvestRecord, viewingSeason } = useFarm();
    const [baleCount, setBaleCount] = useState(initialData?.baleCount.toString() || '');
    const [cuttingNumber, setCuttingNumber] = useState(initialData?.cuttingNumber.toString() || '1');
    const [baleType, setBaleType] = useState<'Round' | 'Square'>(initialData?.baleType || 'Round');
    const [temp, setTemp] = useState(initialData?.temperature?.toString() || '');
    const [conditions, setConditions] = useState(initialData?.conditions || '');
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
    const [loadingWeather, setLoadingWeather] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (initialData) {
            setBaleCount(initialData.baleCount.toString());
            setCuttingNumber(initialData.cuttingNumber.toString());
            setBaleType(initialData.baleType);
            setTemp(initialData.temperature?.toString() || '');
            setConditions(initialData.conditions || '');
            setDate(initialData.date || new Date().toISOString().split('T')[0]);
        } else {
            setBaleCount('');
            setCuttingNumber('1');
            setBaleType('Round');
            setTemp('');
            setConditions('');
            setDate(new Date().toISOString().split('T')[0]);
        }
    }, [open, initialData]);

    useEffect(() => {
        if (open && !initialData && field.lat != null && field.lng != null) {
            setLoadingWeather(true);
            WeatherService.fetchCurrentWeather(`${field.lat},${field.lng}`).then(w => {
                if (w) {
                    setTemp(w.temp.toString());
                    setConditions(`${w.wind}mph ${w.windDirection}, ${w.humidity}% humidity`);
                }
                setLoadingWeather(false);
            }).catch(() => {
                setLoadingWeather(false);
            });
        } else if (open && !initialData) {
            setLoadingWeather(false);
        }
    }, [open, field.lat, field.lng, initialData]);

    const handleSubmit = async () => {
        const count = parseInt(baleCount, 10);
        const cutting = parseInt(cuttingNumber, 10);
        if (isNaN(count) || isNaN(cutting)) return;

        setIsSaving(true);
        try {
            let success = false;
            if (initialData) {
                success = await updateHayHarvestRecord({
                    ...initialData,
                    date,
                    baleCount: count,
                    cuttingNumber: cutting,
                    baleType,
                    temperature: parseFloat(temp) || undefined,
                    conditions: conditions.trim() || undefined,
                });
            } else {
                success = await addHayHarvestRecord({
                    fieldId: field.id,
                    fieldName: field.name,
                    date,
                    baleCount: count,
                    cuttingNumber: cutting,
                    baleType,
                    temperature: parseFloat(temp) || undefined,
                    conditions: conditions.trim() || undefined,
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
            <DialogContent className="bg-card border-harvest/30 max-w-sm max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center flex-wrap gap-2 text-harvest font-bold uppercase tracking-tight">
                        <div className="flex items-center gap-2">
                            <Tractor size={20} />
                            <span>Hay/Forage — {field.name}</span>
                        </div>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-harvest/10 text-harvest border border-harvest/20 normal-case tracking-normal">
                            {initialData ? initialData.seasonYear : viewingSeason} Season
                        </span>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Log a new hay or forage harvest record.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="baleCount" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5 uppercase">
                                <Hash size={12} /> Bale Count *
                            </Label>
                            <Input
                                id="baleCount"
                                name="baleCount"
                                type="number"
                                value={baleCount}
                                onChange={e => setBaleCount(e.target.value)}
                                placeholder="e.g. 42"
                                className="mt-1 bg-muted border-border font-mono text-foreground"
                                autoFocus
                            />
                        </div>
                        <div>
                            <Label htmlFor="cuttingNumber" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5 uppercase">
                                <Layers size={12} /> Cutting #
                            </Label>
                            <Input
                                id="cuttingNumber"
                                name="cuttingNumber"
                                type="number"
                                value={cuttingNumber}
                                onChange={e => setCuttingNumber(e.target.value)}
                                placeholder="1"
                                className="mt-1 bg-muted border-border font-mono text-foreground"
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="baleType" className="text-muted-foreground font-mono text-[11px] uppercase">Bale Type</Label>
                        <Select value={baleType} onValueChange={(v: 'Round' | 'Square') => setBaleType(v)}>
                            <SelectTrigger className="mt-1 bg-muted border-border text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Round">Round Bale</SelectItem>
                                <SelectItem value="Square">Square Bale</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="hayDate" className="text-muted-foreground font-mono text-[11px] uppercase">Harvest Date</Label>
                        <Input
                            id="hayDate"
                            name="hayDate"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="mt-1 bg-muted border-border text-foreground font-mono"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-border/20 pt-3">
                        <div>
                            <Label htmlFor="hayTemp" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5 uppercase">
                                <Thermometer size={12} /> Temp (°F)
                            </Label>
                            <Input
                                id="hayTemp"
                                name="hayTemp"
                                type="number"
                                value={temp}
                                onChange={e => setTemp(e.target.value)}
                                placeholder={loadingWeather ? "..." : "72"}
                                className="mt-1 bg-muted border-border font-mono text-foreground"
                            />
                        </div>
                        <div>
                            <Label htmlFor="hayConditions" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5 uppercase">
                                <Cloud size={12} /> Conditions
                            </Label>
                            <Input
                                id="hayConditions"
                                name="hayConditions"
                                value={conditions}
                                onChange={e => setConditions(e.target.value)}
                                placeholder="Dry/Sunny"
                                className="mt-1 bg-muted border-border text-foreground text-xs"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-2">
                    <Button
                        onClick={handleSubmit}
                        disabled={!baleCount || isNaN(parseInt(baleCount, 10)) || isSaving}
                        className="w-full bg-harvest text-white hover:bg-harvest/90 glow-harvest font-bold uppercase tracking-widest text-xs py-5"
                    >
                        {isSaving ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="animate-spin" size={20} />
                                <span>Saving...</span>
                            </div>
                        ) : (
                            initialData ? 'Update Record' : 'Record Hay Baling'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
