import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { useFarm } from '@/store/farmStore';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, History as HistoryIcon, Upload, CheckCircle2, Loader2 } from 'lucide-react';
import {
  clearRolloverDismiss,
  dismissRolloverPrompt,
  isRolloverDismissed,
} from '@/utils/seasonRollover';

export default function SeasonRolloverModal() {
  const { session, activeSeason, rolloverToNewSeason, restoreFromBackup, loading } = useFarm();
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentYear = new Date().getFullYear();
  const userId = session?.user?.id ?? null;
  const busy = loading || restoring;

  const resetFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    const handleManualOpen = () => setOpen(true);
    window.addEventListener('open-rollover', handleManualOpen);
    return () => window.removeEventListener('open-rollover', handleManualOpen);
  }, []);

  useEffect(() => {
    if (activeSeason >= currentYear) return;
    if (isRolloverDismissed(userId, currentYear)) return;
    setOpen(true);
  }, [activeSeason, currentYear, userId]);

  const handleNotNow = () => {
    dismissRolloverPrompt(userId, currentYear);
    setOpen(false);
  };

  const handleRollover = async () => {
    const success = await rolloverToNewSeason(currentYear);
    if (success) {
      clearRolloverDismiss(userId, currentYear);
      setOpen(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingRestoreFile(file);
    setRestoreConfirmOpen(true);
  };

  const runRestore = async () => {
    if (!pendingRestoreFile) return;

    setRestoring(true);
    try {
      const text = await pendingRestoreFile.text();
      const data = JSON.parse(text);
      const success = await restoreFromBackup(data);
      if (success) {
        setRestoreSuccess(true);
        setTimeout(() => {
          setRestoreSuccess(false);
          setOpen(false);
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to restore:', err);
      if (err instanceof SyntaxError) {
        toast.error('Invalid backup file — could not parse JSON.');
      }
    } finally {
      setRestoring(false);
      setPendingRestoreFile(null);
      setRestoreConfirmOpen(false);
      resetFileInput();
    }
  };

  const handleRestoreCancel = () => {
    setRestoreConfirmOpen(false);
    setPendingRestoreFile(null);
    resetFileInput();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card border-amber-500/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle size={24} />
              Season rollover — {currentYear}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs pt-2">
              Start the new crop year when you are ready. A JSON snapshot downloads first so you can keep a safe copy of your records.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted p-3 rounded-lg border border-border/50">
              <div className="flex items-center justify-center gap-4 py-2">
                <div className="text-center">
                  <div className="text-[11px] text-muted-foreground font-mono">Current active season</div>
                  <div className="text-xl font-bold font-mono opacity-50">{activeSeason}</div>
                </div>
                <ArrowRight className="text-muted-foreground" size={20} />
                <div className="text-center">
                  <div className="text-[11px] text-amber-500 font-mono">New active season</div>
                  <div className="text-2xl font-bold font-mono text-amber-500">{currentYear}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold font-mono flex items-center gap-1.5 text-foreground/80">
                <HistoryIcon size={14} />
                What rollover does
              </h4>
              <ul className="text-xs space-y-2 text-muted-foreground font-mono list-disc pl-4">
                <li>
                  <span className="text-foreground">Snapshot download:</span> Saves a JSON backup of your farm before anything changes.
                </li>
                <li>
                  <span className="text-foreground">Active season update:</span> Sets your active season to {currentYear} in the cloud and on this device.
                </li>
                <li>
                  <span className="text-foreground">Prior-year records:</span> {activeSeason} activity stays in your database; use the season selector in the sidebar to view it.
                </li>
                <li>
                  <span className="text-foreground">New-year dashboard:</span> Lists and stats default to {currentYear} until you add records for this season. Nothing is deleted.
                </li>
              </ul>
            </div>

            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <h4 className="text-[11px] font-semibold font-mono text-muted-foreground">Restore from backup</h4>
                  <p className="text-[11px] font-mono text-muted-foreground/70">
                    Merges backup rows into your cloud farm, then reloads from the cloud.
                  </p>
                </div>
                <div className="relative shrink-0">
                  <input
                    ref={fileInputRef}
                    id="restoreFile"
                    name="restoreFile"
                    type="file"
                    accept=".json"
                    onChange={handleFileSelected}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={busy}
                    aria-label="Upload backup JSON file"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 min-h-[44px] text-[11px] font-mono gap-1.5 border-dashed"
                    disabled={busy}
                    type="button"
                  >
                    {restoring ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : restoreSuccess ? (
                      <CheckCircle2 size={12} className="text-green-500" />
                    ) : (
                      <Upload size={12} />
                    )}
                    {restoring ? 'Restoring…' : restoreSuccess ? 'Done' : 'Upload JSON'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={handleNotNow}
              className="text-xs font-mono min-h-[44px]"
              disabled={busy}
            >
              Not now
            </Button>
            <Button
              onClick={handleRollover}
              disabled={busy}
              className="bg-amber-500 text-amber-950 hover:bg-amber-600 font-bold min-w-[140px] min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Rolling over…
                </>
              ) : (
                `Start ${currentYear} season`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={restoreConfirmOpen} onOpenChange={(next) => { if (!next) handleRestoreCancel(); }}>
        <AlertDialogContent className="bg-card border-amber-500/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Restore backup?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
              {pendingRestoreFile ? (
                <>
                  <span className="text-foreground">{pendingRestoreFile.name}</span> will be merged into your cloud farm.
                  Matching IDs are updated; rows not in the file stay in the database.
                </>
              ) : (
                'Backup rows will be merged into your cloud farm.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="touch-target border-border text-muted-foreground min-h-[44px]"
              disabled={restoring}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runRestore();
              }}
              className="touch-target bg-amber-500 text-amber-950 hover:bg-amber-600 min-h-[44px]"
              disabled={restoring}
            >
              {restoring ? 'Restoring…' : 'Restore backup'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
