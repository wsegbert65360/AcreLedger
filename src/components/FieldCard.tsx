import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '@/types/farm';
import { MapPin, ChevronRight, Wind, Thermometer, Loader2 } from 'lucide-react';
import { WeatherService } from '@/services/WeatherService';

interface FieldCardProps {
  field: Field;
}

export default function FieldCard({ field }: FieldCardProps) {
  const navigate = useNavigate();
  const [weather, setWeather] = useState<{ windspeed: number | null; temp: number | null; isError?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (field.lat == null || field.lng == null) return;
    
    const controller = new AbortController();
    setLoading(true);
    WeatherService.fetchFieldConditions(field.lat, field.lng, controller.signal)
      .then(data => {
        setWeather(data);
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[FieldCard] error fetching weather:', err);
          setLoading(false);
        }
      });
      
    return () => controller.abort();
  }, [field.lat, field.lng]);

  return (
    <div 
      onClick={() => navigate(`/field/${field.id}`)}
      className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.98]"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <MapPin size={20} />
        </div>
        <div>
          <h3 className="font-bold text-foreground">{field.name}</h3>
          <div className="flex items-center gap-1 text-muted-foreground font-mono text-xs mt-0.5">
            {field.acreage} ac
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-xs">
          {loading ? (
             <Loader2 size={14} className="text-muted-foreground animate-spin" />
          ) : weather && !weather.isError ? (
            <>
              {weather.windspeed != null && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Wind size={12} className="text-spray" />
                  {Math.round(weather.windspeed)} <span className="text-[9px]">mph</span>
                </span>
              )}
              {weather.temp != null && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Thermometer size={12} className="text-destructive" />
                  {Math.round(weather.temp)}°
                </span>
              )}
            </>
          ) : null}
        </div>
        <ChevronRight size={20} className="text-muted-foreground/50" />
      </div>
    </div>
  );
}
