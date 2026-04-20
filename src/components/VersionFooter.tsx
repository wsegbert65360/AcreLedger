import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import packageJson from '../../package.json';

export default function VersionFooter() {
  const version = packageJson.version;
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleUpdateCheck = async () => {
    if (!('serviceWorker' in navigator)) {
      toast.info('Updates are managed automatically by your browser.');
      return;
    }

    setChecking(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');

      if (!registration) {
        toast.info('AcreLedger is up to date.');
        return;
      }

      // Snapshot whether a SW was already waiting BEFORE we trigger update(),
      // so we don't false-positive on a pre-existing waiting worker.
      const alreadyWaiting = !!registration.waiting;

      await registration.update();

      // If update() surfaces a brand-new installing worker, wait for it to
      // reach 'installed' (waiting) via statechange rather than a blind timeout.
      const installing = registration.installing;

      if (installing && !alreadyWaiting) {
        await new Promise<void>((resolve) => {
          const onStateChange = () => {
            if (installing.state === 'installed' || installing.state === 'redundant') {
              installing.removeEventListener('statechange', onStateChange);
              resolve();
            }
          };
          installing.addEventListener('statechange', onStateChange);
        });
      }

      if (!mountedRef.current) return;

      // A new worker is waiting only if one wasn't already there before
      const freshUpdate = registration.waiting && !alreadyWaiting;

      if (freshUpdate) {
        toast('Update ready', {
          description: 'A new version of AcreLedger is available.',
          action: {
            label: 'Reload now',
            onClick: () => window.location.reload(),
          },
          duration: 10_000,
        });
      } else {
        toast.info('AcreLedger is up to date.');
      }
    } catch (error) {
      if (!mountedRef.current) return;
      // Replace with Sentry.captureException(error) or equivalent in production
      console.error('Update check failed:', error);
      if (!navigator.onLine) {
        toast.warning('You appear to be offline — unable to check for updates.');
      } else {
        toast.error('Update check failed. Please try again later.');
      }
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto w-full py-10 px-6 flex items-center justify-between gap-4 border-t border-border/10 lg:max-w-4xl">
      <div className="flex flex-col">
        <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest font-bold">
          AcreLedger
        </p>
        <p className="text-[10px] font-mono text-muted-foreground/30">
          v{version}
        </p>
      </div>

      <button
        onClick={handleUpdateCheck}
        disabled={checking}
        className="h-10 px-5 rounded-lg border border-border/40 bg-muted/5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 hover:bg-muted/10 hover:text-muted-foreground transition-all active:scale-95 disabled:opacity-50"
      >
        {checking ? 'Checking...' : 'Check for Updates'}
      </button>
    </div>
  );
}
