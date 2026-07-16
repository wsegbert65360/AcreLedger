import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Download, Clock, AlertCircle, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { exportDataAsJson } from '@/utils/backup';
import { openSeasonRolloverModal } from '@/utils/seasonRollover';
import { CURRENT_BACKUP_VERSION } from '@/lib/backupCompatibility';
import { backupSchema } from '@/lib/backupSchema';

const LAST_BACKUP_KEY = 'acreledger_last_backup';

function loadLastBackup(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    return raw ? new Date(raw) : null;
  } catch { return null; }
}

function saveLastBackup(): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch { /* ignore */ }
}

function formatLastBackup(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

export default function BackupManager() {
  const {
    fields,
    bins,
    plantRecords,
    sprayRecords,
    harvestRecords,
    hayHarvestRecords,
    customSprayRecords,
    fertilizerApplications,
    tillageRecords,
    grainMovements,
    savedSeeds,
    fertilizerRecipes,
    sprayRecipes,
    fsaTracts,
    cluAssignments,
    activeSeason,
  } = useFarm();
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(loadLastBackup);

  const recordCount =
    (fields?.length ?? 0) +
    (bins?.length ?? 0) +
    (plantRecords?.length ?? 0) +
    (sprayRecords?.length ?? 0) +
    (harvestRecords?.length ?? 0) +
    (hayHarvestRecords?.length ?? 0) +
    (customSprayRecords?.length ?? 0) +
    (fertilizerApplications?.length ?? 0) +
    (tillageRecords?.length ?? 0) +
    (grainMovements?.length ?? 0) +
    (savedSeeds?.length ?? 0) +
    (fertilizerRecipes?.length ?? 0) +
    (sprayRecipes?.length ?? 0) +
    (fsaTracts?.length ?? 0) +
    (cluAssignments?.length ?? 0);

  const hasData = recordCount > 0;
  const backupIsStale = lastBackup
    ? Date.now() - lastBackup.getTime() > 7 * 86_400_000
    : false;

  const handleBackup = async () => {
    if (!hasData) {
      toast.warning('Nothing to back up yet — add some records first.');
      return;
    }

    setBackingUp(true);
    try {
      const backupData = {
        backupVersion: CURRENT_BACKUP_VERSION,
        fields,
        bins,
        plantRecords,
        sprayRecords,
        harvestRecords,
        hayHarvestRecords,
        customSprayRecords,
        fertilizerApplications,
        tillageRecords,
        grainMovements,
        savedSeeds,
        fertilizerRecipes,
        sprayRecipes,
        fsaTracts,
        cluAssignments,
        activeSeason,
        backupDate: new Date().toISOString(),
      };
      const filename = `acreledger-backup-${new Date().toISOString().split('T')[0]}.json`;

      const validatedBackup = backupSchema.parse(backupData);
      const success = await exportDataAsJson(validatedBackup, filename);

      if (!success) {
        throw new Error('Export returned unsuccessful');
      }

      const now = new Date();
      saveLastBackup();
      setLastBackup(now);
      toast.success('Backup downloaded successfully.');
    } catch (error) {
      // Surface to error monitoring in production (e.g. Sentry.captureException(error))
      console.error('Backup error:', error);
      toast.error('Failed to create backup — please try again.');
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          <Database size={18} className="text-primary" />
          Backup Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground font-mono">
          Download a JSON backup of all your farm records. Keep a copy somewhere safe.
        </p>

        {/* Record summary */}
        {hasData ? (
          <div className="rounded-lg bg-muted border border-border px-3 py-2 font-mono text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Fields</span><span className="text-foreground">{fields?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Bins</span><span className="text-foreground">{bins?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Plant Records</span><span className="text-foreground">{plantRecords?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Spray Records</span><span className="text-foreground">{sprayRecords?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Harvest Records</span><span className="text-foreground">{harvestRecords?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Hay Records</span><span className="text-foreground">{hayHarvestRecords?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Fertilizer Applications</span><span className="text-foreground">{fertilizerApplications?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Grain Movements</span><span className="text-foreground">{grainMovements?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Saved Seeds</span><span className="text-foreground">{savedSeeds?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Spray Recipes</span><span className="text-foreground">{sprayRecipes?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Fertilizer Recipes</span><span className="text-foreground">{fertilizerRecipes?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Tillage Records</span><span className="text-foreground">{tillageRecords?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>FSA Tracts</span><span className="text-foreground">{fsaTracts?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>CLU Assignments</span><span className="text-foreground">{cluAssignments?.length ?? 0}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-border font-bold">
              <span>Total Records</span><span className="text-foreground">{recordCount}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-muted border border-border px-3 py-2 font-mono text-xs text-muted-foreground text-center">
            No records yet — nothing to back up.
          </div>
        )}

        {/* Last backup + staleness warning */}
        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock size={12} />
            <span>Last backup: {lastBackup ? formatLastBackup(lastBackup) : 'Never'}</span>
          </div>
          {(backupIsStale || !lastBackup) && hasData && (
            <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
              <AlertCircle size={12} />
              <span>{!lastBackup ? 'No backup on file' : 'Backup overdue'}</span>
            </div>
          )}
        </div>

        <Button
          onClick={handleBackup}
          disabled={backingUp || !hasData}
          variant="outline"
          className="w-full"
        >
          {backingUp ? (
            'Preparing Download...'
          ) : (
            <>
              <Download size={16} className="mr-2" />
              Download Backup JSON
            </>
          )}
        </Button>

        <Button
          type="button"
          onClick={openSeasonRolloverModal}
          variant="outline"
          className="w-full min-h-[44px]"
        >
          <CalendarDays size={16} className="mr-2" />
          Season rollover and restore
        </Button>
      </CardContent>
    </Card>
  );
}
