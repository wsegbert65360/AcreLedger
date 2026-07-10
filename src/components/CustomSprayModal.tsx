import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFarm } from '@/store/farmStore';
import { Field, CustomSprayRecord } from '@/types/farm';
import { native } from '@/lib/native';
import { toast } from 'sonner';
import { Cloud, User, Thermometer, Wind, FlaskConical, StickyNote, Loader2 } from 'lucide-react';
import { getLatestForField } from '@/lib/utils';
import { WeatherService } from '@/services/WeatherService';

interface CustomSprayModalProps {
    field: Field;
    open: boolean;
    onClose: () => void;
    initialData?: CustomSprayRecord;
    mode?: 'edit' | 'duplicate';
}

export default function CustomSprayModal({ field, open, onClose, initialData, mode = 'edit' }: CustomSprayModalProps) {
    const isDuplicate = mode === 'duplicate' && !!initialData;
    const shouldAutoPullWeather = !initialData || isDuplicate;
    const { addCustomSprayRecord, updateCustomSprayRecord, customSprayRecords, viewingSeason } = useFarm();
    const [applicator, setApplicator] = useState(initialData?.applicator || '');
    const [recipe, setRecipe] = useState(initialData?.recipe || '');
    const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
    const [windSpeed, setWindSpeed] = useState(initialData?.windSpeed?.toString() || '');
    const [windDirection, setWindDirection] = useState(initialData?.windDirection || '');
    const [temperature, setTemperature] = useState(initialData?.temperature?.toString() || '');
    const [notes, setNotes] = useState(initialData?.notes || '');
    const [loadingWeather, setLoadingWeather] = useState(false);
    const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    const suggested = useMemo(() => {
        if (initialData) return null;
        return getLatestForField(customSprayRecords, field.id, 'date', record => record.seasonYear === viewingSeason);
    }, [field.id, initialData, customSprayRecords, viewingSeason]);

    useEffect(() => {
        if (!open) return;
        if (initialData) {
            setApplicator(initialData.applicator || '');
            setRecipe(isDuplicate ? '' : (initialData.recipe || ''));
            setDate(isDuplicate ? new Date().toISOString().split('T')[0] : (initialData.date || new Date().toISOString().split('T')[0]));
            setWindSpeed(isDuplicate ? '' : (initialData.windSpeed?.toString() || ''));
            setWindDirection(isDuplicate ? '' : (initialData.windDirection || ''));
            setTemperature(isDuplicate ? '' : (initialData.temperature?.toString() || ''));
            setNotes(isDuplicate ? '' : (initialData.notes || ''));
        } else {
            setApplicator(suggested?.applicator || '');
            setRecipe(suggested?.recipe || '');
            setDate(new Date().toISOString().split('T')[0]);
            setWindSpeed('');
            setWindDirection('');
            setTemperature('');
            setNotes('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialData?.id, isDuplicate]);

    useEffect(() => {
        if (!open || !shouldAutoPullWeather || field.lat == null || field.lng == null) {
            if (open) setLoadingWeather(false);
            return;
        }

        const controller = new AbortController();
        setLoadingWeather(true);

        WeatherService.fetchCurrentWeather(`${field.lat},${field.lng}`, controller.signal)
            .then(weather => {
                if (controller.signal.aborted || !weather || weather.isError) return;

                const resolvedWind = Number.isFinite(weather.wind) ? weather.wind : 0;
                const resolvedDirection = weather.windDirection && weather.windDirection !== '—'
                    ? weather.windDirection
                    : resolvedWind === 0 ? 'CALM' : '';

                setWindSpeed(current => current || String(resolvedWind));
                setWindDirection(current => current || resolvedDirection);
                setTemperature(current => current || (Number.isFinite(weather.temp) ? String(weather.temp) : ''));
            })
            .catch(() => {
                // Manual weather entry remains available when the automatic pull fails.
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingWeather(false);
            });

        return () => controller.abort();
    }, [open, shouldAutoPullWeather, initialData?.id, field.lat, field.lng, weatherRefreshKey]);

    const isValid = applicator.trim() !== '' && date !== '';

    const handleSubmit = async (keepOpen = false) => {
        if (!isValid) {
            native.haptic.error();
            return;
        }

        const payload = {
            fieldId: field.id,
            fieldName: field.name,
            date,
            applicator: applicator.trim(),
            recipe: recipe.trim() || undefined,
            windSpeed: windSpeed !== '' ? Number(windSpeed) : undefined,
            windDirection: windDirection.trim() || undefined,
            temperature: temperature !== '' ? Number(temperature) : undefined,
            notes: notes.trim() || undefined,
        };

        setIsSaving(true);
        try {
            let success = false;
            if (initialData && !isDuplicate) {
                success = await updateCustomSprayRecord({ ...initialData, ...payload });
            } else {
                success = await addCustomSprayRecord(payload);
            }

            if (success) {
                native.haptic.success();
                if (keepOpen) {
                    setApplicator('');
                    setRecipe('');
                    setWindSpeed('');
                    setWindDirection('');
                    setTemperature('');
                    setNotes('');
                    setWeatherRefreshKey(current => current + 1);
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

    return (
        <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="bg-card border-spray/30 max-w-sm max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center flex-wrap gap-2 text-spray font-bold uppercase tracking-tight">
                        <div className="flex items-center gap-2">
                            <Cloud size={20} />
                            <span>{isDuplicate ? 'Duplicate' : initialData ? 'Edit' : 'Record'} Custom Spray — {field.name}</span>
                        </div>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-spray/10 text-spray border border-spray/20 normal-case tracking-normal">
                            {initialData && !isDuplicate ? initialData.seasonYear : viewingSeason} Season
                        </span>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Log a spray application performed by an outside (custom) applicator.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {suggested && !initialData && (suggested.applicator || suggested.recipe) && (
                        <div className="bg-spray/5 border border-spray/20 rounded-lg p-2.5 flex items-start gap-2 text-xs text-foreground animate-in fade-in duration-200">
                            <div className="flex-grow">
                                Prefilled from last custom spray on this field{!!suggested.applicator && <>: <span className="font-bold">{suggested.applicator}</span></>}.
                            </div>
                        </div>
                    )}

                    <div>
                        <Label htmlFor="csApplicator" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5 uppercase">
                            <User size={12} /> Who Sprayed *
                        </Label>
                        <Input
                            id="csApplicator"
                            name="csApplicator"
                            value={applicator}
                            onChange={e => setApplicator(e.target.value)}
                            placeholder="Company or applicator name"
                            className="mt-1 bg-muted border-border font-mono text-foreground"
                            autoFocus
                        />
                    </div>

                    <div>
                        <Label htmlFor="csDate" className="text-muted-foreground font-mono text-[11px] uppercase">Application Date</Label>
                        <Input
                            id="csDate"
                            name="csDate"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="mt-1 bg-muted border-border text-foreground font-mono"
                        />
                    </div>

                    <div>
                        <Label htmlFor="csRecipe" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5 uppercase">
                            <FlaskConical size={12} /> Recipe / Mix
                        </Label>
                        <textarea
                            id="csRecipe"
                            name="csRecipe"
                            value={recipe}
                            onChange={e => setRecipe(e.target.value)}
                            placeholder="e.g. Roundup 32oz/ac + AMS 1qt"
                            rows={2}
                            className="mt-1 w-full bg-muted border border-border rounded-md text-foreground text-sm p-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div className="border-t border-border/20 pt-3" aria-busy={loadingWeather}>
                        <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-muted-foreground">Weather</span>
                            {loadingWeather && (
                                <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Loader2 size={13} className="animate-spin" />
                                    Pulling weather
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <Label htmlFor="csWind" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1 uppercase">
                                    <Wind size={11} /> Wind
                                </Label>
                                <Input
                                    id="csWind"
                                    name="csWind"
                                    type="number"
                                    value={windSpeed}
                                    onChange={e => setWindSpeed(e.target.value)}
                                    placeholder={loadingWeather ? '...' : 'mph'}
                                    className="mt-1 bg-muted border-border font-mono text-foreground"
                                />
                            </div>
                            <div>
                                <Label htmlFor="csWindDir" className="text-muted-foreground font-mono text-[11px] uppercase">Dir</Label>
                                <Input
                                    id="csWindDir"
                                    name="csWindDir"
                                    value={windDirection}
                                    onChange={e => setWindDirection(e.target.value)}
                                    placeholder={loadingWeather ? '...' : 'NW'}
                                    className="mt-1 bg-muted border-border font-mono text-foreground"
                                />
                            </div>
                            <div>
                                <Label htmlFor="csTemp" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1 uppercase">
                                    <Thermometer size={11} /> °F
                                </Label>
                                <Input
                                    id="csTemp"
                                    name="csTemp"
                                    type="number"
                                    value={temperature}
                                    onChange={e => setTemperature(e.target.value)}
                                    placeholder={loadingWeather ? '...' : '72'}
                                    className="mt-1 bg-muted border-border font-mono text-foreground"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="csNotes" className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5 uppercase">
                            <StickyNote size={12} /> Notes
                        </Label>
                        <textarea
                            id="csNotes"
                            name="csNotes"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="e.g. See invoice from vendor"
                            rows={2}
                            className="mt-1 w-full bg-muted border border-border rounded-md text-foreground text-sm p-2 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </div>

                <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-2">
                    {(!initialData || isDuplicate) && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleSubmit(true)}
                            disabled={!isValid || isSaving}
                            className="touch-target flex-grow sm:flex-initial border-spray/30 text-spray hover:bg-spray/10 font-bold h-11 text-xs"
                        >
                            Save & Log Another
                        </Button>
                    )}
                    <Button
                        onClick={() => handleSubmit(false)}
                        disabled={!isValid || isSaving}
                        className="touch-target flex-grow sm:flex-initial bg-spray text-white hover:bg-spray/90 glow-spray font-bold h-11 text-xs"
                    >
                        {isSaving ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="animate-spin" size={16} />
                                <span>Saving...</span>
                            </div>
                        ) : (
                            isDuplicate ? 'Log Duplicate' : initialData ? 'Update Record' : 'Record Custom Spray'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
