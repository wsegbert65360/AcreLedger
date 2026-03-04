import React, { useState, useEffect } from 'react';
import { useFarm } from '@/store/farmStore';
import { FertilizerApplication, Field } from '@/types/farm';
import { Sprout, X, Calendar, MapPin, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface FertilizerModalProps {
    field: Field;
    open: boolean;
    onClose: () => void;
    initialData?: FertilizerApplication;
}

export default function FertilizerModal({ field, open, onClose, initialData }: FertilizerModalProps) {
    const { addFertilizerApplication, updateFertilizerApplication } = useFarm();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [acres, setAcres] = useState(field.acreage.toString());
    const [formula, setFormula] = useState('');

    useEffect(() => {
        if (initialData) {
            setDate(initialData.date);
            setAcres(initialData.acres.toString());
            setFormula(initialData.fertilizer_formula);
        } else {
            setDate(new Date().toISOString().split('T')[0]);
            setAcres(field.acreage.toString());
            setFormula('');
        }
    }, [initialData, field, open]);

    if (!open) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const data = {
            fieldId: field.id,
            date,
            acres: parseFloat(acres),
            fertilizer_formula: formula,
            farm_id: field.farm_id || '',
        };

        if (isNaN(data.acres) || data.acres <= 0) {
            toast.error('Please enter a valid acreage');
            return;
        }

        if (!formula.trim()) {
            toast.error('Please enter a fertilizer formula');
            return;
        }

        if (initialData) {
            updateFertilizerApplication({ ...initialData, ...data });
        } else {
            addFertilizerApplication(data);
        }

        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-lime-500/10 flex items-center justify-center">
                            <Sprout className="text-lime-600 dark:text-lime-400" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground leading-tight">Fertilizer</h2>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{field.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors touch-target">
                        <X size={20} className="text-muted-foreground" />
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="space-y-4">
                        {/* Date Field */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <Calendar size={12} />
                                Application Date
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full h-16 px-4 bg-muted/50 border border-border rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                required
                            />
                        </div>

                        {/* Acres Field */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <Gauge size={12} />
                                Acres Applied
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={acres}
                                    onChange={(e) => setAcres(e.target.value)}
                                    className="w-full h-16 px-4 bg-muted/50 border border-border rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all pr-12"
                                    placeholder="0.00"
                                    required
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">AC</span>
                            </div>
                        </div>

                        {/* Formula Field */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <MapPin size={12} />
                                Fertilizer Formula
                            </label>
                            <input
                                type="text"
                                value={formula}
                                onChange={(e) => setFormula(e.target.value)}
                                className="w-full h-16 px-4 bg-muted/50 border border-border rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                placeholder="e.g. 28-0-0, Urea, etc."
                                required
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button
                            type="submit"
                            className="w-full h-16 text-lg font-bold bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all touch-target"
                        >
                            {initialData ? 'Update Application' : 'Save Application'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
