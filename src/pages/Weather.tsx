import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ArrowLeft,
  CloudRain,
  Crosshair,
  Droplets,
  Loader2,
  MapPin,
  RefreshCw,
  Thermometer,
  Wind,
} from 'lucide-react';

import ForecastGrid from '@/components/weather/ForecastGrid';
import RadarEmbed from '@/components/weather/RadarEmbed';
import { formatTime, getConditionGradient, getWeatherLucideIcon, loadZip, resolveCoords } from '@/lib/weatherHelpers';
import { WeatherService } from '@/services/WeatherService';
import { useFarm } from '@/store/farmStore';
import { ExtendedWeatherData } from '@/types/weather';

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

  // Resolve location when fields load (fields start as [] then populate from Supabase)
  useEffect(() => {
    let cancelled = false;
    const saved = loadZip(userId);
    const hasSavedOrFields = saved.trim() !== '' || fields.some(f => f.lat != null && f.lng != null);

    setLoading(true);
    setUsingGps(!hasSavedOrFields);

    resolveCoords(fields, saved).then(({ lat, lng, locationString }) => {
      if (cancelled) return;

      // Accept any valid coords — GPS, field coords, or parsed lat,lng string
      const hasCoords = lat !== 0 && lng !== 0;
      setCoords(hasCoords ? { lat, lng } : null);
      setUsingGps(false);

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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-refresh every 5 min (re-resolve coords + fetch)
  useEffect(() => {
    const interval = setInterval(() => {
      const saved = loadZip(userId);
      resolveCoords(fields, saved).then(({ lat, lng, locationString }) => {
        const hasCoords = lat !== 0 && lng !== 0;
        setCoords(hasCoords ? { lat, lng } : null);
        if (locationString) loadWeather(locationString);
      });
    }, 300_000);
    return () => clearInterval(interval);
  }, [userId, fields, loadWeather]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    const saved = loadZip(userId);
    const hasSavedOrFields = saved.trim() !== '' || fields.some(f => f.lat != null && f.lng != null);
    setUsingGps(!hasSavedOrFields);

    resolveCoords(fields, saved).then(({ lat, lng, locationString }) => {
      const gotGps = lat !== 0 && lng !== 0;
      setCoords(gotGps ? { lat, lng } : null);
      setUsingGps(false);
      if (locationString) loadWeather(locationString);
      else setLoading(false);
    });
  }, [userId, fields, loadWeather]);

  // Condition-aware gradient
  const bgGradient = weather
    ? getConditionGradient(weather.icon, weather.isRainingNow)
    : '';

  return (
    <div className={`min-h-screen bg-background pb-20 lg:pb-8 ${bgGradient ? `bg-gradient-to-b ${bgGradient}` : ''}`}>
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

            {/* ── HERO: Live Radar ── */}
            {coords ? (
              <RadarEmbed latitude={coords.lat} longitude={coords.lng} lastUpdated={lastUpdated} />
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

            {/* ── Current Conditions ── */}
            <CurrentConditionsCard weather={weather} lastUpdated={lastUpdated} />

            {/* ── 10-Day Forecast ── */}
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

    </div>
  );
}

// ── Current Conditions Card ──

function CurrentConditionsCard({ weather, lastUpdated }: { weather: ExtendedWeatherData; lastUpdated: string }) {
  const isRain = weather.isRainingNow;
  const ConditionIcon = getWeatherLucideIcon(weather.icon, weather.precipProb, weather.isRainingNow);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
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

      {/* Main conditions — icon + temp + stats */}
      <div className="px-4 py-4 flex items-center gap-4">
        {/* Condition icon + Temperature */}
        <div className="flex items-center gap-3 shrink-0">
          <div className={`p-2.5 rounded-xl ${isRain ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}>
            <ConditionIcon size={28} className={isRain ? 'text-blue-400' : 'text-amber-500'} />
          </div>
          <div className="flex flex-col">
            <span className="text-4xl font-mono font-bold text-foreground tracking-tight leading-none">
              {weather.isError ? '—' : `${weather.temp}°`}
            </span>
            {weather.feelsLike !== weather.temp && (
              <span className="text-[10px] text-muted-foreground mt-1">Feels {weather.feelsLike}°</span>
            )}
            {weather.conditions && (
              <span className="text-[10px] text-muted-foreground/80 font-medium mt-0.5 capitalize">
                {weather.conditions}
              </span>
            )}
          </div>
        </div>

        <div className="w-px h-12 bg-border/50 shrink-0" />

        {/* Stats grid */}
        <div className="flex-1 grid grid-cols-3 gap-1">
          <MiniStat
            icon={<Wind size={12} className="text-foreground/50" />}
            label="Wind"
            value={`${weather.wind} ${weather.windDirection}`}
          />
          <MiniStat
            icon={<Wind size={12} className="text-foreground/50" />}
            label="Gust"
            value={`${weather.gusts}`}
          />
          <MiniStat
            icon={<CloudRain size={12} className={isRain ? 'text-blue-400' : 'text-foreground/50'} />}
            label="Rain"
            value={isRain ? 'Active' : 'None'}
            highlight={isRain}
          />
          <MiniStat
            icon={<Droplets size={12} className="text-foreground/50" />}
            label="Humid"
            value={`${weather.humidity}%`}
          />
          <MiniStat
            icon={<Thermometer size={12} className="text-foreground/50" />}
            label="Dew"
            value={`${weather.dewPoint}°`}
          />
          <MiniStat
            icon={<CloudRain size={12} className="text-foreground/50" />}
            label="Chance"
            value={`${weather.precipProb}%`}
          />
        </div>
      </div>

      {/* Rainfall strip */}
      <div className="mx-4 mb-3 flex items-center divide-x divide-border/50 rounded-lg bg-muted/30">
        <RainCell label="24h" value={weather.precip24h} />
        <RainCell label="72h" value={weather.precip72h} />
        <RainCell label="7d" value={weather.precip168h} />
      </div>

      {/* Sunrise / Sunset strip */}
      {(weather.sunrise || weather.sunset) && (
        <div className="mx-4 mb-3 flex items-center justify-between px-3 py-2 rounded-lg bg-muted/20 text-[10px] font-mono text-muted-foreground">
          <span>☀️ {weather.sunrise || '—'}</span>
          <span className="text-muted-foreground/40">|</span>
          <span>🌙 {weather.sunset || '—'}</span>
        </div>
      )}
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
