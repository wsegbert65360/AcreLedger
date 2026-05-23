import { useState, useEffect, useRef } from 'react';

import { WifiOff, Loader2, CheckCircle2 } from 'lucide-react';

import { useFarm } from '@/store/farmStore';

export default function OfflineBanner() {
  const { isOnline, pendingSyncCount } = useFarm();
  const [showStatus, setShowStatus] = useState<'offline' | 'syncing' | 'synced' | 'hidden'>('hidden');
  const prevIsOnline = useRef(isOnline);
  const prevCount = useRef(pendingSyncCount);

  useEffect(() => {
    if (!isOnline) {
      setShowStatus('offline');
    } else {
      // We are online
      if (pendingSyncCount > 0) {
        setShowStatus('syncing');
      } else if (prevIsOnline.current === false || prevCount.current > 0) {
        // Just went online, or queue count dropped to 0 from >0
        setShowStatus('synced');
        const timer = setTimeout(() => {
          setShowStatus('hidden');
        }, 3000);
        return () => clearTimeout(timer);
      } else {
        setShowStatus('hidden');
      }
    }

    prevIsOnline.current = isOnline;
    prevCount.current = pendingSyncCount;
  }, [isOnline, pendingSyncCount]);

  if (showStatus === 'hidden') return null;

  let bgClass = 'bg-amber-500 text-amber-950';
  let icon = <WifiOff size={14} />;
  let text = '';

  if (showStatus === 'offline') {
    bgClass = 'bg-amber-500 text-amber-950';
    icon = <WifiOff size={14} />;
    text = pendingSyncCount > 0
      ? `Offline — ${pendingSyncCount} record${pendingSyncCount !== 1 ? 's' : ''} pending sync`
      : 'You are offline — changes will sync when reconnected';
  } else if (showStatus === 'syncing') {
    bgClass = 'bg-primary text-primary-foreground';
    icon = <Loader2 size={14} className="animate-spin" />;
    text = `Syncing changes (${pendingSyncCount} remaining)...`;
  } else if (showStatus === 'synced') {
    bgClass = 'bg-emerald-600 text-white';
    icon = <CheckCircle2 size={14} />;
    text = 'All synced ✓';
  }

  return (
    <>
      <div className="h-[calc(2.25rem+env(safe-area-inset-top,0px))] flex-shrink-0" />
      <div className={`fixed top-0 left-0 right-0 z-[100] ${bgClass} flex items-center justify-center gap-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] pb-2 px-4 text-xs font-bold lg:pl-60 transition-colors duration-300`}>
        {icon}
        <span>{text}</span>
      </div>
    </>
  );
}
