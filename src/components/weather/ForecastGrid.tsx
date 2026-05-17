import { ForecastDay } from '@/types/weather';
import { Cloud, Droplets } from 'lucide-react';

interface ForecastGridProps {
  days: ForecastDay[];
}

function getWeatherEmoji(chance: number, precip: number): string {
  if (precip > 0.5 || chance > 70) return '🌧️';
  if (precip > 0 || chance > 20) return '🌦️';
  return '☀️';
}

function getDayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'TOD';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function ForecastDayCell({ day, index }: { day: ForecastDay; index: number }) {
  const isToday = index === 0;
  const label = getDayLabel(day.date, index);
  const rainChance = day.rainChance ?? 0;
  const precipIn = day.precipIn ?? 0;
  const rainActive = rainChance > 30 || precipIn > 0;
  const emoji = getWeatherEmoji(rainChance, precipIn);
  const rainFill = Math.min(rainChance, 100);

  return (
    <div
      className={`flex flex-col items-center py-2 px-1 rounded-xl ${
        isToday
          ? 'bg-blue-500/10 border border-blue-500/20'
          : rainActive
            ? 'bg-blue-500/5 border border-blue-500/10'
            : 'bg-muted/30 border border-transparent'
      }`}
    >
      <span className={`text-[10px] font-bold tracking-wider leading-none mb-1.5 ${
        isToday ? 'text-blue-400' : 'text-muted-foreground'
      }`}>
        {label}
      </span>
      <span className="text-base leading-none mb-1">{emoji}</span>
      <span className={`text-[11px] font-bold font-mono leading-none mb-1 ${
        rainActive ? 'text-blue-400' : 'text-muted-foreground'
      }`}>
        {day.rainChance != null ? `${rainChance}%` : '--'}
      </span>
      <div className="w-full h-1 rounded-full bg-muted/50 mb-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            rainFill > 60 ? 'bg-blue-400' : rainFill > 30 ? 'bg-blue-500/50' : 'bg-muted-foreground/30'
          }`}
          style={{ width: `${rainFill}%` }}
        />
      </div>
      <div className="flex items-baseline gap-0.5 text-[10px] font-mono leading-none">
        <span className="font-bold text-foreground">
          {day.tempHighF != null ? `${day.tempHighF}°` : '--'}
        </span>
        <span className="font-medium text-muted-foreground">
          {day.tempLowF != null ? `${day.tempLowF}°` : '--'}
        </span>
      </div>
    </div>
  );
}

export default function ForecastGrid({ days }: ForecastGridProps) {
  if (days.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Cloud size={14} className="text-muted-foreground" />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {Math.min(days.length, 10)}-Day Forecast
          </h2>
        </div>
      </div>

      {/* Grid */}
      <div className="p-3 space-y-1">
        {days.length > 0 && (
          <div className="grid grid-cols-5 gap-1.5">
            {days.slice(0, 5).map((day, i) => (
              <ForecastDayCell key={day.date} day={day} index={i} />
            ))}
          </div>
        )}
        {days.length > 5 && (
          <div className="grid grid-cols-5 gap-1.5">
            {days.slice(5, 10).map((day, i) => (
              <ForecastDayCell key={day.date} day={day} index={i + 5} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { getWeatherEmoji };
