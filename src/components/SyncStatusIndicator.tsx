import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useFarm } from '@/store/farmStore';

export default function SyncStatusIndicator() {
  const { isOnline, pendingSyncCount } = useFarm();

  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-bold border border-amber-500/20"
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
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-spray/10 text-spray text-[11px] font-bold border border-spray/20"
        aria-label={`Syncing ${pendingSyncCount} record${pendingSyncCount !== 1 ? 's' : ''}`}
      >
        <RefreshCw size={12} className="animate-spin" />
        <span>{pendingSyncCount}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-plant/10 text-plant text-[11px] font-bold border border-plant/20"
      aria-label="All changes synced"
    >
      <Cloud size={14} />
    </div>
  );
}
