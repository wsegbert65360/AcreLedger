import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

interface RadarEmbedProps {
  latitude: number;
  longitude: number;
  lastUpdated?: string;
}

function buildRadarUrl(lat: number, lon: number): string {
  return [
    'https://www.windy.com/embed2.html',
    `?lat=${lat}`,
    `&lon=${lon}`,
    '&zoom=12',
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
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Radar</h2>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated ? (
              <span className="hidden min-[380px]:inline text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider font-mono">
                Loaded {lastUpdated}
              </span>
            ) : null}
            <button
              onClick={handleExpand}
              aria-label="Open full-screen radar"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 transition-colors hover:bg-blue-500/20 active:bg-blue-500/25"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Inline iframe */}
        <div className="relative h-56 sm:h-72">
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
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col pb-[env(safe-area-inset-bottom)]">
          {/* Close bar — pt-safe accounts for phone status bar / notch. */}
          <button
            onClick={handleCollapse}
            className="shrink-0 relative z-50 flex items-center justify-between px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-black/90 active:bg-black w-full border-b border-white/10 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Live Radar</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/80 border border-white/20">
              <X size={18} className="text-white" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">Close</span>
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
