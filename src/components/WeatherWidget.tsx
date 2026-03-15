import { Wind, Thermometer, Droplets, MapPin, Loader2 } from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { WeatherService } from '@/services/WeatherService';
import { WeatherData } from '@/types/weather';
import { useFarm } from '@/store/farmStore';

const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

function initialWeather(): WeatherData {
  return { wind: 0, temp: 0, humidity: 0, windDirection: '—', precip24h: 0, precip72h: 0 };
}

function loadZip(userId?: string): string {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    return localStorage.getItem(key) || '';
  } catch { return ''; }
}

function saveZip(zip: string, userId?: string) {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    localStorage.setItem(key, zip);
  } catch { /* ignore */ }
}

export default function WeatherBar() {
  const { session } = useFarm();
  const userId = session?.user?.id;

  // Don't seed from localStorage until userId is known — avoids reading the
  // wrong key during the async session hydration window.
  const [zip, setZip] = useState<string>('');
  const [inputZip, setInputZip] = useState('');
  const [zipError, setZipError] = useState('');
  const [weather, setWeather] = useState<WeatherData>(initialWeather());
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync zip from localStorage once userId is stable
  useEffect(() => {
    const saved = loadZip(userId);
    setZip(saved);
    setInputZip(saved);
  }, [userId]);

  // Abort controller ref to cancel in-flight requests on new submission
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (z: string) => {
    if (!z.trim()) return;

    // Cancel any previous in-flight fetch
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const result = await WeatherService.fetchCurrentWeather(z.trim(), controller.signal);
      if (!controller.signal.aborted) {
        setWeather(result);
        setLocationName(result.locationName || '');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!zip) return;
    load(zip);
    const interval = setInterval(() => load(zip), 300_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [zip, load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const z = inputZip.trim();

    if (!ZIP_REGEX.test(z)) {
      setZipError('Enter a valid 5-digit zip code');
      return;
    }

    setZipError('');
    setLocationName('');      // clear stale city name immediately
    setWeather(initialWeather());
    setZip(z);
    saveZip(z, userId);
  };

  const hasPrecip =
    !weather.isError &&
    weather.precip24h != null &&
    weather.precip24h > 0;

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <MapPin size={16} className="text-muted-foreground shrink-0" />
        <input
          id="weatherZip"
          name="weatherZip"
          value={inputZip}
          onChange={e => { setInputZip(e.target.value); setZipError(''); }}
          placeholder="Enter zip code..."
          className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={10}
          inputMode="numeric"
          aria-label="Zip code"
        />
        <button
          type="submit"
          className="px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-md font-mono text-xs font-bold hover:bg-primary/20 transition-colors"
        >
          Set
        </button>
        {loading && <Loader2 size={16} className="text-primary animate-spin shrink-0" aria-label="Loading weather" />}
      </form>

      {zipError && (
        <p className="text-xs font-mono text-destructive px-1">{zipError}</p>
      )}

      {zip && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">
            {locationName || zip}
            {loading && <span className="ml-1 opacity-50">(updating…)</span>}
          </span>
          {weather.isError ? (
            <span className="text-xs font-mono text-destructive">Weather unavailable</span>
          ) : (
            <div className="flex items-center gap-4 text-foreground font-mono text-sm">
              <span className="flex items-center gap-1">
                <Wind size={14} className="text-spray" />
                {weather.wind} mph {weather.windDirection}
              </span>
              <span className="flex items-center gap-1">
                <Thermometer size={14} className="text-destructive" />
                {weather.temp}°F
              </span>
              <span className="flex items-center gap-1">
                <Droplets size={14} className="text-spray" />
                {weather.humidity}%
              </span>
            </div>
          )}
        </div>
      )}

      {hasPrecip && (
        <div className="flex items-center justify-center mt-2 pt-2 border-t border-border/50 text-xs font-mono font-bold text-spray">
          24h Rain: {weather.precip24h}in
          {weather.precip72h != null && <> | 72h Rain: {weather.precip72h}in</>}
        </div>
      )}

      {!zip && (
        <p className="text-xs font-mono text-muted-foreground text-center">
          Enter a zip code for live weather
        </p>
      )}
    </div>
  );
}