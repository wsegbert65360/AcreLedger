import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useFarm } from '@/store/farmStore';
import { FertilizerApplication, Field } from '@/types/farm';
import { native } from '@/lib/native';
import { toast } from 'sonner';
import { Sprout, Calendar, MapPin, Gauge, Loader2, ClipboardList, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { getLatestForField } from '@/lib/utils';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';

interface FertilizerModalProps {
    field: Field;
    open: boolean;
    onClose: () => void;
    initialData?: FertilizerApplication;
    mode?: 'edit' | 'duplicate';
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function FertilizerModal({ field, open, onClose, initialData, mode = 'edit' }: FertilizerModalProps) {
    const isDuplicate = mode === 'duplicate' && !!initialData;
    const {
        addFertilizerApplication,
        updateFertilizerApplication,
        deleteFertilizerApplications,
        addFertilizerRecipe,
        deleteFertilizerRecipe,
        fertilizerRecipes,
        fertilizerApplications,
        cluAssignments,
        viewingSeason
    } = useFarm();
    const displayFieldAcres = getDisplayFieldAcres(field, cluAssignments);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [acres, setAcresState] = useState(initialData?.acres?.toString() || displayFieldAcres.toString() || '');
    const acresEditedRef = useRef(false);
    const setAcres = useCallback((value: string) => {
        acresEditedRef.current = true;
        setAcresState(value);
    }, []);
    const [formula, setFormula] = useState('');
    const [saveAsRecipe, setSaveAsRecipe] = useState(false);
    const [newRecipeName, setNewRecipeName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteAppConfirm, setShowDeleteAppConfirm] = useState(false);
    const [recipeToDelete, setRecipeToDelete] = useState<{ id: string; name: string } | null>(null);

    const suggestedFertilizer = useMemo(() => {
        if (initialData) return null;
        // Fertilizer product/formula intentionally prefills across seasons: a
        // field's fertilizer program carries year over year, unlike crop
        // rotation or a spray tank-mix. (Other activity modals scope to
        // viewingSeason; fertilizer is the deliberate exception.)
        return getLatestForField(fertilizerApplications, field.id, 'date');
    }, [field.id, initialData, fertilizerApplications]);

    useEffect(() => {
        if (!open) return;
        acresEditedRef.current = false;
        if (initialData) {
            setDate(isDuplicate ? new Date().toISOString().split('T')[0] : initialData.date);
            setAcresState(initialData.acres?.toString() || displayFieldAcres.toString() || '');
            setFormula(initialData.fertilizer_formula);
        } else {
            setDate(new Date().toISOString().split('T')[0]);
            setAcresState(displayFieldAcres.toString() || '');
            setFormula(suggestedFertilizer?.fertilizer_formula || '');
        }
        // Depend only on open/initialData primitives per AGENTS.md (do not depend on `field` object reference).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialData?.id, isDuplicate]);

    // CLU assignments can finish hydrating after a new-record modal opens. Refresh
    // the default only until the farmer edits it; existing and duplicated records
    // must preserve their explicitly stored applied acreage.
    useEffect(() => {
        if (!open || initialData || acresEditedRef.current) return;
        setAcresState(displayFieldAcres.toString() || '');
    }, [open, initialData, displayFieldAcres]);

    const handleSave = async (keepOpen = false) => {
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
            if (initialData && !isDuplicate) {
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
                if (keepOpen) {
                    setFormula('');
                    setNewRecipeName('');
                    setSaveAsRecipe(false);
                    toast.success('Record saved. Ready for next entry.');
                } else {
                    onClose();
                }
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleSave(false);
    };

    const handleDelete = () => {
        if (!initialData) return;
        setShowDeleteAppConfirm(true);
    };

    const confirmDeleteApp = async () => {
        if (!initialData) return;
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
            setShowDeleteAppConfirm(false);
        }
    };

    const handleDeleteRecipe = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        e.preventDefault();
        setRecipeToDelete({ id, name });
    };

    const confirmDeleteRecipe = async () => {
        if (!recipeToDelete) return;
        setIsDeleting(recipeToDelete.id);
        try {
            await deleteFertilizerRecipe(recipeToDelete.id);
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error('Failed to delete recipe');
        } finally {
            setIsDeleting(null);
            setRecipeToDelete(null);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="bg-card border-border max-w-sm p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between bg-muted/30 space-y-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-lime-500/10 flex items-center justify-center">
                            <Sprout className="text-lime-600 dark:text-lime-400" size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-lg font-bold text-foreground leading-tight">{isDuplicate ? 'Duplicate' : initialData ? 'Edit' : 'New'} Fertilizer</DialogTitle>
                                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-lime-600/10 text-lime-600 border border-lime-600/20">
                                    {initialData && !isDuplicate ? initialData.seasonYear : viewingSeason} Season
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
                    {suggestedFertilizer && !initialData && (
                        <div className="bg-lime-500/5 border border-lime-500/20 rounded-lg p-2.5 flex items-start gap-2 text-xs text-foreground animate-in fade-in duration-200">
                            <div className="flex-grow">
                                Prefilled from last entry on this field: <span className="font-bold">{suggestedFertilizer.fertilizer_formula}</span>.
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setFormula('');
                                }}
                                className="text-lime-600 dark:text-lime-400 hover:underline font-bold"
                            >
                                Clear
                            </button>
                        </div>
                    )}
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
                        {initialData && !isDuplicate && (
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
                        {(!initialData || isDuplicate) && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleSave(true)}
                                disabled={isSaving}
                                className="flex-1 h-16 text-lg font-bold border-primary/30 text-primary hover:bg-primary/5 rounded-xl transition-all touch-target"
                            >
                                Save & Another
                            </Button>
                        )}
                        <Button
                            type="submit"
                            disabled={isSaving}
                            className="flex-[2] h-16 text-lg font-bold bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all touch-target"
                        >
                            {isSaving ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="animate-spin" size={24} />
                                    <span>Saving...</span>
                                </div>
                            ) : (
                                isDuplicate ? 'Log Duplicate' : initialData ? 'Update' : 'Save Application'
                            )}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>

        <AlertDialog open={showDeleteAppConfirm} onOpenChange={setShowDeleteAppConfirm}>
            <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">Delete Application</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        Are you sure you want to delete this fertilizer application? This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirmDeleteApp}
                        className="touch-target bg-destructive text-destructive-foreground glow-destructive"
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!recipeToDelete} onOpenChange={(open) => { if (!open) setRecipeToDelete(null); }}>
            <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">Delete Recipe</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        Are you sure you want to delete recipe &ldquo;{recipeToDelete?.name}&rdquo;?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={confirmDeleteRecipe}
                        className="touch-target bg-destructive text-destructive-foreground glow-destructive"
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
    );
}
