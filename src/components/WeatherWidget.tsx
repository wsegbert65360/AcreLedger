import { Wind, Thermometer, Droplets, MapPin, Loader2 } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { WeatherService } from '@/services/WeatherService';
import { WeatherData } from '@/types/weather';
import { useFarm } from '@/store/farmStore';

function fallbackWeather(): WeatherData {
  return { wind: 0, temp: 0, humidity: 0, windDirection: '—', precip24h: 0, precip72h: 0 };
}

function loadZip(userId?: string): string {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    return localStorage.getItem(key) || '';
  } catch { return ''; }
}
function saveZip(zip: string, userId?: string) {
  const key = userId ? `${userId}_al_zip` : 'al_zip';
  localStorage.setItem(key, zip);
}

export default function WeatherBar() {
  const { session } = useFarm();
  const userId = session?.user?.id;
  const [zip, setZip] = useState(() => loadZip(userId));
  const [inputZip, setInputZip] = useState(zip);
  const [weather, setWeather] = useState<WeatherData>(fallbackWeather);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync zip when user changes
  useEffect(() => {
    const userZip = loadZip(userId);
    setZip(userZip);
    setInputZip(userZip);
  }, [userId]);

  const load = useCallback(async (z: string) => {
    if (!z.trim()) return;
    setLoading(true);
    const result = await WeatherService.fetchCurrentWeather(z.trim());
    setWeather(result);
    setLocationName(result.locationName || '');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (zip) load(zip);
    const interval = setInterval(() => { if (zip) load(zip); }, 300000);
    return () => clearInterval(interval);
  }, [zip, load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const z = inputZip.trim();
    if (z) {
      setZip(z);
      saveZip(z, userId);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <MapPin size={16} className="text-muted-foreground shrink-0" />
        <input
          id="weatherZip"
          name="weatherZip"
          value={inputZip}
          onChange={e => setInputZip(e.target.value)}
          placeholder="Enter zip code..."
          className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={10}
        />
        <button
          type="submit"
          className="px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-md font-mono text-xs font-bold hover:bg-primary/20 transition-colors"
        >
          Set
        </button>
        {loading && <Loader2 size={16} className="text-primary animate-spin shrink-0" />}
      </form>

      {zip && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">{locationName || zip}</span>
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

      {weather.precip24h !== undefined && weather.precip24h > 0 && !weather.isError && (
        <div className="flex items-center justify-center mt-2 pt-2 border-t border-border/50 text-xs font-mono font-bold text-spray">
          24h Rain: {weather.precip24h}in | 72h Rain: {weather.precip72h}in
        </div>
      )}

      {!zip && (
        <p className="text-xs font-mono text-muted-foreground text-center">Enter a zip code for live weather</p>
      )}
    </div>
  );
}
