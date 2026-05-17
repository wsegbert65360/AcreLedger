import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { WeatherService } from '@/services/WeatherService';
import { ExtendedWeatherData } from '@/types/weather';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import RadarEmbed from '@/components/weather/RadarEmbed';
import ForecastGrid from '@/components/weather/ForecastGrid';
import {
  ArrowLeft,
  Thermometer,
  Wind,
  Droplets,
  RefreshCw,
  Loader2,
  CloudRain,
  MapPin,
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

// ── Page ──

export default function Weather() {
  const navigate = useNavigate();
  const { session, fields } = useFarm();
  const userId = session?.user?.id;

  const [weather, setWeather] = useState<ExtendedWeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Resolve location from localStorage (same key as WeatherBar) or field coords
  const location = useMemo(() => {
    const saved = loadZip(userId);
    if (saved) return saved;
    const field = fields.find(f => f.lat != null && f.lng != null);
    if (field && field.lat != null && field.lng != null) {
      return `${field.lat.toFixed(4)},${field.lng.toFixed(4)}`;
    }
    return '';
  }, [userId, fields]);

  const load = useCallback(async (loc: string) => {
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

  useEffect(() => {
    if (!location) return;
    load(location);
    const interval = setInterval(() => load(location), 300_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [location, load]);

  const handleRefresh = useCallback(() => load(location), [load, location]);

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
                {weather?.locationName || (loading ? 'Loading...' : 'No location set')}
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
            <p className="text-xs text-muted-foreground">Loading weather data…</p>
          </div>
        )}

        {/* ── No Location ── */}
        {!loading && !location && (
          <div className="text-center py-16 px-4 border-2 border-dashed border-border rounded-2xl bg-muted/20">
            <MapPin size={40} className="mx-auto text-muted-foreground/20 mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-1">No Location Set</h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px] mx-auto">
              Enter a zip code in the weather bar on the home screen to see weather data.
            </p>
          </div>
        )}

        {/* ── Weather Content ── */}
        {weather && (
          <>
            {/* Current Conditions */}
            <CurrentConditionsCard weather={weather} lastUpdated={lastUpdated} />

            {/* Radar */}
            <RadarEmbed latitude={weather.latitude} longitude={weather.longitude} />

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
