import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

interface RadarEmbedProps {
  latitude: number;
  longitude: number;
  lastUpdated?: string;
}

/** Wide enough to see rain a county or two away, which is what the radar is for. */
const RADAR_ZOOM = 8;

function buildRadarUrl(lat: number, lon: number): string {
  return [
    'https://www.windy.com/embed2.html',
    `?lat=${lat}`,
    `&lon=${lon}`,
    `&zoom=${RADAR_ZOOM}`,
    '&level=surface',
    '&overlay=radar',
    '&menu=&message=&marker=&calendar=now',
    '&location=coordinates',
    '&type=map',
    '&actualGrid=&wmMode=&patch=&ice=',
    '&forecast=12&color=0',
  ].join('');
}

export default function RadarEmbed({ latitude, longitude, lastUpdated }: RadarEmbedProps) {
  const [iframeError, setIframeError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const url = buildRadarUrl(latitude, longitude);

  useEffect(() => {
    setIsLoading(true);
    setIframeError(false);
  }, [url]);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      if (isLoading) {
        setIframeError(true);
        setIsLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Lock body scroll when expanded + ESC to close
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [expanded]);

  const handleExpand = useCallback(() => setExpanded(true), []);
  const handleCollapse = useCallback(() => setExpanded(false), []);

  if (iframeError) {
    return (
      <section className="rounded-2xl border border-border bg-card">
        <h2 className="px-4 pt-3.5 text-base font-bold text-foreground">Radar</h2>
        <div className="flex h-40 flex-col items-center justify-center gap-1 px-4 text-center">
          <p className="text-sm font-semibold text-foreground">Radar did not load</p>
          <p className="text-xs text-muted-foreground">Check your connection, then refresh.</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <h2 className="text-base font-bold text-foreground">Radar</h2>
          {lastUpdated ? (
            <span className="font-mono text-xs text-muted-foreground">Loaded {lastUpdated}</span>
          ) : null}
        </div>

        {/* Preview. The map itself ignores touches so the page still scrolls;
            the whole preview is one button that opens the full-screen radar. */}
        <div className="relative h-56 sm:h-72">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-muted-foreground" />
            </div>
          )}
          <iframe
            src={url}
            className="pointer-events-none h-full w-full border-0"
            title="Weather radar preview"
            tabIndex={-1}
            aria-hidden="true"
            onLoad={() => setIsLoading(false)}
            onError={() => { setIframeError(true); setIsLoading(false); }}
          />
          <button
            type="button"
            onClick={handleExpand}
            aria-label="Open full-screen radar"
            className="group absolute inset-0 z-10 flex items-end justify-end p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex min-h-11 items-center gap-2 rounded-lg bg-background/95 px-3.5 text-sm font-semibold text-foreground shadow-md ring-1 ring-border transition-colors group-hover:bg-background group-active:bg-muted">
              <Maximize2 size={15} aria-hidden="true" />
              Open radar
            </span>
          </button>
        </div>
      </section>

      {/* ── Fullscreen overlay via portal ── */}
      {expanded && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col pb-[env(safe-area-inset-bottom)]">
          {/* Close bar — pt-safe accounts for phone status bar / notch. */}
          <button
            onClick={handleCollapse}
            className="shrink-0 relative z-50 flex items-center justify-between px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-black/90 active:bg-black w-full border-b border-white/10 cursor-pointer"
          >
            <span className="text-base font-bold text-white">Radar</span>
            <div className="flex min-h-11 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4">
              <X size={18} className="text-white" aria-hidden="true" />
              <span className="text-sm font-semibold text-white">Close</span>
            </div>
          </button>

          <iframe
            src={url}
            className="flex-1 w-full border-0"
            title="Full-Screen Weather Radar"
            allow="geolocation"
          />
        </div>,
        document.body
      )}
    </>
  );
}
