import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFarm } from '@/store/farmStore';
import { GrainMovement } from '@/types/farm';
import { Warehouse, ArrowUpRight, ArrowDownLeft, Calendar, User, Tag } from 'lucide-react';

interface GrainMovementModalProps {
    open: boolean;
    onClose: () => void;
    initialData: GrainMovement;
}

export default function GrainMovementModal({ open, onClose, initialData }: GrainMovementModalProps) {
    const { updateGrainMovement, bins } = useFarm();
    const [binId, setBinId] = useState(initialData.binId);
    const [bushels, setBushels] = useState(initialData.bushels.toString());
    const [moisture, setMoisture] = useState(initialData.moisturePercent.toString());
    const [price, setPrice] = useState(initialData.price?.toString() || '');
    const [destination, setDestination] = useState(initialData.destination || '');
    const [sourceField, setSourceField] = useState(initialData.sourceFieldName || '');

    const handleSubmit = () => {
        const bu = parseFloat(bushels);
        const m = parseFloat(moisture);
        const p = price ? parseFloat(price) : undefined;

        if (isNaN(bu) || isNaN(m)) return;

        const bin = bins.find(b => b.id === binId);

        updateGrainMovement({
            ...initialData,
            binId,
            binName: bin?.name || initialData.binName,
            bushels: bu,
            moisturePercent: m,
            price: p,
            destination: destination || undefined,
            sourceFieldName: sourceField || undefined,
        });

        onClose();
    };

    const isValid = bushels && moisture && binId;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-card border-harvest/30 max-w-sm max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-harvest font-bold">
                        <Warehouse size={20} />
                        Edit Grain Movement
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Type Indicator */}
                    <div className={`p-3 rounded-lg border flex items-center justify-between ${initialData.type === 'in' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400'
                        }`}>
                        <div className="flex items-center gap-2">
                            {initialData.type === 'in' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                            <span className="font-mono text-sm font-bold uppercase">{initialData.type === 'in' ? 'Inventory In' : 'Sale / Out'}</span>
                        </div>
                        <span className="text-[10px] font-mono opacity-70 italic">ID: {initialData.id.slice(0, 8)}</span>
                    </div>

                    <div>
                        <Label className="text-muted-foreground font-mono text-xs font-bold">STORAGE BIN *</Label>
                        <Select value={binId} onValueChange={setBinId}>
                            <SelectTrigger className="mt-1 bg-muted border-border font-mono text-xs">
                                <SelectValue placeholder="Choose bin..." />
                            </SelectTrigger>
                            <SelectContent>
                                {bins.map(b => (
                                    <SelectItem key={b.id} value={b.id} className="font-mono text-xs">{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="bushels" className="text-muted-foreground font-mono text-xs font-bold">BUSHELS *</Label>
                            <Input
                                id="bushels"
                                type="number"
                                value={bushels}
                                onChange={e => setBushels(e.target.value)}
                                className="mt-1 bg-muted border-border font-mono text-sm"
                            />
                        </div>
                        <div>
                            <Label htmlFor="moisture" className="text-muted-foreground font-mono text-xs font-bold">MOISTURE % *</Label>
                            <Input
                                id="moisture"
                                type="number"
                                step="0.1"
                                value={moisture}
                                onChange={e => setMoisture(e.target.value)}
                                className="mt-1 bg-muted border-border font-mono text-sm"
                            />
                        </div>
                    </div>

                    {initialData.type === 'in' ? (
                        <div>
                            <Label htmlFor="sourceField" className="text-muted-foreground font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">SOURCE FIELD</Label>
                            <Input
                                id="sourceField"
                                value={sourceField}
                                onChange={e => setSourceField(e.target.value)}
                                placeholder="e.g. Home Place"
                                className="mt-1 bg-muted border-border font-mono text-sm"
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="destination" className="text-muted-foreground font-mono text-xs font-bold text-orange-600 dark:text-orange-400">DESTINATION / BUYER</Label>
                                <Input
                                    id="destination"
                                    value={destination}
                                    onChange={e => setDestination(e.target.value)}
                                    placeholder="e.g. ADM, Cargill"
                                    className="mt-1 bg-muted border-border font-mono text-sm"
                                />
                            </div>
                            <div>
                                <Label htmlFor="price" className="text-muted-foreground font-mono text-xs font-bold text-orange-600 dark:text-orange-400">PRICE PER BUSHEL ($)</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    placeholder="0.00"
                                    className="mt-1 bg-muted border-border font-mono text-sm"
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar size={14} />
                            <span className="text-[10px] font-mono uppercase">Recorded: {new Date(initialData.timestamp).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <DialogFooter className="pt-2">
                    <Button
                        onClick={handleSubmit}
                        disabled={!isValid}
                        className="w-full bg-harvest text-white hover:bg-harvest/90 font-bold glow-harvest"
                    >
                        Update Movement Record
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
