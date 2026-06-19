import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ArrowUp, ChevronRight, Loader2, MapPin, Thermometer } from 'lucide-react';

import { getWindRotation, loadZip, saveZip, ZIP_REGEX } from '@/lib/weatherHelpers';
import { WeatherService } from '@/services/WeatherService';
import { useFarm } from '@/store/farmStore';
import { WeatherData } from '@/types/weather';

function initialWeather(): WeatherData {
  return { wind: 0, temp: 0, humidity: 0, windDirection: '—', precip24h: 0, precip72h: 0, precipProb: 0 };
}

export default function WeatherBar() {
  const { session, fields } = useFarm();
  const userId = session?.user?.id;
  const navigate = useNavigate();

  const [zip, setZip] = useState<string>('');
  const [inputZip, setInputZip] = useState('');
  const [usingCoords, setUsingCoords] = useState(false);
  const [zipError, setZipError] = useState('');
  const [weather, setWeather] = useState<WeatherData>(initialWeather());
  const [locationName, setLocationName] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = loadZip(userId);
    if (saved) {
      setZip(saved);
      setInputZip(saved);
    } else {
      const fieldWithCoords = fields.find(f => f.lat != null && f.lng != null);
      if (fieldWithCoords && fieldWithCoords.lat != null && fieldWithCoords.lng != null) {
        setZip(`${fieldWithCoords.lat.toFixed(4)},${fieldWithCoords.lng.toFixed(4)}`);
        setInputZip('');
        setUsingCoords(true);
      }
    }
  }, [userId, fields]);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (z: string) => {
    if (!z.trim()) return;

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

    if (!z) {
      setZipError('Enter a zip code or coordinates');
      return;
    }

    const coordsMatch = z.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
    if (!coordsMatch && !ZIP_REGEX.test(z)) {
      setZipError('Enter a valid 5 or 9-digit zip code');
      return;
    }

    setZipError('');
    setLocationName('');
    setWeather(initialWeather());
    setZip(z);
    setUsingCoords(!!coordsMatch);
    if (!coordsMatch) saveZip(z, userId);
  };

  return (
    <div
      className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between min-h-[90px] relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-transform"
      onClick={() => navigate('/weather')}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') navigate('/weather'); }}
    >
      {/* Left side: Main Temp & Location */}
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <Thermometer size={24} className="text-orange-500" />
          <div className="flex flex-col">
            <span className="text-3xl font-mono font-bold tracking-tight leading-none">
              {weather.isError ? '—' : `${weather.temp}°F`}
            </span>
            {weather.isError && <span className="text-[10px] text-destructive font-bold uppercase tracking-wider">Offline</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <MapPin size={12} className="text-emerald-500/60" />
          <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} className="flex items-center">
            <label htmlFor="weatherZip" className="sr-only">Zip code or coordinates</label>
            <input
              id="weatherZip"
              name="weatherZip"
              value={usingCoords ? (locationName || zip) : inputZip}
              onChange={e => { setInputZip(e.target.value); setZipError(''); setUsingCoords(false); }}
              placeholder={usingCoords ? 'Auto' : 'Zip...'}
              className="bg-transparent border-none p-0 text-emerald-500/60 font-mono text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-0 w-32 truncate"
              maxLength={40}
            />
          </form>
        </div>
      </div>

      {/* Right side: Secondary Stats */}
      <div className="flex items-center gap-3 sm:gap-8">
        {/* Wind */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-lg font-mono font-bold">{weather.wind}</span>
            <span className="text-xs text-muted-foreground/60 font-sans">mph</span>
            {weather.windDirection && weather.windDirection !== '—' && (
              <span className="flex items-center gap-0.5 text-xs text-foreground/80 ml-0.5">
                <ArrowUp
                  size={11}
                  className="text-emerald-500/80 transition-transform duration-500"
                  style={{ transform: `rotate(${getWindRotation(weather.windDirection)}deg)` }}
                />
                <span className="font-mono font-semibold text-[11px]">{weather.windDirection}</span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold text-emerald-500/60 tracking-wider">WIND</span>
        </div>

        {/* Humidity */}
        <div className="flex flex-col items-center">
          <span className="text-lg font-mono font-bold">{weather.humidity}%</span>
          <span className="text-[10px] font-bold text-emerald-500/60 tracking-wider">HUMIDITY</span>
        </div>

        {/* Rain Prob */}
        <div className="flex flex-col items-center">
          <span className="text-lg font-mono font-bold">{weather.precipProb}%</span>
          <span className="text-[10px] font-bold text-emerald-500/60 tracking-wider">RAIN</span>
        </div>

        {/* Navigate hint */}
        <ChevronRight size={16} className="text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors hidden sm:block" />
      </div>

      {loading && (
        <div className="absolute top-2 right-2">
          <Loader2 size={12} className="text-primary animate-spin opacity-50" />
        </div>
      )}

      {zipError && (
        <div className="absolute bottom-1 left-4 text-[10px] text-destructive">
          {zipError}
        </div>
      )}
    </div>
  );
}
