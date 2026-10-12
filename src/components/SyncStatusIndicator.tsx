import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useFarm } from '@/store/farmStore';

export default function SyncStatusIndicator() {
  const { isOnline, pendingSyncCount, failedSyncCount = 0, syncQueueLocked } = useFarm();

  if (syncQueueLocked || failedSyncCount > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20"
        aria-label={syncQueueLocked ? 'Offline changes locked — sync status unknown' : `${failedSyncCount} changes need attention`}>
        <CloudOff size={14} />
        <span>{syncQueueLocked ? '?' : failedSyncCount}</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20"
        aria-label={`Offline — ${pendingSyncCount} record${pendingSyncCount !== 1 ? 's' : ''} pending sync`}
      >
        <CloudOff size={14} />
        {pendingSyncCount > 0 && <span>{pendingSyncCount}</span>}
      </div>
    );
  }

  if (pendingSyncCount > 0) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-spray/10 text-spray text-xs font-bold border border-spray/20"
        aria-label={`${pendingSyncCount} record${pendingSyncCount !== 1 ? 's' : ''} pending sync`}
      >
        <RefreshCw size={12} />
        <span>{pendingSyncCount}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-plant/10 text-plant text-xs font-bold border border-plant/20"
      aria-label="All changes synced"
    >
      <Cloud size={14} />
    </div>
  );
}
