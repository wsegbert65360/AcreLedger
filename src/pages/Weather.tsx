import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ArrowLeft,
  Loader2,
  MapPin,
  RefreshCw,
  Sunrise,
  Sunset,
} from 'lucide-react';

import WeatherLocationSearch from '@/components/weather/WeatherLocationSearch';
import WeatherNoLocation from '@/components/weather/WeatherNoLocation';
import ForecastGrid from '@/components/weather/ForecastGrid';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import RadarEmbed from '@/components/weather/RadarEmbed';
import { SprayDecisionMatrix } from '@/components/weather/SprayDecisionMatrix';
import { isNativePlatform, native } from '@/lib/native';
import {
  fallbackToFields,
  formatClockTime,
  formatRainInches,
  formatTime,
  getConditionGradient,
  getWeatherLucideIcon,
  getDownwindRotation,
  loadCachedWeatherCoords,
  loadZip,
  matchFieldByCoords,
  resolveCoords,
  saveCachedWeatherCoords,
  saveZip,
  parseWeatherLocationInput,
  WIND_ALERT_MPH,
} from '@/lib/weatherHelpers';
import { RainService } from '@/services/RainService';
import { RainfallDailyService } from '@/services/RainfallDailyService';
import { useEntitlement } from '@/hooks/useEntitlement';
import { isFreeTierLocked } from '@/lib/entitlements';
import { WeatherService } from '@/services/WeatherService';
import { useFarm } from '@/store/farmStore';
import { ExtendedWeatherData } from '@/types/weather';

/** How often an on-screen weather page reloads. */
const AUTO_REFRESH_MS = 15 * 60 * 1000;

// ── Page ──

export default function Weather() {
  const navigate = useNavigate();
  const { session, fields, initialFetchComplete } = useFarm();
  const userId = session?.user?.id;

  const [weather, setWeather] = useState<ExtendedWeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [usingGps, setUsingGps] = useState(false);
  const [inputLoc, setInputLoc] = useState('');
  const [searchError, setSearchError] = useState('');
  // No saved zip, field, or GPS fix after location resolution. Show the zip prompt.
  const [needsLocation, setNeedsLocation] = useState(false);
  // The search box stays out of the way until asked for, or until it is the only way forward.
  const [searchOpen, setSearchOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const { entitlement } = useEntitlement();
  const rainLocked = isFreeTierLocked(entitlement);
  const rainLockedRef = useRef(false);
  rainLockedRef.current = rainLocked;
  // Last location loaded, and whether that load already used the free-plan (daily) path.
  const lastLocRef = useRef('');
  const loadedLockedRef = useRef(false);

  const loadWeather = useCallback(async (loc: string) => {
    if (!loc.trim()) return;
    setNeedsLocation(false);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastLocRef.current = loc;
    loadedLockedRef.current = rainLockedRef.current;

    setLoading(true);
    try {
      const result = await WeatherService.fetchExtendedWeather(loc.trim(), controller.signal);
      if (controller.signal.aborted) return;

      const lat = result.latitude;
      const lng = result.longitude;
      if (lat != null && lng != null) {
        try {
          const fieldId = matchFieldByCoords(fieldsRef.current, lat, lng);

          // The Rain API refuses coordinate-only requests. An unmatched location
          // keeps the weather-service precipitation totals (no error toast).
          // Free plan: daily totals for a matched slot field; no live Rain API.
          if (fieldId) {
            const rainData = rainLockedRef.current
              ? await RainfallDailyService.fetchRainfallFromDaily({ fieldId })
              : await RainService.fetchComprehensiveRainfall({
                  fieldId,
                  lat,
                  lng,
                  signal: controller.signal,
                });

            if (controller.signal.aborted) return;

            result.precip24h = rainData['24h'];
            result.precip72h = rainData['72h'];
            result.precip168h = rainData['168h'];
            result.rainfallBasis = 'rolling';
          }
        } catch (rainErr) {
          if ((rainErr as { name?: string })?.name === 'AbortError' || controller.signal.aborted) return;
          console.error('[Weather] Failed to fetch high-res radar rainfall:', rainErr);
        }
      }

      if (controller.signal.aborted) return;

      setWeather(result);
      setLastUpdated(formatTime());
      if (result.latitude != null && result.longitude != null) {
        setCoords({ lat: result.latitude, lng: result.longitude });
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError' || controller.signal.aborted) return;
      setWeather(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // The plan can resolve after the first load already ran on the live Rain API path (review item 4).
  // Reload once when it turns out to be a free farm so it does not keep live hourly numbers.
  useEffect(() => {
    if (rainLocked && !loadedLockedRef.current && lastLocRef.current) void loadWeather(lastLocRef.current);
  }, [rainLocked, loadWeather]);

  const firstFieldWithCoords = fields.find(f => f.lat != null && f.lng != null);
  const fieldCoordsKey = firstFieldWithCoords && firstFieldWithCoords.lat != null && firstFieldWithCoords.lng != null
    ? `${firstFieldWithCoords.lat},${firstFieldWithCoords.lng}`
    : '';
  const savedLoc = loadZip(userId).trim();
  const locationEffectKey = savedLoc ? `zip:${savedLoc}` : `fields:${fieldCoordsKey}`;

  // Sync initial location input when saved location or field coords appear
  useEffect(() => {
    const saved = loadZip(userId);
    if (saved) {
      setInputLoc(saved);
    } else if (fieldCoordsKey) {
      const [lat, lng] = fieldCoordsKey.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setInputLoc(`${lat.toFixed(4)},${lng.toFixed(4)}`);
      }
    }
  }, [userId, fieldCoordsKey]);

  // Resolve location when fields load (fields start as [] then populate from Supabase)
  useEffect(() => {
    let cancelled = false;
    const saved = loadZip(userId);
    const hasSavedOrFields = saved.trim() !== '' || Boolean(fieldCoordsKey);

    if (hasSavedOrFields) setNeedsLocation(false);

    // Empty fields on first paint must not trigger a Safari location prompt.
    // Serve a cached GPS fix immediately; wait for the store before a live read.
    if (!hasSavedOrFields && !initialFetchComplete) {
      const cached = loadCachedWeatherCoords();
      if (cached) {
        setNeedsLocation(false);
        setCoords({ lat: cached.lat, lng: cached.lon });
        setUsingGps(false);
        loadWeather(`${cached.lat},${cached.lon}`);
      } else {
        // Field coordinates may still arrive. Keep loading rather than the zip prompt.
        setNeedsLocation(false);
        setLoading(true);
        setUsingGps(false);
      }
      return;
    }

    // Native geolocation stays on the explicit current-location button.
    // With nothing saved after fields hydrate, ask for a zip instead of
    // starting another fix that ends on "No location".
    if (!hasSavedOrFields && isNativePlatform()) {
      const cached = loadCachedWeatherCoords();
      if (!cached) {
        setNeedsLocation(true);
        setLoading(false);
        setUsingGps(false);
        setCoords(null);
        return;
      }
      setNeedsLocation(false);
    }

    setLoading(true);
    setUsingGps(!hasSavedOrFields);

    resolveCoords(fieldsRef.current, saved)
      .then(({ lat, lng, locationString }) => {
        if (cancelled) return;
        const hasCoords = lat !== 0 && lng !== 0;
        setCoords(hasCoords ? { lat, lng } : null);
        setUsingGps(false);
        if (locationString) {
          setNeedsLocation(false);
          loadWeather(locationString);
        } else {
          setNeedsLocation(!hasSavedOrFields && !loadCachedWeatherCoords());
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[Weather] Failed to resolve the initial location:', error);
        setUsingGps(false);
        setLoading(false);
        setNeedsLocation(!hasSavedOrFields && !loadCachedWeatherCoords());
      });

    return () => { cancelled = true; };
  }, [userId, fieldCoordsKey, locationEffectKey, loadWeather, initialFetchComplete]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-refresh while the page is on screen. A hidden tab or backgrounded app
  // does not spend weather-provider calls; it catches up when it is shown again.
  useEffect(() => {
    let lastRun = Date.now();
    const refresh = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      lastRun = Date.now();
      const saved = loadZip(userId);
      resolveCoords(fieldsRef.current, saved, { passive: true })
        .then(({ lat, lng, locationString }) => {
          const hasCoords = lat !== 0 && lng !== 0;
          setCoords(hasCoords ? { lat, lng } : null);
          if (locationString) loadWeather(locationString);
        })
        .catch((error: unknown) => console.error('[Weather] Failed to resolve refresh location:', error));
    };
    const interval = setInterval(refresh, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastRun >= AUTO_REFRESH_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, loadWeather]);

  const handleLocationSubmit = useCallback((raw: string) => {
    const parsed = parseWeatherLocationInput(raw);
    if (!parsed.ok) {
      setSearchError(parsed.error);
      return;
    }
    const loc = parsed.value;
    setSearchError('');
    setSearchOpen(false);
    setCoords(parsed.coords);

    saveZip(loc, userId);
    loadWeather(loc);
  }, [userId, loadWeather]);

  const handleUseGps = useCallback(() => {
    setLoading(true);
    setUsingGps(true);
    setSearchError('');

    // Capacitor permission UX stays on the plugin call, with the same options.
    if (isNativePlatform()) {
      native.geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 4000 })
        .then((pos) => {
          const lat = Math.round(pos.coords.latitude * 10000) / 10000;
          const lng = Math.round(pos.coords.longitude * 10000) / 10000;
          const locStr = `${lat},${lng}`;
          setInputLoc(locStr);
          setCoords({ lat, lng });
          saveZip(locStr, userId);
          saveCachedWeatherCoords({ lat, lon: lng, ts: Date.now() });
          loadWeather(locStr);
        })
        .catch(() => {
          setSearchError('Failed to get GPS location');
          setLoading(false);
          setUsingGps(false);
        });
      return;
    }

    // Web: an explicit tap may request a fix (maximumAge included). Denied,
    // or a dismissed prompt, falls back to the cache or saved location quietly.
    resolveCoords([], '', { forceRefresh: true })
      .then(({ lat, lng, locationString }) => {
        if (lat !== 0 || lng !== 0) {
          const locStr = locationString || `${lat},${lng}`;
          setInputLoc(locStr);
          setCoords({ lat, lng });
          saveZip(locStr, userId);
          setUsingGps(false);
          loadWeather(locStr);
          return;
        }
        const fallback = fallbackToFields(fieldsRef.current, loadZip(userId));
        setUsingGps(false);
        if (fallback.locationString) {
          if (fallback.lat !== 0 || fallback.lng !== 0) {
            setCoords({ lat: fallback.lat, lng: fallback.lng });
          }
          loadWeather(fallback.locationString);
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        setUsingGps(false);
        setLoading(false);
      });
  }, [userId, loadWeather]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    const saved = loadZip(userId);
    const hasSavedOrFields = saved.trim() !== '' || fields.some(f => f.lat != null && f.lng != null);
    setUsingGps(!hasSavedOrFields);

    resolveCoords(fields, saved, { forceRefresh: true })
      .then(({ lat, lng, locationString }) => {
        const gotGps = lat !== 0 && lng !== 0;
        setCoords(gotGps ? { lat, lng } : null);
        setUsingGps(false);
        if (locationString) {
          setNeedsLocation(false);
          loadWeather(locationString);
        } else {
          setNeedsLocation(!hasSavedOrFields && !loadCachedWeatherCoords());
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        console.error('[Weather] Failed to resolve refresh location:', error);
        setUsingGps(false);
        setLoading(false);
        setNeedsLocation(!hasSavedOrFields && !loadCachedWeatherCoords());
      });
  }, [userId, fields, loadWeather]);

  // Condition-aware gradient
  const bgGradient = weather
    ? getConditionGradient(weather.icon, weather.isRainingNow)
    : '';
  const showSetZipPrompt = needsLocation && !loading && !weather;
  const showSearch = searchOpen || showSetZipPrompt || (!loading && !weather);

  return (
    <div className={`min-h-screen bg-background pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8 ${bgGradient ? `bg-gradient-to-b ${bgGradient}` : ''}`}>
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-2 py-2 flex items-center justify-between gap-2 lg:max-w-5xl lg:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <button
              onClick={() => navigate('/')}
              aria-label="Back to dashboard"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft size={20} className="text-foreground" />
            </button>
            <div className="flex min-w-0 flex-col">
              <h1 className="text-base font-bold leading-tight text-foreground">Weather</h1>
              <p className="truncate text-xs text-muted-foreground">
                {weather?.locationName || (loading ? 'Locating…' : 'Set your zip code to see weather')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <SyncStatusIndicator />
            <button
              onClick={() => setSearchOpen(open => !open)}
              aria-label="Change location"
              aria-expanded={showSearch}
              aria-controls="weather-location-panel"
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-muted/50 ${searchOpen ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            >
              <MapPin size={18} />
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Refresh weather data"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-3 space-y-3 lg:max-w-5xl lg:px-8">
        {/* ── Location: only when asked for, or when there is nothing else to show ── */}
        {showSearch && (
          <div id="weather-location-panel" className="bg-card border border-border rounded-2xl p-3 space-y-2">
            {showSetZipPrompt && (
              <h2 className="text-sm font-bold text-foreground">Set your zip code to see weather</h2>
            )}
            <WeatherLocationSearch inputId="weatherLocation" value={inputLoc} onChange={value => { setInputLoc(value); setSearchError(''); }} onSubmit={handleLocationSubmit} error={searchError} disabled={loading} onUseGps={handleUseGps} usingGps={usingGps} />
            {showSetZipPrompt && (
              <p className="text-center text-xs text-muted-foreground leading-relaxed">
                Enter a zip code in the search field above to see weather.
              </p>
            )}
          </div>
        )}

        {/* ── Loading State ── */}
        {loading && !weather && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="text-muted-foreground/40 animate-spin" />
            <p className="text-sm text-muted-foreground">
              {usingGps ? 'Getting your location…' : 'Loading weather data…'}
            </p>
          </div>
        )}

        {/* Zip prompt replaces the no-location panel; keep it for other empty results. */}
        {!loading && !weather && !showSetZipPrompt && (
          <WeatherNoLocation />
        )}

        {/* ── Weather Content: what it is doing now, whether to spray, what is coming ── */}
        {weather && (
          <>
            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
              <div className="space-y-3">
                <CurrentConditionsCard weather={weather} />

                {!weather.isError && (
                  <SprayDecisionMatrix
                    tempF={weather.temp}
                    humidity={weather.humidity}
                    windSpeed={weather.wind}
                    windDirection={weather.windDirection}
                    precipProb={weather.precipProb}
                  />
                )}

                {coords ? (
                  <RadarEmbed latitude={coords.lat} longitude={coords.lng} lastUpdated={lastUpdated} />
                ) : (
                  <section className="rounded-2xl border border-border bg-card px-4 py-3.5">
                    <h2 className="text-base font-bold text-foreground">Radar</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Radar needs a map position. Use your current location or add coordinates to a field.
                    </p>
                  </section>
                )}
              </div>

              <ForecastGrid days={weather.forecastDays} />
            </div>

            <footer className="space-y-1 px-1 py-2 text-center text-xs text-muted-foreground">
              {lastUpdated && (
                <p>
                  Updated <span className="font-mono">{lastUpdated}</span>. Refreshes every 15 minutes while this page is open.
                </p>
              )}
              <p>Conditions and forecast from Visual Crossing. Field rainfall from NOAA radar estimates. Radar map by Windy.</p>
            </footer>
          </>
        )}
      </main>

    </div>
  );
}

// ── Current Conditions Card ──

export function CurrentConditionsCard({ weather }: { weather: ExtendedWeatherData }) {
  const isError = !!weather.isError;
  const isRain = weather.isRainingNow;
  const ConditionIcon = getWeatherLucideIcon(weather.icon, weather.precipProb, weather.isRainingNow);
  const calendarBasis = weather.rainfallBasis === 'calendar';
  const gusty = !isError && weather.gusts >= WIND_ALERT_MPH && weather.gusts > weather.wind;
  const sunrise = formatClockTime(weather.sunrise);
  const sunset = formatClockTime(weather.sunset);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Current conditions">
      {/* Now: temperature on the left, wind on the right */}
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {!isError && (
              <ConditionIcon size={34} aria-hidden="true" className={`shrink-0 ${isRain ? 'text-secondary' : 'text-accent'}`} />
            )}
            <span className="font-mono text-6xl font-bold leading-none tracking-tighter text-foreground">
              {isError ? '—' : `${weather.temp}°`}
            </span>
          </div>
          {!isError && (
            <p className="mt-2 text-sm font-semibold text-foreground">
              {isRain ? 'Raining now' : (weather.conditions || 'Current conditions')}
            </p>
          )}
          {isError ? (
            <p className="mt-2 text-sm text-muted-foreground">Current conditions did not load. Refresh to try again.</p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Feels like <span className="font-mono">{weather.feelsLike}°</span>
            </p>
          )}
        </div>

        <div data-stat="wind" className="flex shrink-0 flex-col items-center">
          <WindDial speed={isError ? null : weather.wind} direction={isError ? '' : weather.windDirection} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            <span className="sr-only">Wind </span>
            {isError || !weather.windDirection || weather.windDirection === '—'
              ? 'Wind'
              : weather.windDirection === 'CALM'
                ? 'Calm'
                : <>From <span className="font-mono font-semibold text-foreground">{weather.windDirection}</span></>}
          </p>
          <p data-stat="gust" className={`text-xs ${gusty ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
            Gusts <span className="font-mono">{isError ? '—' : weather.gusts}</span>{!isError && ' mph'}
          </p>
        </div>
      </div>

      {/* Air */}
      <dl className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60">
        <Stat label="Humidity" value={isError ? '—' : `${weather.humidity}%`} />
        <Stat label="Dew point" value={isError ? '—' : `${weather.dewPoint}°`} />
        <Stat label="Rain chance" value={isError ? '—' : `${weather.precipProb}%`} />
      </dl>

      {/* Rain that already fell */}
      <div className="border-t border-border/60 px-4 pb-3 pt-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-foreground">Rainfall</h2>
          {!isError && (
            <p className="text-xs text-muted-foreground">
              {calendarBasis ? 'Area estimate, completed days' : 'Radar estimate at your field'}
            </p>
          )}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <RainCell label={calendarBasis ? 'Yesterday' : '24h'} value={weather.precip24h} isError={isError} />
          <RainCell label={calendarBasis ? 'Last 3 days' : '72h'} value={weather.precip72h} isError={isError} />
          <RainCell label={calendarBasis ? 'Last 7 days' : '7d'} value={weather.precip168h} isError={isError} />
        </div>
      </div>

      {/* Daylight */}
      {(sunrise || sunset) && (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sunrise size={14} aria-hidden="true" />
            Sunrise <span className="font-mono font-semibold text-foreground">{sunrise || '—'}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Sunset size={14} aria-hidden="true" />
            Sunset <span className="font-mono font-semibold text-foreground">{sunset || '—'}</span>
          </span>
        </div>
      )}
    </section>
  );
}

/**
 * Compass ring with the wind speed in the middle. The arrowhead sits on the
 * side the wind is blowing toward, which is where spray drift goes.
 */
function WindDial({ speed, direction }: { speed: number | null; direction: string }) {
  const hasDirection = Boolean(direction) && direction !== '—' && direction !== 'CALM';
  const strong = speed != null && speed > WIND_ALERT_MPH;

  return (
    <div
      className="relative h-[5.25rem] w-[5.25rem]"
      role="img"
      aria-label={speed == null ? 'Wind unavailable' : `Wind ${speed} miles per hour${hasDirection ? ` from ${direction}` : ''}`}
    >
      <svg viewBox="0 0 84 84" className="h-full w-full" aria-hidden="true">
        <circle cx="42" cy="42" r="35" fill="none" strokeWidth="2" className="stroke-border" />
        {/* North tick */}
        <line x1="42" y1="3" x2="42" y2="11" strokeWidth="2" strokeLinecap="round" className="stroke-muted-foreground" />
        {hasDirection && (
          <g
            style={{ transform: `rotate(${getDownwindRotation(direction)}deg)`, transformOrigin: '42px 42px' }}
            className={`transition-transform duration-500 motion-reduce:transition-none ${strong ? 'fill-amber-600 dark:fill-amber-400' : 'fill-primary'}`}
          >
            <path d="M42 1 L49.5 14 L34.5 14 Z" />
            <circle cx="42" cy="77" r="3" />
          </g>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold leading-none text-foreground">{speed == null ? '—' : speed}</span>
        <span className="mt-0.5 text-xs leading-none text-muted-foreground">mph</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-bold text-foreground">{value}</dd>
    </div>
  );
}

function RainCell({ label, value, isError = false }: { label: string; value: number | null; isError?: boolean }) {
  const hasRain = !isError && value != null && value > 0;
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${hasRain ? 'bg-secondary/10' : 'bg-muted/40'}`}>
      <p className={`font-mono text-xl font-bold leading-tight ${hasRain ? 'text-secondary' : 'text-foreground'}`}>
        {isError ? '—' : formatRainInches(value)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
