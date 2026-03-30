import { useState, useEffect } from 'react';
import { useFarm } from '@/store/farmStore';
import { TillageRecord, Field } from '@/types/farm';
import { Tractor, Calendar, PenTool, Loader2, Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface TillageModalProps {
    field: Field;
    open: boolean;
    onClose: () => void;
    initialData?: TillageRecord;
}

export default function TillageModal({ field, open, onClose, initialData }: TillageModalProps) {
    const { addTillageRecord, updateTillageRecord, deleteTillageRecords } = useFarm();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [implementType, setImplementType] = useState('Disk');
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (initialData) {
            setDate(initialData.date);
            setImplementType(initialData.implementType);
            setNotes(initialData.notes || '');
        } else {
            setDate(new Date().toISOString().split('T')[0]);
            setImplementType('Disk');
            setNotes('');
        }
    }, [initialData, field, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const data = {
            fieldId: field.id,
            fieldName: field.name,
            date,
            implementType: implementType,
            notes: notes.trim(),
        };

        setIsSaving(true);
        try {
            let success = false;
            if (initialData) {
                success = await updateTillageRecord({
                    id: initialData.id,
                    fieldId: data.fieldId,
                    fieldName: data.fieldName,
                    date: data.date,
                    implementType: data.implementType,
                    notes: data.notes,
                    seasonYear: initialData.seasonYear,
                    timestamp: initialData.timestamp,
                    deleted_at: initialData.deleted_at,
                    farm_id: initialData.farm_id
                });
            } else {
                success = await addTillageRecord(data);
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

    const handleDelete = async () => {
        if (!initialData) return;
        if (window.confirm('Are you sure you want to delete this tillage record?')) {
            setIsSaving(true);
            try {
                const success = await deleteTillageRecords([initialData.id]);
                if (success) {
                    onClose();
                }
            } catch (err) {
                console.error('Delete error:', err);
                toast.error('Failed to delete record.');
            } finally {
                setIsSaving(false);
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="bg-card border-border max-w-sm p-0 overflow-hidden">
                <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                            <Tractor className="text-orange-600 dark:text-orange-400" size={20} />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-foreground leading-tight">Tillage</DialogTitle>
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{field.name}</p>
                        </div>
                    </div>
                </header>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="space-y-4">
                        {/* Date Field */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <Calendar size={12} />
                                Date
                            </label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full h-14 px-4 bg-muted/50 border border-border rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                required
                            />
                        </div>

                        {/* Implement Type Field */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <PenTool size={12} />
                                Implement
                            </label>
                            <Select value={implementType} onValueChange={setImplementType}>
                                <SelectTrigger className="w-full h-14 bg-muted/50 border border-border rounded-xl text-lg font-medium focus:ring-2 focus:ring-primary/20 transition-all">
                                    <SelectValue placeholder="Select implement..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Disk">Disk</SelectItem>
                                    <SelectItem value="Field Cultivate">Field Cultivate</SelectItem>
                                    <SelectItem value="Vertical Tillage">Vertical Tillage</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Notes Field */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <Info size={12} />
                                Notes
                            </label>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full min-h-[100px] px-4 py-3 bg-muted/50 border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                                placeholder="Conditions, depth, etc..."
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                        {initialData && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleDelete}
                                disabled={isSaving}
                                className="flex-1 h-16 text-lg font-bold border-destructive/30 text-destructive hover:bg-destructive/5 rounded-xl transition-all touch-target"
                            >
                                <Trash2 size={24} className="mr-2" />
                                Delete
                            </Button>
                        )}
                        <Button
                            type="submit"
                            disabled={isSaving}
                            className={`${initialData ? 'flex-[2]' : 'w-full'} h-16 text-lg font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all touch-target`}
                        >
                            {isSaving ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="animate-spin" size={24} />
                                    <span>Saving...</span>
                                </div>
                            ) : (
                                initialData ? 'Update' : 'Save Record'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
