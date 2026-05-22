import { useState, useEffect } from 'react';
import { useFarm } from '@/store/farmStore';
import { FertilizerApplication, Field } from '@/types/farm';
import { native } from '@/lib/native';
import { Sprout, Calendar, MapPin, Gauge, Loader2, ClipboardList, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface FertilizerModalProps {
    field: Field;
    open: boolean;
    onClose: () => void;
    initialData?: FertilizerApplication;
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function FertilizerModal({ field, open, onClose, initialData }: FertilizerModalProps) {
    const { 
        addFertilizerApplication, 
        updateFertilizerApplication, 
        deleteFertilizerApplications,
        addFertilizerRecipe,
        deleteFertilizerRecipe,
        fertilizerRecipes,
        viewingSeason
    } = useFarm();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [acres, setAcres] = useState(field.acreage.toString());
    const [formula, setFormula] = useState('');
    const [saveAsRecipe, setSaveAsRecipe] = useState(false);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const data = {
            fieldId: field.id,
            date,
            acres: parseFloat(acres),
            fertilizer_formula: formula,
        };

        if (isNaN(data.acres) || data.acres <= 0) {
            toast.error('Please enter a valid acreage');
            native.haptic.error();
            return;
        }

        if (!formula.trim()) {
            toast.error('Please enter a fertilizer formula');
            native.haptic.error();
            return;
        }

        setIsSaving(true);
        try {
            let success = false;
            if (initialData) {
                success = await updateFertilizerApplication({ ...initialData, ...data });
            } else {
                success = await addFertilizerApplication(data);

                if (success && saveAsRecipe) {
                    if (!newRecipeName.trim()) {
                        toast.error('Please enter a recipe name to save');
                        setIsSaving(false);
                        native.haptic.error();
                        return;
                    }
                    try {
                        await addFertilizerRecipe({
                            name: newRecipeName.trim(),
                            npkRatio: formula.trim(),
                            deleted_at: null
                        });
                    } catch (recipeErr) {
                        console.error('Recipe save failed:', recipeErr);
                        toast.error('Application saved, but recipe failed to save.');
                    }
                }
            }

            if (success) {
                native.haptic.success();
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

    const handleDelete = async () => {
        if (!initialData) return;
        if (window.confirm('Are you sure you want to delete this fertilizer application?')) {
            setIsSaving(true);
            try {
                const success = await deleteFertilizerApplications([initialData.id]);
                if (success) {
                    onClose();
                }
            } catch (err) {
                console.error('Delete error:', err);
                toast.error('Failed to delete application.');
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleDeleteRecipe = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (window.confirm(`Delete recipe "${name}"?`)) {
            setIsDeleting(id);
            try {
                await deleteFertilizerRecipe(id);
            } catch (err) {
                console.error('Delete failed:', err);
                toast.error('Failed to delete recipe');
            } finally {
                setIsDeleting(null);
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="bg-card border-border max-w-sm p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between bg-muted/30 space-y-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-lime-500/10 flex items-center justify-center">
                            <Sprout className="text-lime-600 dark:text-lime-400" size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-lg font-bold text-foreground leading-tight">Fertilizer</DialogTitle>
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-lime-600/10 text-lime-600 dark:text-lime-400 border border-lime-600/20">
                                    {initialData ? initialData.seasonYear : viewingSeason} Season
                                </span>
                            </div>
                            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">{field.name}</p>
                        </div>
                    </div>
                    <DialogDescription className="sr-only">
                        Log a new fertilizer application or edit an existing one.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="space-y-4">
                        {/* Date Field */}
                        <div className="space-y-1.5">
                            <Label htmlFor="fertilizerDate" className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <Calendar size={12} />
                                Application Date
                            </Label>
                            <input
                                id="fertilizerDate"
                                name="fertilizerDate"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full h-16 px-4 bg-muted/50 border border-border rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                required
                            />
                        </div>

                        {/* Recipe Selection */}
                        {!initialData && fertilizerRecipes.length > 0 && (
                            <div className="space-y-1.5">
                                <Label htmlFor="recipeSelect" className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                    <ClipboardList size={12} />
                                    Use Recipe
                                </Label>
                                <Select onValueChange={(val) => {
                                    const recipe = fertilizerRecipes.find(r => r.id === val);
                                    if (recipe) setFormula(recipe.npkRatio);
                                }}>
                                    <SelectTrigger id="recipeSelect" className="w-full h-12 bg-muted/30 border-dashed border-border/60 rounded-xl focus:ring-1 focus:ring-primary/20">
                                        <SelectValue placeholder="Select a saved recipe..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fertilizerRecipes.map((recipe) => (
                                            <SelectItem 
                                                key={recipe.id} 
                                                value={recipe.id}
                                                className="group relative pr-10"
                                            >
                                                {recipe.name} ({recipe.npkRatio})
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-2 h-7 w-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10 hidden group-hover:flex transition-all z-10"
                                                    onClick={(e) => handleDeleteRecipe(e, recipe.id, recipe.name)}
                                                    disabled={isDeleting === recipe.id}
                                                >
                                                    {isDeleting === recipe.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Acres Field */}
                        <div className="space-y-1.5">
                            <Label htmlFor="acresApplied" className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <Gauge size={12} />
                                Acres Applied
                            </Label>
                            <div className="relative">
                                <input
                                    id="acresApplied"
                                    name="acresApplied"
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
                            <Label htmlFor="fertilizerFormula" className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase ml-1">
                                <MapPin size={12} />
                                Fertilizer Formula
                            </Label>
                            <input
                                id="fertilizerFormula"
                                name="fertilizerFormula"
                                type="text"
                                value={formula}
                                onChange={(e) => setFormula(e.target.value)}
                                className="w-full h-16 px-4 bg-muted/50 border border-border rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                placeholder="e.g. 28-0-0, Urea, etc."
                                required
                            />
                        </div>

                        {/* Save as Recipe */}
                        {!initialData && (
                            <div className="space-y-4 pt-2 border-t border-border/50">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="save-recipe" className="text-sm font-bold">Save as Recipe?</Label>
                                        <p className="text-[11px] text-muted-foreground uppercase font-mono tracking-wider">Add to your reusable templates</p>
                                    </div>
                                    <Switch
                                        id="save-recipe"
                                        checked={saveAsRecipe}
                                        onCheckedChange={setSaveAsRecipe}
                                    />
                                </div>

                                {saveAsRecipe && (
                                    <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                                        <Label htmlFor="recipe-name" className="text-[11px] font-mono font-bold text-muted-foreground uppercase ml-1">Recipe Name</Label>
                                        <Input
                                            id="recipe-name"
                                            value={newRecipeName}
                                            onChange={(e) => setNewRecipeName(e.target.value)}
                                            placeholder="e.g. Corn Pre-plant Mix"
                                            className="h-12 bg-muted/30 border-primary/20 focus:border-primary transition-all"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
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
                            className={`${initialData ? 'flex-[2]' : 'w-full'} h-16 text-lg font-bold bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all touch-target`}
                        >
                            {isSaving ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="animate-spin" size={24} />
                                    <span>Saving...</span>
                                </div>
                            ) : (
                                initialData ? 'Update' : 'Save Application'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
