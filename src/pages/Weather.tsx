import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WeatherService } from '@/services/WeatherService';
import { ExtendedWeatherData } from '@/types/weather';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import RadarEmbed from '@/components/weather/RadarEmbed';
import ForecastGrid from '@/components/weather/ForecastGrid';
import {
  ArrowLeft,
  Wind,
  RefreshCw,
  Loader2,
  CloudRain,
  MapPin,
  Crosshair,
} from 'lucide-react';

// ── Helpers ──

function loadZip(userId?: string): string {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Resolve coordinates for weather + radar.
 * Priority:
 *   1. Browser GPS (navigator.geolocation)
 *   2. First field with lat/lng
 *   3. Parse from saved zip (if it's already coords like "38.46,-93.53")
 * Falls back to zip string for weather API only (no radar).
 */
function resolveCoords(
  fields: { lat: number | null; lng: number | null }[],
  savedZip: string,
): Promise<{ lat: number; lng: number; locationString: string }> {
  // 1. Browser GPS
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve(fallbackToFields(fields, savedZip));
    }

    const timeoutId = setTimeout(() => {
      // GPS took too long — use fallback
      resolve(fallbackToFields(fields, savedZip));
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeoutId);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        resolve({ lat, lng, locationString: `${lat},${lng}` });
      },
      () => {
        clearTimeout(timeoutId);
        resolve(fallbackToFields(fields, savedZip));
      },
      { enableHighAccuracy: false, timeout: 4000 },
    );
  });
}

function fallbackToFields(
  fields: { lat: number | null; lng: number | null }[],
  savedZip: string,
): { lat: number; lng: number; locationString: string } {
  // 2. First field with coords
  const field = fields.find(f => f.lat != null && f.lng != null);
  if (field && field.lat != null && field.lng != null) {
    const lat = Math.round(field.lat * 10000) / 10000;
    const lng = Math.round(field.lng * 10000) / 10000;
    return { lat, lng, locationString: `${lat},${lng}` };
  }

  // 3. Parse saved zip if it's already coords
  const match = savedZip.trim().match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), locationString: savedZip.trim() };
  }

  // No coords available — return 0s, locationString will be the zip for weather API
  return { lat: 0, lng: 0, locationString: savedZip || '' };
}

// ── Page ──

export default function Weather() {
  const navigate = useNavigate();
  const { session, fields } = useFarm();
  const userId = session?.user?.id;

  const [weather, setWeather] = useState<ExtendedWeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [usingGps, setUsingGps] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Resolve location on mount
  useEffect(() => {
    let cancelled = false;
    const saved = loadZip(userId);

    // If no saved zip and no fields with coords, show "no location" immediately
    if (!saved && !fields.some(f => f.lat != null && f.lng != null)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setUsingGps(true);

    resolveCoords(fields, saved).then(({ lat, lng, locationString }) => {
      if (cancelled) return;

      // Check if we got real GPS (not field coords or parsed zip)
      const gotGps = lat !== 0 && lng !== 0;
      setCoords(gotGps ? { lat, lng } : null);

      if (locationString) {
        loadWeather(locationString);
      } else {
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [userId, fields]);

  const loadWeather = useCallback(async (loc: string) => {
    if (!loc.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const result = await WeatherService.fetchExtendedWeather(loc.trim(), controller.signal);
      if (!controller.signal.aborted) {
        setWeather(result);
        setLastUpdated(formatTime());
      }
    } catch {
      if (!controller.signal.aborted) {
        setWeather(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Auto-refresh every 5 min (re-resolve coords + fetch)
  useEffect(() => {
    const interval = setInterval(() => {
      const saved = loadZip(userId);
      resolveCoords(fields, saved).then(({ lat, lng, locationString }) => {
        const gotGps = lat !== 0 && lng !== 0;
        setCoords(gotGps ? { lat, lng } : null);
        if (locationString) loadWeather(locationString);
      });
    }, 300_000);
    return () => clearInterval(interval);
  }, [userId, fields, loadWeather]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    const saved = loadZip(userId);
    resolveCoords(fields, saved).then(({ lat, lng, locationString }) => {
      const gotGps = lat !== 0 && lng !== 0;
      setCoords(gotGps ? { lat, lng } : null);
      if (locationString) loadWeather(locationString);
      else setLoading(false);
    });
  }, [userId, fields, loadWeather]);

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between lg:max-w-5xl lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              aria-label="Back to dashboard"
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition-colors -ml-1"
            >
              <ArrowLeft size={18} className="text-foreground" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-foreground tracking-tight">Weather</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin size={10} className="text-emerald-500/60" />
                {weather?.locationName || (loading ? 'Locating…' : 'No location')}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh weather data"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <RefreshCw size={16} className={`text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4 lg:max-w-5xl lg:px-8">
        {/* ── Loading State ── */}
        {loading && !weather && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="text-muted-foreground/40 animate-spin" />
            <p className="text-xs text-muted-foreground">
              {usingGps ? 'Getting your location…' : 'Loading weather data…'}
            </p>
          </div>
        )}

        {/* ── No Location ── */}
        {!loading && !weather && (
          <div className="text-center py-16 px-4 border-2 border-dashed border-border rounded-2xl bg-muted/20">
            <MapPin size={40} className="mx-auto text-muted-foreground/20 mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-1">No Location</h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px] mx-auto">
              Enter a zip code in the weather bar on the home screen, or add field coordinates.
            </p>
          </div>
        )}

        {/* ── Weather Content ── */}
        {weather && (
          <>
            {/* GPS indicator */}
            {coords && (
              <div className="flex items-center justify-center gap-1.5 py-1">
                <Crosshair size={10} className="text-emerald-500/60" />
                <span className="text-[10px] font-semibold text-emerald-500/60 uppercase tracking-wider">
                  GPS · {coords.lat}, {coords.lng}
                </span>
              </div>
            )}

            {/* Current Conditions */}
            <CurrentConditionsCard weather={weather} lastUpdated={lastUpdated} />

            {/* Radar — requires GPS or field coords */}
            {coords ? (
              <RadarEmbed latitude={coords.lat} longitude={coords.lng} />
            ) : (
              <div className="bg-card border border-border rounded-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Radar</h2>
                  </div>
                  <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">Needs GPS</span>
                </div>
                <div className="h-48 flex flex-col items-center justify-center gap-2">
                  <Crosshair size={24} className="text-muted-foreground/20" />
                  <p className="text-xs font-semibold text-muted-foreground">Radar requires GPS coordinates</p>
                  <p className="text-[10px] text-muted-foreground/60">Allow location access or add field coordinates</p>
                </div>
              </div>
            )}

            {/* 10-Day Forecast */}
            <ForecastGrid days={weather.forecastDays} />

            {/* Last Updated */}
            {lastUpdated && (
              <div className="text-center py-2">
                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                  Updated {lastUpdated} · Auto-refreshes every 5 min
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

// ── Current Conditions Card ──

function CurrentConditionsCard({ weather, lastUpdated }: { weather: ExtendedWeatherData; lastUpdated: string }) {
  const isRain = weather.isRainingNow;

  return (
    <div className="bg-card border border-border rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current</h2>
        </div>
        {lastUpdated && (
          <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted/30 px-2 py-0.5 rounded-full">
            {lastUpdated}
          </span>
        )}
      </div>

      {/* Main conditions row */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Temperature */}
        <div className="flex flex-col shrink-0">
          <span className="text-4xl font-mono font-bold text-foreground tracking-tight leading-none">
            {weather.isError ? '—' : `${weather.temp}°`}
          </span>
          {weather.feelsLike !== weather.temp && (
            <span className="text-[10px] text-muted-foreground mt-1">Feels {weather.feelsLike}°</span>
          )}
        </div>

        <div className="w-px h-10 bg-border/50 shrink-0" />

        {/* Stats */}
        <div className="flex-1 flex items-center justify-around">
          <MiniStat icon={<Wind size={12} className="text-foreground/50" />} label="Wind" value={`${weather.wind} ${weather.windDirection}`} />
          <MiniStat icon={<Wind size={12} className="text-foreground/50" />} label="Gust" value={`${weather.gusts}`} />
          <MiniStat
            icon={<CloudRain size={12} className={isRain ? 'text-blue-400' : 'text-foreground/50'} />}
            label="Rain"
            value={isRain ? 'Active' : 'None'}
            highlight={isRain}
          />
        </div>
      </div>

      {/* Rainfall strip */}
      <div className="mx-4 mb-3 flex items-center divide-x divide-border/50 rounded-lg bg-muted/30">
        <RainCell label="24h" value={weather.precip24h} />
        <RainCell label="72h" value={weather.precip72h} />
        <RainCell label="7d" value={weather.precip168h} />
        <RainCell label="Chance" value={weather.precipProb} suffix="%" />
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, highlight = false }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-xs font-semibold font-mono ${highlight ? 'text-blue-400' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function RainCell({ label, value, suffix = '"' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex-1 text-center py-2">
      <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{label}</p>
      <p className="text-[11px] font-bold font-mono text-foreground">{value}{suffix}</p>
    </div>
  );
}
