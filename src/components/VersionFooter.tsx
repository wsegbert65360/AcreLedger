import { useState } from 'react';
import { toast } from 'sonner';
import packageJson from '../../package.json';

export default function VersionFooter() {
  const version = packageJson.version;
  const [checking, setChecking] = useState(false);

  const handleUpdateCheck = async () => {
    if (!('serviceWorker' in navigator)) {
      toast.info('Updates are handled by your browser');
      return;
    }

    setChecking(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        
        // Brief delay to allow SW to potentially detect and install update
        setTimeout(() => {
          if (registration.waiting || registration.installing) {
            toast.success('Update found! Refreshing...');
            window.location.reload();
          } else {
            toast.info('AcreLedger is up to date');
          }
          setChecking(false);
        }, 1000);
      } else {
        toast.info('AcreLedger is up to date');
        setChecking(false);
      }
    } catch (error) {
      console.error('Update check failed:', error);
      // Fail silently or with a non-disturbing message if offline
      toast.error('Could not check for updates. Please try again later.');
      setChecking(false);
    }
  };
  
  return (
    <div className="w-full py-12 flex flex-col items-center justify-center space-y-6">
      <div className="flex flex-col items-center space-y-1">
        <p className="text-[12px] font-mono text-muted-foreground/30 uppercase tracking-[0.2em] font-medium">
          v{version}-AcreLedger
        </p>
        <div className="h-px w-8 bg-border/20" />
      </div>

      <button
        onClick={handleUpdateCheck}
        disabled={checking}
        className="h-11 px-6 rounded-full border border-border/40 bg-muted/5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 hover:bg-muted/10 hover:text-muted-foreground transition-all active:scale-95 disabled:opacity-50"
      >
        {checking ? 'Checking Status...' : 'Check for Updates'}
      </button>
    </div>
  );
}
