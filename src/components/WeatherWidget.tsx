import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ArrowUp, ChevronRight, Loader2, MapPin } from 'lucide-react';

import WeatherLocationSearch from '@/components/weather/WeatherLocationSearch';
import WeatherNoLocation from '@/components/weather/WeatherNoLocation';
import { isNativePlatform } from '@/lib/native';
import {
  formatRainInches,
  getDownwindRotation,
  loadCachedWeatherCoords,
  loadZip,
  matchFieldByCoords,
  resolveCoords,
  saveZip,
  parseWeatherLocationInput,
} from '@/lib/weatherHelpers';
import { RainService } from '@/services/RainService';
import { RainfallDailyService } from '@/services/RainfallDailyService';
import { useEntitlement } from '@/hooks/useEntitlement';
import { isFreeTierLocked } from '@/lib/entitlements';
import { WeatherService } from '@/services/WeatherService';
import { useFarm } from '@/store/farmStore';
import { WeatherData } from '@/types/weather';

function initialWeather(): WeatherData {
  return { wind: 0, temp: 0, humidity: 0, windDirection: '—', precip24h: 0, precip72h: 0, precipProb: 0 };
}

export default function WeatherBar() {
  const { session, fields, initialFetchComplete } = useFarm();
  const userId = session?.user?.id;
  const navigate = useNavigate();

  const [locationStatus, setLocationStatus] = useState<'resolving' | 'resolved' | 'none'>('resolving');
  const [zip, setZip] = useState<string>('');
  const [inputZip, setInputZip] = useState('');
  const [usingCoords, setUsingCoords] = useState(false);
  const [zipError, setZipError] = useState('');
  const [weather, setWeather] = useState<WeatherData>(initialWeather());
  const [locationName, setLocationName] = useState('');

  const [loading, setLoading] = useState(false);
  // True once the first valid weather result has arrived. Keeps placeholders
  // from flashing on the initial load or a retry.
  const [hasData, setHasData] = useState(false);
  const hasDataRef = useRef(false);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const { entitlement } = useEntitlement();
  const rainLocked = isFreeTierLocked(entitlement);
  const rainLockedRef = useRef(false);
  rainLockedRef.current = rainLocked;
  // Whether the last load already used the free-plan (daily) path.
  const loadedLockedRef = useRef(false);

  const firstFieldWithCoords = fields.find(f => f.lat != null && f.lng != null);
  const fieldCoordsKey = firstFieldWithCoords && firstFieldWithCoords.lat != null && firstFieldWithCoords.lng != null
    ? `${firstFieldWithCoords.lat},${firstFieldWithCoords.lng}`
    : '';

  useEffect(() => {
    const saved = loadZip(userId);
    if (saved) {
      setLocationStatus('resolved');
      setZip(saved);
      setInputZip(saved);
      return;
    }

    const fieldWithCoords = fieldsRef.current.find(f => f.lat != null && f.lng != null);
    if (fieldWithCoords && fieldWithCoords.lat != null && fieldWithCoords.lng != null) {
      setLocationStatus('resolved');
      setZip(`${fieldWithCoords.lat.toFixed(4)},${fieldWithCoords.lng.toFixed(4)}`);
      setInputZip('');
      setUsingCoords(true);
      return;
    }

    const cached = loadCachedWeatherCoords();
    if (cached) {
      setLocationStatus('resolved');
      setZip(`${cached.lat},${cached.lon}`);
      setInputZip('');
      setUsingCoords(true);
    }

    // Wait for fields to hydrate before a live GPS read so Safari is not
    // prompted on every launch while `fields` is still the empty first paint.
    if (!initialFetchComplete) {
      if (!cached) setLocationStatus('resolving');
      return;
    }

    // Native geolocation stays on the weather page's existing Capacitor call.
    // The dashboard card must not start a second fix on every launch.
    if (isNativePlatform()) {
      if (!cached) setLocationStatus('none');
      return;
    }

    if (!cached) setLocationStatus('resolving');
    let cancelled = false;
    resolveCoords(fieldsRef.current, saved).then(({ lat, lng, locationString }) => {
      if (cancelled) return;
      if (!locationString) {
        if (!cached) setLocationStatus('none');
        return;
      }
      setLocationStatus('resolved');
      setZip(locationString);
      if (lat !== 0 && lng !== 0) {
        setInputZip('');
        setUsingCoords(true);
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (!cached) setLocationStatus('none');
      console.error('[WeatherWidget] Failed to resolve location:', error);
    });
    return () => { cancelled = true; };
  }, [userId, fieldCoordsKey, initialFetchComplete]);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (z: string) => {
    if (!z.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadedLockedRef.current = rainLockedRef.current;

    setLoading(true);
    try {
      const result = await WeatherService.fetchCurrentWeather(z.trim(), controller.signal);
      if (controller.signal.aborted) return;

      if (result.isError) {
        if (!hasDataRef.current) {
          setWeather(result);
          setLocationName('');
        }
        return;
      }

      if (controller.signal.aborted) return;

      // Commit Visual Crossing weather first so a zip load is not blocked on fields/radar.
      setWeather(result);
      setHasData(true);
      hasDataRef.current = true;
      setLocationName(result.locationName || '');

      const lat = result.latitude;
      const lng = result.longitude;

      if (lat == null || lng == null) return;

      try {
        const fieldId = matchFieldByCoords(fieldsRef.current, lat, lng);
        // The Rain API refuses coordinate-only requests. An unmatched location
        // keeps the weather-service precipitation totals (no error toast).
        // Free plan: daily totals for a matched slot field; no live Rain API.
        if (!fieldId) return;
        const rainData = rainLockedRef.current
          ? await RainfallDailyService.fetchRainfallFromDaily({ fieldId })
          : await RainService.fetchComprehensiveRainfall({
              fieldId,
              lat,
              lng,
              signal: controller.signal,
            });
        if (controller.signal.aborted) return;
        setWeather(prev => ({
          ...prev,
          precip24h: rainData['24h'],
          precip72h: rainData['72h'],
          rainfallBasis: 'rolling',
        }));
      } catch (rainErr) {
        if ((rainErr as { name?: string })?.name === 'AbortError' || controller.signal.aborted) return;
        console.error('[WeatherWidget] Failed to fetch high-res radar rainfall:', rainErr);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError' || controller.signal.aborted) return;
      if (!hasDataRef.current) {
        setWeather({ ...initialWeather(), isError: true });
        setLocationName('');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Pull once per launch (zip resolution) and on explicit location change.
  // No background polling: repeated 5-min refreshes exhausted the Visual
  // Crossing daily quota, so a page left open keeps its loaded values.
  useEffect(() => {
    if (!zip) return;
    load(zip);
    return () => {
      abortRef.current?.abort();
    };
  }, [zip, load]);

  // The plan can resolve after the first load already ran on the live Rain API path (review item 4).
  // Reload once when it turns out to be a free farm so it does not keep live hourly numbers.
  useEffect(() => {
    if (rainLocked && !loadedLockedRef.current && zip) void load(zip);
  }, [rainLocked, zip, load]);

  const submitLocation = (raw: string) => {
    const parsed = parseWeatherLocationInput(raw);
    if (!parsed.ok) {
      setZipError(parsed.error);
      return;
    }
    const z = parsed.value;
    setZipError('');
    setLocationName('');
    setWeather(initialWeather());
    setHasData(false);
    hasDataRef.current = false;
    saveZip(z, userId);
    setZip(z);
    setLocationStatus('resolved');
    setUsingCoords(!!parsed.coords);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitLocation(inputZip);
  };

  const weatherUnavailable = Boolean(weather.isError && !hasData);
  const showValues = hasData && !weather.isError;
  const rainChance = weather.precipProb ?? 0;

  const handleBarActivate = () => {
    if (weatherUnavailable) {
      load(zip);
      return;
    }
    navigate('/weather');
  };

  if (locationStatus === 'none' && !zip) {
    return (
      <div id="coachmark-weather" className="group relative min-h-[96px] overflow-hidden rounded-2xl border border-border/70 bg-card/90 p-3 shadow-sm min-[380px]:p-4">
        <WeatherNoLocation compact description="Enter a zip code or coordinates, allow location access, or add field coordinates.">
          <WeatherLocationSearch inputId="weatherZipEmpty" value={inputZip} onChange={value => { setInputZip(value); setZipError(''); }} onSubmit={submitLocation} error={zipError} />
        </WeatherNoLocation>
      </div>
    );
  }

  return (
    <div
      id="coachmark-weather"
      className="group relative flex min-h-[96px] cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-2xl border border-border/70 bg-card/90 p-3 shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.985] min-[380px]:p-4"
      onClick={handleBarActivate}
      role="button"
      tabIndex={0}
      aria-label={weatherUnavailable ? 'Weather unavailable, tap to retry' : 'Open weather'}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleBarActivate();
        }
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-14 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />

      {/* Left: temperature and where it is for */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="font-mono text-3xl font-bold leading-none tracking-tight min-[420px]:text-4xl">
          {showValues ? `${weather.temp}°F` : '—'}
        </span>
        {weatherUnavailable && (
          <span className="mt-1 whitespace-nowrap text-xs font-medium leading-snug text-muted-foreground">
            No weather. Tap to retry.
          </span>
        )}
        {!hasData && !weather.isError && (
          <span className="mt-1 text-xs font-semibold text-muted-foreground">Loading…</span>
        )}
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
          <MapPin size={12} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="flex min-w-0 flex-1 items-center">
            <label htmlFor="weatherZip" className="sr-only">Zip code or coordinates</label>
            <input
              id="weatherZip"
              name="weatherZip"
              value={usingCoords ? (locationName || zip) : inputZip}
              onChange={e => { setInputZip(e.target.value); setZipError(''); setUsingCoords(false); }}
              placeholder={usingCoords ? 'Auto' : 'Zip code'}
              className="w-full min-w-0 max-w-36 truncate border-none bg-transparent p-0 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0"
              maxLength={40}
            />
          </form>
        </div>
      </div>

      {/* Right: the numbers that decide field work */}
      <dl className="flex shrink-0 items-start gap-2.5 min-[380px]:gap-3.5 sm:gap-8">
        <div className="flex flex-col items-center">
          <dd className="order-1 flex items-center gap-1 whitespace-nowrap">
            <span className="font-mono text-lg font-bold">{showValues ? weather.wind : '—'}</span>
            {showValues && <span className="text-xs text-muted-foreground">mph</span>}
            {showValues && weather.windDirection && weather.windDirection !== '—' && weather.windDirection !== 'CALM' && (
              <ArrowUp
                size={13}
                aria-hidden="true"
                className="text-primary transition-transform duration-500 motion-reduce:transition-none"
                style={{ transform: `rotate(${getDownwindRotation(weather.windDirection)}deg)` }}
              />
            )}
          </dd>
          <dt className="order-2 text-xs text-muted-foreground">
            {showValues && weather.windDirection && weather.windDirection !== '—'
              ? (weather.windDirection === 'CALM' ? 'Calm' : <>From <span className="font-mono font-semibold text-foreground">{weather.windDirection}</span></>)
              : 'Wind'}
          </dt>
        </div>

        <div className="hidden flex-col items-center sm:flex">
          <dd className="order-1 font-mono text-lg font-bold">{showValues ? `${weather.humidity}%` : '—'}</dd>
          <dt className="order-2 text-xs text-muted-foreground">Humidity</dt>
        </div>

        <div className="flex flex-col items-center max-[359px]:hidden">
          <dd className="order-1 font-mono text-lg font-bold">
            {showValues ? formatRainInches(weather.precip24h) : '—'}
          </dd>
          <dt className="order-2 text-xs text-muted-foreground">{weather.rainfallBasis === 'calendar' ? 'Yesterday' : 'Rain 24h'}</dt>
        </div>

        <div className="flex flex-col items-center">
          <dd className={`order-1 font-mono text-lg font-bold ${showValues && rainChance >= 40 ? 'text-secondary' : ''}`}>
            {showValues ? `${rainChance}%` : '—'}
          </dd>
          <dt className="order-2 text-xs text-muted-foreground">Rain chance</dt>
        </div>
      </dl>

      <ChevronRight size={16} aria-hidden="true" className="hidden shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground sm:block" />

      {loading && (
        <div className="absolute top-2 right-2">
          <Loader2 size={12} className="text-primary animate-spin opacity-50" />
        </div>
      )}

      {zipError && (
        <div className="absolute bottom-1 left-4 text-xs font-medium text-destructive" role="alert">
          {zipError}
        </div>
      )}
    </div>
  );
}
