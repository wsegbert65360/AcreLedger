import { useState } from 'react';

import { Banknote, Truck, Hash, Calendar } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { native } from '@/lib/native';
import { useFarm } from '@/store/farmStore';
import { Bin } from '@/types/farm';
import { parseLocalDate } from '@/utils/dates';

interface SellModalProps {
    bin: Bin;
    open: boolean;
    onClose: () => void;
}

export default function SellModal({ bin, open, onClose }: SellModalProps) {
    const { addGrainMovement, getBinTotal, viewingSeason } = useFarm();
    const [bushels, setBushels] = useState('');
    const [price, setPrice] = useState('');
    const [moisture, setMoisture] = useState('');
    const [destination, setDestination] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSaving, setIsSaving] = useState(false);

    const currentInventory = getBinTotal(bin.id, viewingSeason);

    const handleSubmit = async () => {
        const amount = parseFloat(bushels);
        const p = parseFloat(price);
        const m = parseFloat(moisture) || 15.0;
        if (isNaN(amount) || amount <= 0 || amount > currentInventory) {
            native.haptic.error();
            return;
        }

        setIsSaving(true);
        try {
            // Combine selected date with current local time to ensure correct registration time and avoid UTC shift
            const localNow = new Date();
            const selectedDate = parseLocalDate(date);
            selectedDate.setHours(localNow.getHours(), localNow.getMinutes(), localNow.getSeconds(), localNow.getMilliseconds());

            const success = await addGrainMovement({
                binId: bin.id,
                binName: bin.name,
                type: 'out',
                bushels: amount,
                moisturePercent: m,
                timestamp: selectedDate.getTime(),
                price: isNaN(p) ? undefined : p,
                destination: destination.trim() || undefined,
            });

            if (success) {
                native.haptic.success();
                setBushels('');
                setPrice('');
                setMoisture('');
                setDestination('');
                onClose();
            } else {
                native.haptic.error();
            }
        } catch (error) {
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
                            <Banknote size={24} />
                            <span>Sell Harvest — {bin.name}</span>
                        </div>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-harvest/10 text-harvest border border-harvest/20">
                            {viewingSeason} Season
                        </span>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Record a grain sale from a specific bin.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Inventory Info */}
                    <div className="bg-muted/50 rounded-lg p-3 border border-border">
                        <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">Available Inventory</div>
                        <div className="text-xl font-bold text-foreground font-mono">{currentInventory.toLocaleString()} bu</div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <Label htmlFor="sellBushels" className="text-muted-foreground font-mono text-xs font-bold flex items-center gap-1.5">
                                <Hash size={12} /> BUSHELS SOLD *
                            </Label>
                            <Input
                                id="sellBushels"
                                name="sellBushels"
                                type="number"
                                value={bushels}
                                onChange={e => setBushels(e.target.value)}
                                placeholder="e.g. 1000"
                                className="mt-1 bg-muted border-border font-mono focus:ring-harvest"
                                autoFocus
                            />
                            {parseFloat(bushels) > currentInventory && (
                                <p className="text-[11px] text-destructive mt-1 font-mono font-bold">⚠️ EXCEEDS BIN INVENTORY</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="sellPrice" className="text-muted-foreground font-mono text-xs font-bold">PRICE / BU</Label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input
                                        id="sellPrice"
                                        name="sellPrice"
                                        type="number"
                                        step="0.01"
                                        value={price}
                                        onChange={e => setPrice(e.target.value)}
                                        placeholder="4.50"
                                        className="pl-7 bg-muted border-border font-mono"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="sellDate" className="text-muted-foreground font-mono text-xs font-bold">DATE</Label>
                                <Input
                                    id="sellDate"
                                    name="sellDate"
                                    type="date"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    className="mt-1 bg-muted border-border font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="buyer" className="text-muted-foreground font-mono text-xs font-bold flex items-center gap-1.5">
                                <Truck size={12} /> DESTINATION / BUYER
                            </Label>
                            <Input
                                id="buyer"
                                name="buyer"
                                value={destination}
                                onChange={e => setDestination(e.target.value)}
                                placeholder="e.g. ADM Lincoln"
                                className="mt-1 bg-muted border-border text-foreground"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="pt-2">
                    <Button
                        onClick={handleSubmit}
                        disabled={
                            isSaving ||
                            !bushels ||
                            isNaN(parseFloat(bushels)) ||
                            parseFloat(bushels) > currentInventory
                        }
                        className="w-full bg-harvest text-white hover:bg-harvest/90 glow-harvest font-bold py-6 text-lg"
                    >
                        {isSaving ? 'Selling...' : 'Confirm Sale'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
