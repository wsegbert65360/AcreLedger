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
  const [lastUpdated, setLastUpdated] = useState<string>('');
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
        setLastUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
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
      setZipError('Enter a valid 5 or 9-digit zip code');
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
    <div className="bg-card border border-border rounded-lg p-3 px-4 flex flex-col gap-2 min-h-[52px] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <MapPin size={16} className="text-muted-foreground shrink-0" />
        <form onSubmit={handleSubmit} className="flex-none">
          <input
            id="weatherZip"
            name="weatherZip"
            value={inputZip}
            onChange={e => { setInputZip(e.target.value); setZipError(''); }}
            placeholder="Zip..."
            className="w-20 bg-muted/50 border border-border rounded px-2 py-1 text-foreground font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            maxLength={10}
            inputMode="numeric"
          />
        </form>
        {zip && !zipError && (
          <span className="text-xs font-mono text-muted-foreground truncate">
            {locationName || zip}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-foreground font-mono text-sm w-full sm:w-auto sm:justify-end">
        {weather.isError ? (
          <span className="text-destructive text-xs">Offline</span>
        ) : (
          <>
            <span className="flex items-center gap-1.5 bg-destructive/5 px-2 py-1 rounded-md border border-destructive/10">
              <Thermometer size={14} className="text-destructive" />
              <span className="font-bold">{weather.temp}°F</span>
            </span>
            <span className="flex items-center gap-1.5 bg-spray/5 px-2 py-1 rounded-md border border-spray/10">
              <Wind size={14} className="text-spray" />
              <span className="font-bold">{weather.wind} <span className="text-[10px] opacity-70">MPH</span></span>
            </span>
            {hasPrecip && (
              <span className="flex items-center gap-1.5 bg-spray/10 px-2 py-1 rounded-md border border-spray/20 text-spray font-black">
                <Droplets size={14} />
                {weather.precip24h}"
              </span>
            )}
          </>
        )}
        {loading && <Loader2 size={14} className="text-primary animate-spin" />}
      </div>

      {zip && !zipError && lastUpdated && !weather.isError && (
        <div className="text-xs text-muted-foreground font-mono sm:hidden">
          Updated {lastUpdated}
        </div>
      )}
    </div>
  );
}
