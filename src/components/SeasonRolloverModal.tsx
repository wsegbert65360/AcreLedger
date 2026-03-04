import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useFarm } from '@/store/farmStore';
import { AlertTriangle, Database, ArrowRight, History, Upload, CheckCircle2, Loader2 } from 'lucide-react';

export default function SeasonRolloverModal() {
    const { activeSeason, rolloverToNewSeason, restoreFromBackup } = useFarm();
    const [open, setOpen] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [restoreSuccess, setRestoreSuccess] = useState(false);
    const currentYear = new Date().getFullYear();

    useEffect(() => {
        // Trigger if we are in a new year but haven't rolled over yet
        if (activeSeason < currentYear) {
            setOpen(true);
        }

        // Listen for manual trigger from Index.tsx
        const handleManualOpen = () => setOpen(true);
        window.addEventListener('open-rollover', handleManualOpen);
        return () => window.removeEventListener('open-rollover', handleManualOpen);
    }, [activeSeason, currentYear, setOpen]);

    const handleRollover = () => {
        rolloverToNewSeason(currentYear);
        setOpen(false);
    };

    const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setRestoring(true);
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await restoreFromBackup(data);
            setRestoreSuccess(true);
            setTimeout(() => {
                setRestoreSuccess(false);
                setOpen(false);
            }, 2000);
        } catch (err) {
            console.error('Failed to restore:', err);
            alert('Invalid backup file format.');
        } finally {
            setRestoring(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md bg-card border-amber-500/30">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-500">
                        <AlertTriangle size={24} />
                        Season Rollover — {currentYear}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-xs pt-2">
                        A new calendar year has begun. Missouri regulatory standards recommend archiving previous records and resetting active dashboards to ensure data integrity.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="bg-muted p-3 rounded-lg border border-border/50">
                        <div className="flex items-center justify-center gap-4 py-2">
                            <div className="text-center">
                                <div className="text-[10px] text-muted-foreground uppercase font-mono">Current</div>
                                <div className="text-xl font-bold font-mono opacity-50">{activeSeason}</div>
                            </div>
                            <ArrowRight className="text-muted-foreground" size={20} />
                            <div className="text-center">
                                <div className="text-[10px] text-amber-500 uppercase font-mono">New Season</div>
                                <div className="text-2xl font-bold font-mono text-amber-500">{currentYear}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase font-mono flex items-center gap-1.5 text-foreground/80">
                            <History size={14} />
                            The Rollover Process
                        </h4>
                        <ul className="text-xs space-y-2 text-muted-foreground font-mono list-disc pl-4">
                            <li><span className="text-foreground">Snapshot Archive:</span> An automated backup will be downloaded now.</li>
                            <li><span className="text-foreground">Archive Storage:</span> {activeSeason} data is saved under "Historical Seasons".</li>
                            <li><span className="text-foreground">Data Carry-over:</span> Fields, Bin names, and Spray Recipes persist.</li>
                            <li><span className="text-foreground">Initialization:</span> Active dashboard is cleared for {currentYear}.</li>
                        </ul>
                    </div>

                    <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h4 className="text-[10px] font-bold uppercase font-mono text-muted-foreground">Restore from Backup</h4>
                                <p className="text-[9px] font-mono text-muted-foreground/70 italic">Have a previous JSON backup? Upload it here.</p>
                            </div>
                            <div className="relative">
                                <input
                                    id="restoreFile"
                                    name="restoreFile"
                                    type="file"
                                    accept=".json"
                                    onChange={handleRestore}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    disabled={restoring}
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] font-mono gap-1.5 border-dashed"
                                    disabled={restoring}
                                >
                                    {restoring ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : restoreSuccess ? (
                                        <CheckCircle2 size={12} className="text-green-500" />
                                    ) : (
                                        <Upload size={12} />
                                    )}
                                    {restoring ? 'RESTORING...' : restoreSuccess ? 'DONE' : 'UPLOAD JSON'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        className="text-xs font-mono"
                    >
                        NOT NOW
                    </Button>
                    <Button
                        onClick={handleRollover}
                        className="bg-amber-500 text-amber-950 hover:bg-amber-600 font-bold"
                    >
                        START {currentYear} SEASON
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
