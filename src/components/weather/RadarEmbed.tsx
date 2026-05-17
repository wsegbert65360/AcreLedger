import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X, ChevronDown } from 'lucide-react';

interface RadarEmbedProps {
  location: string;
}

/**
 * Parse coordinates from a location string.
 * Accepts "lat,lng" or "lat, lng" (with optional space after comma).
 * Falls back to null for zip codes or unparseable strings.
 */
function parseCoords(location: string): { lat: number; lng: number } | null {
  const match = location.trim().match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

export default function RadarEmbed({ location }: RadarEmbedProps) {
  const [iframeError, setIframeError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const coords = parseCoords(location);

  const url = coords
    ? [
        'https://www.windy.com/embed2.html',
        `?lat=${coords.lat}`,
        `&lon=${coords.lng}`,
        '&zoom=12',
        '&level=surface',
        '&overlay=radar',
        '&menu=&message=&marker=&calendar=now',
        '&location=coordinates',
        '&type=map',
        '&actualGrid=&wmMode=&patch=&ice=',
        '&forecast=12&color=0',
      ].join('')
    : '';

  const hasCoords = coords !== null;

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
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [expanded]);

  const handleExpand = useCallback(() => setExpanded(true), []);
  const handleCollapse = useCallback(() => setExpanded(false), []);

  // When expanded, put iframe behind an overlay so touch events reach our close button.
  // The user taps "Show Map" on the overlay to interact with the iframe.
  const [iframeUnlocked, setIframeUnlocked] = useState(false);

  const unlockIframe = useCallback(() => setIframeUnlocked(true), []);
  const lockIframe = useCallback(() => setIframeUnlocked(false), []);

  if (!hasCoords) {
    return (
      <div className="bg-card border border-border rounded-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Radar</h2>
          </div>
          <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">Needs Coords</span>
        </div>
        <div className="h-48 flex flex-col items-center justify-center gap-2">
          <p className="text-xs font-semibold text-muted-foreground">Radar requires coordinates</p>
          <p className="text-[10px] text-muted-foreground/60">Set coordinates in the weather bar (e.g. 38.4627,-93.5374) instead of a zip code</p>
        </div>
      </div>
    );
  }

  if (iframeError) {
    return (
      <div className="bg-card border border-border rounded-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-destructive rounded-full" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Radar</h2>
          </div>
          <span className="text-[10px] font-bold text-destructive/80 uppercase tracking-wider">Unavailable</span>
        </div>
        <div className="h-48 flex flex-col items-center justify-center gap-2">
          <p className="text-xs font-semibold text-muted-foreground">Radar unavailable</p>
          <p className="text-[10px] text-muted-foreground/60">Check your connection and try again</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Radar</h2>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Interactive</span>
        </div>

        {/* Expand bar */}
        <button
          onClick={handleExpand}
          className="w-full flex items-center justify-center gap-2 py-2 bg-blue-500/10 hover:bg-blue-500/20 active:bg-blue-500/25 border-b border-blue-500/15 transition-colors"
        >
          <Maximize2 size={14} className="text-blue-400" />
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Tap for Full-Screen Radar</span>
        </button>

        {/* Inline iframe */}
        <div className="relative h-48 sm:h-56">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-6 h-6 border-2 border-border border-t-muted-foreground rounded-full animate-spin" />
            </div>
          )}
          <iframe
            src={url}
            className="w-full h-full border-0"
            title="Weather Radar"
            allow="geolocation"
            onLoad={() => setIsLoading(false)}
            onError={() => { setIframeError(true); setIsLoading(false); }}
          />
          <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-card/60 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-card/60 to-transparent pointer-events-none z-10" />
        </div>

        {/* Footer */}
        <div className="px-4 py-1.5 bg-muted/30 flex items-center justify-between">
          <p className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Drag to pan · Pinch to zoom</p>
          <div className="flex items-center gap-1">
            <div className="w-1 h-1 bg-emerald-500 rounded-full" />
            <span className="text-[9px] font-bold text-emerald-500/70 uppercase">Real-time</span>
          </div>
        </div>
      </div>

      {/* ── Fullscreen overlay via portal ── */}
      {expanded && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
          {/* Close bar — always on top, never blocked by iframe.
              pt-safe accounts for phone status bar / notch. */}
          <button
            onClick={handleCollapse}
            className="shrink-0 relative z-50 flex items-center justify-between px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-black/90 active:bg-black w-full border-b border-white/10 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Live Radar</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20">
              <X size={18} />
              <span className="text-sm font-bold uppercase tracking-wider">Close</span>
            </div>
          </button>

          {/* Iframe container — relative so the unlock overlay positions correctly */}
          <div className="relative flex-1">
            <iframe
              ref={iframeRef}
              src={url}
              className="w-full h-full border-0"
              title="Full-Screen Weather Radar"
              allow="geolocation"
            />

            {/* Overlay that blocks iframe touch events and provides a "Show Map" button.
                On mobile, once the user interacts with the iframe, they can't tap out of it.
                This overlay prevents that by sitting on top until the user explicitly taps to interact. */}
            {!iframeUnlocked && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                <button
                  onClick={unlockIframe}
                  className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/20 active:bg-white/30 text-white transition-colors"
                >
                  <Maximize2 size={20} />
                  <span className="text-base font-bold uppercase tracking-wider">Show Map</span>
                </button>
                <p className="text-xs text-white/60 mt-3">Tap to interact with the radar</p>
              </div>
            )}

            {/* When iframe is unlocked, show a small "Close" tab at top of iframe area */}
            {iframeUnlocked && (
              <button
                onClick={lockIframe}
                className="absolute top-2 right-2 z-40 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/70 text-white/80 active:bg-black/90 backdrop-blur-sm"
              >
                <ChevronDown size={14} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Exit Map</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
