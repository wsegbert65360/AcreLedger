/**
 * Build a navigation URL for a GPS point.
 *
 * - `'pdf'` / web: a universal Google Maps URL (works as a clickable link in
 *   any PDF viewer and any desktop/mobile browser). Used for the PDF nav link
 *   and the in-app Navigate link on web.
 * - `'app'`: a native maps-app URL. On iOS Capacitor this opens Apple Maps via
 *   `maps://`; the OS falls back to Google Maps otherwise. Kept separate so the
 *   PDF (which is shared across platforms) always uses the universal link.
 */
export function buildNavigationUrl(
  lat: number,
  lng: number,
  ctx: 'pdf' | 'app' = 'pdf',
): string {
  if (ctx === 'app' && typeof window !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return `maps://?q=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Human-readable label for a navigation point, or a placeholder when missing. */
export function formatNavigationCoords(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null) return 'Coordinates unavailable';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
