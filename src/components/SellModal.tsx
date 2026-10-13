import { useEffect, useRef, useState } from 'react';

import { Banknote, Truck, Hash } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { parseLocalizedNumber } from '@/lib/locale/numbers';
import { native } from '@/lib/native';
import { useFarm } from '@/store/farmStore';
import { useAppPreferences } from '@/store/useAppPreferences';
import { Bin } from '@/types/farm';
import { parseLocalDate, toLocalIsoDate } from '@/utils/dates';
import { formatMeasurement } from '@/utils/numbers';

interface SellModalProps {
    bin: Bin;
    open: boolean;
    onClose: () => void;
}

export default function SellModal({ bin, open, onClose }: SellModalProps) {
    const { addGrainMovement, getBinTotal, viewingSeason, session } = useFarm();
    const { preferences } = useAppPreferences(session?.user?.id ?? null);
    const [bushels, setBushels] = useState('');
    const [price, setPrice] = useState('');
    const [moisture, setMoisture] = useState('');
    const [destination, setDestination] = useState('');
    const [date, setDate] = useState(toLocalIsoDate(Date.now()));
    const [isSaving, setIsSaving] = useState(false);
    const wasOpenRef = useRef(open);

    // A Logistics page left open overnight must not keep yesterday's sale date.
    // Only the closed-to-open transition refreshes it, so an in-progress date stays put.
    useEffect(() => {
        if (open && !wasOpenRef.current) setDate(toLocalIsoDate(Date.now()));
        wasOpenRef.current = open;
    }, [open]);

    // All-season total: bin contents are physical and carry across seasons, so a
    // sale warnings use the true bin contents, not just this season's
    // movements. (The sale itself is still recorded under viewingSeason below.)
    const currentInventory = getBinTotal(bin.id);
    const parsedBushels = parseLocalizedNumber(bushels, preferences.locale);
    const projectedTotal = parsedBushels == null ? null : currentInventory - parsedBushels;
    const inventoryWarning =
        projectedTotal == null || parsedBushels == null || !(parsedBushels > 0)
            ? null
            : projectedTotal < 0
                ? 'This sale would leave negative bin inventory.'
                : projectedTotal > bin.capacity
                    ? 'This change would exceed bin capacity.'
                    : null;

    const handleSubmit = async () => {
        const amount = parsedBushels;
        const parsedPrice = price.trim() === '' ? null : parseLocalizedNumber(price, preferences.locale);
        const parsedMoisture = moisture.trim() === '' ? null : parseLocalizedNumber(moisture, preferences.locale);
        // Explicit 0% moisture is a real reading; only a blank or unparsable value defaults to 15.
        const m = Number.isFinite(parsedMoisture) ? parsedMoisture as number : 15;
        if (amount == null || amount <= 0 || parsedPrice === null && price.trim() !== '') {
            native.haptic.error();
            return;
        }
        if (inventoryWarning) toast.warning(inventoryWarning);

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
                price: parsedPrice == null ? undefined : parsedPrice,
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
                            <Banknote size={24} />
                            <span>Sell Harvest — {bin.name}</span>
                        </div>
                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-lg bg-harvest/10 text-harvest border border-harvest/20">
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
                        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Available Inventory</div>
                        <div className="text-xl font-bold text-foreground font-mono">{formatMeasurement(currentInventory, 'bu', 3, preferences.locale)}</div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <Label htmlFor="sellBushels" className="text-muted-foreground font-mono text-xs font-bold flex items-center gap-1.5">
                                <Hash size={12} /> BUSHELS SOLD *
                            </Label>
                            <Input
                                id="sellBushels"
                                name="sellBushels"
                                inputMode="decimal"
                                value={bushels}
                                onChange={e => setBushels(e.target.value)}
                                placeholder="e.g. 1000"
                                className="mt-1 bg-muted border-border font-mono focus:ring-harvest"
                                autoFocus
                            />
                            {inventoryWarning && (
                                <p className="text-xs text-destructive mt-1 font-mono font-bold" role="status">{inventoryWarning}</p>
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
                                        inputMode="decimal"
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
                            <Label htmlFor="sellMoisture" className="text-muted-foreground font-mono text-xs font-bold">MOISTURE %</Label>
                            <Input
                                id="sellMoisture"
                                name="sellMoisture"
                                inputMode="decimal"
                                value={moisture}
                                onChange={e => setMoisture(e.target.value)}
                                placeholder="15"
                                className="mt-1 bg-muted border-border font-mono"
                            />
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
                        disabled={isSaving || parsedBushels == null || parsedBushels <= 0}
                        className="w-full bg-harvest text-white hover:bg-harvest/90 glow-harvest font-bold py-6 text-lg"
                    >
                        {isSaving ? 'Selling...' : 'Confirm Sale'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
