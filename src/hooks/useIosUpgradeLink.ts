import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

import { resolveIosUpgradeLink } from '@/lib/storefront';

let cached: string | null | undefined;

/**
 * The website upgrade link for the iOS app, or null. Non-null only on iOS, on the US App
 * Store storefront, with VITE_UPGRADE_URL set. `open` hands the URL to the system browser:
 * no checkout ever happens inside the app.
 */
export function useIosUpgradeLink(): { url: string | null; open: () => void } {
  const [url, setUrl] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios' || cached !== undefined) return;
    let cancelled = false;
    void resolveIosUpgradeLink().then((resolved) => {
      cached = resolved;
      if (!cancelled) setUrl(resolved);
    });
    return () => { cancelled = true; };
  }, []);

  const open = useCallback(() => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  return { url, open };
}
