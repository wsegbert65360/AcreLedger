import { Capacitor } from '@capacitor/core';
import { Analytics, type BeforeSend } from '@vercel/analytics/react';

export function shouldEnableWebAnalytics({ isNative, isProd }: { isNative: boolean; isProd: boolean }): boolean {
  return !isNative && isProd;
}

// Only known app routes may leave the browser; unknown paths could contain personal data.
const publicPaths = new Set([
  '/', '/auth', '/logistics', '/activity', '/equipment', '/reports', '/settings',
  '/setup', '/billing', '/subscription', '/onboarding', '/privacy', '/terms',
  '/refund', '/support', '/weather',
]);

export const beforeSend: BeforeSend = (event) => {
  try {
    const url = new URL(event.url);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const path = /^\/field\/[^/]+$/.test(pathname) ? '/field/[id]' : pathname;
    if (path !== '/field/[id]' && !publicPaths.has(path)) return null;
    // Construct from origin and safe path only, excluding credentials, query and fragment.
    return { type: event.type, url: `${url.origin}${path}` };
  } catch {
    return null;
  }
};

export default function WebAnalytics() {
  if (!shouldEnableWebAnalytics({ isNative: Capacitor.isNativePlatform(), isProd: import.meta.env.PROD })) {
    return null;
  }

  return <Analytics mode="production" beforeSend={beforeSend} />;
}
