import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFarm } from '@/store/farmStore';
import { Bin } from '@/types/farm';
import { native } from '@/lib/native';
import { localDateTimeMs, toLocalIsoDate, toLocalTime } from '@/utils/dates';
import { Warehouse, Plus, Hash, Calendar } from 'lucide-react';

interface AddGrainModalProps {
    bin: Bin;
    open: boolean;
    onClose: () => void;
}

export default function AddGrainModal({ bin, open, onClose }: AddGrainModalProps) {
    const { addGrainMovement, viewingSeason } = useFarm();
    const [bushels, setBushels] = useState('');
    const [moisture, setMoisture] = useState('15.0');
    const [source, setSource] = useState('');
    const [date, setDate] = useState(() => toLocalIsoDate(Date.now()));

    const [time, setTime] = useState(() => toLocalTime(Date.now()));

    useEffect(() => {
        if (!open) return;
        const now = Date.now();
        setDate(toLocalIsoDate(now));
        setTime(toLocalTime(now));
    }, [open]);

    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async () => {
        const amount = parseFloat(bushels);
        const m = parseFloat(moisture);
        if (isNaN(amount) || amount <= 0) {
            native.haptic.error();
            return;
        }
        if (isNaN(m) || !Number.isFinite(localDateTimeMs(date, time))) {
            native.haptic.error();
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
                timestamp: localDateTimeMs(date, time),
                sourceFieldName: source.trim() || undefined,
            });
            if (success) {
                native.haptic.success();
                setBushels('');
                setMoisture('15.0');
                setSource('');
                onClose();
            } else {
                native.haptic.error();
            }
        } catch (_error) {
            native.haptic.error();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
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
                        Add grain inventory to a specific bin.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-3">
                        <div>
                            <Label htmlFor="addBushels" className="text-muted-foreground font-mono text-xs font-bold flex items-center gap-1.5">
                                <Hash size={12} /> BUSHELS TO ADD *
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
                    </div>
                </div>

                <DialogFooter className="pt-2">
                    <Button
                        onClick={handleSubmit}
                        disabled={!Number.isFinite(localDateTimeMs(date, time)) || isSaving || !bushels || isNaN(parseFloat(bushels)) || parseFloat(bushels) <= 0}
                        className="w-full bg-harvest text-white hover:bg-harvest/90 glow-harvest font-bold py-6 text-lg"
                    >
                        {isSaving ? 'Saving...' : 'Save Inventory'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
