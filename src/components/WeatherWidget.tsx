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
    <div className="bg-card border border-border rounded-lg p-2 px-4 flex items-center justify-between gap-4 min-h-[52px]">
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        <MapPin size={16} className="text-muted-foreground shrink-0" />
        <form onSubmit={handleSubmit} className="flex-none">
          <input
            id="weatherZip"
            name="weatherZip"
            value={inputZip}
            onChange={e => { setInputZip(e.target.value); setZipError(''); }}
            placeholder="Zip..."
            className="w-16 bg-muted/50 border border-border rounded px-2 py-1 text-foreground font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            maxLength={5}
            inputMode="numeric"
          />
        </form>
        {zip && !zipError && (
          <span className="text-xs font-mono text-muted-foreground truncate hidden sm:block">
            {locationName || zip}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-foreground font-mono text-sm shrink-0">
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
    </div>
  );
}