import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import packageJson from '../../package.json';
import {
  ACRELEDGER_IOS_BUNDLE_ID,
  isStoreVersionNewer,
  lookupIosStoreVersion,
} from '@/lib/iosStoreVersion';

type IosUpdateStatus = 'update' | 'current' | 'hidden';

async function installedIosVersion(fallback: string): Promise<string> {
  try {
    const info = await App.getInfo();
    if (info.version.trim()) return info.version.trim();
  } catch {
    // The bundled package version is the marketing version written at release.
  }
  return fallback.split('-')[0] || fallback;
}

export default function VersionFooter() {
  const version = packageJson.version;
  const ios = Capacitor.getPlatform() === 'ios';
  const [checking, setChecking] = useState(false);
  const [iosStatus, setIosStatus] = useState<IosUpdateStatus>('hidden');
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!ios) return;
    let cancelled = false;

    (async () => {
      try {
        const installed = await installedIosVersion(version);
        const listing = await lookupIosStoreVersion(ACRELEDGER_IOS_BUNDLE_ID);
        if (cancelled || !mountedRef.current || !listing) return;
        const needsUpdate = isStoreVersionNewer(installed, listing.version);
        if (needsUpdate == null) return;
        setStoreUrl(listing.url);
        setIosStatus(needsUpdate ? 'update' : 'current');
      } catch {
        // Offline or an unpublished build: show the version and nothing else.
      }
    })();

    return () => { cancelled = true; };
  }, [ios, version]);

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
        <p className="text-[11px] text-muted-foreground font-bold">
          AcreLedger
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          v{version}
        </p>
      </div>

      {ios ? (
        <IosUpdateStatus status={iosStatus} storeUrl={storeUrl} />
      ) : (
        <button
          onClick={handleUpdateCheck}
          disabled={checking}
          className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-muted active:scale-95 disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      )}
    </div>
  );
}

function IosUpdateStatus({ status, storeUrl }: { status: IosUpdateStatus; storeUrl: string | null }) {
  if (status === 'hidden') return null;

  if (status === 'update') {
    const label = 'You need to update';
    if (!storeUrl) {
      return <p className="text-sm font-semibold text-foreground">{label}</p>;
    }
    return (
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold text-foreground underline underline-offset-2"
      >
        {label}
      </a>
    );
  }

  return <p className="text-sm font-semibold text-muted-foreground">Up to date</p>;
}
