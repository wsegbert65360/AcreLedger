import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <>
      {/* Spacer pushes page content down so sticky headers aren't hidden */}
      <div className="h-9 lg:pl-60 flex-shrink-0" />
      {/* Banner itself — no fixed/sticky, just flows inline at the top */}
      <div className="bg-amber-500 text-amber-950 flex items-center justify-center gap-2 py-2 px-4 text-xs font-bold">
        <WifiOff size={14} />
        <span>You are offline — changes will sync when reconnected</span>
      </div>
    </>
  );
}
