import { Cloud, CloudRain, Wind } from 'lucide-react';

import { getWeatherLucideIcon } from '@/lib/weatherHelpers';
import { ForecastDay } from '@/types/weather';

interface ForecastGridProps {
  days: ForecastDay[];
}

function getDayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'TOD';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function getFormattedDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ForecastDayRow({
  day,
  index,
  minTemp,
  maxTemp,
  tempRange
}: {
  day: ForecastDay;
  index: number;
  minTemp: number;
  maxTemp: number;
  tempRange: number;
}) {
  const isToday = index === 0;
  const dayName = getDayLabel(day.date, index);
  const dateStr = getFormattedDate(day.date);
  const rainChance = day.rainChance ?? 0;
  const precipIn = day.precipIn ?? 0;
  const windSpeed = day.windSpeed ?? 0;
  const isHighWind = windSpeed >= 10; // WIND_ALERT_MPH = 10
  const hasRainChance = rainChance > 0;
  const highRainChance = rainChance >= 40;
  const rainActive = hasRainChance || precipIn > 0;
  const WeatherIcon = getWeatherLucideIcon(day.icon, day.rainChance ?? 0, false);

  // Range bar positioning
  const low = day.tempLowF ?? minTemp;
  const high = day.tempHighF ?? maxTemp;
  const leftPercent = tempRange > 0 ? ((low - minTemp) / tempRange) * 100 : 0;
  const rightPercent = tempRange > 0 ? ((high - minTemp) / tempRange) * 100 : 100;
  const barWidth = Math.max(rightPercent - leftPercent, 4);

  return (
    <div
      className={`grid grid-cols-[3.5rem_minmax(0,1fr)_5rem] items-center gap-x-2 gap-y-2 rounded-xl border px-3 py-3 transition-colors ${
        highRainChance
          ? 'border-blue-500/40 bg-blue-500/15'
          : isToday
            ? 'border-blue-500/20 bg-blue-500/10'
            : rainActive
              ? 'border-cyan-500/20 bg-cyan-500/5'
              : 'border-transparent hover:bg-muted/30'
      }`}
    >
      {/* 1. Day & Date */}
      <div className="flex min-w-0 flex-col">
        <span className={`text-sm font-bold leading-tight ${isToday ? 'text-blue-600 dark:text-blue-300' : 'text-foreground'}`}>
          {dayName}
        </span>
        <span className="mt-1 font-mono text-xs leading-none text-muted-foreground">
          {dateStr}
        </span>
      </div>

      {/* 2. Condition Icon & Description */}
      <div className="flex min-w-0 items-center gap-2">
        <WeatherIcon
          size={20}
          className={`shrink-0 ${
            highRainChance
              ? 'text-blue-600 dark:text-blue-300'
              : rainActive
                ? 'text-cyan-700 dark:text-cyan-300'
                : isToday
                  ? 'text-blue-600 dark:text-blue-300'
                : 'text-muted-foreground/80'
          }`}
        />
        <span className="line-clamp-2 text-xs font-medium capitalize leading-snug text-muted-foreground min-[380px]:text-sm">
          {day.conditions || '—'}
        </span>
      </div>

      {/* 3. Temperatures */}
      <div className="flex items-center justify-end gap-2">
        <span className="font-mono text-sm font-medium text-muted-foreground">
          {day.tempLowF != null ? `${day.tempLowF}°` : '--'}
        </span>
        <span className="font-mono text-base font-bold text-foreground">
          {day.tempHighF != null ? `${day.tempHighF}°` : '--'}
        </span>
      </div>

      {/* 4. Rain, Wind & Temperature Range */}
      <div className="col-span-3 flex min-w-0 items-center gap-2 border-t border-border/40 pt-2">
        <div
          data-rain-tier={highRainChance ? 'high' : hasRainChance ? 'low' : 'none'}
          className={`flex min-h-8 items-center gap-1 rounded-lg border px-2 font-mono text-xs font-bold ${
            highRainChance
              ? 'border-blue-500/50 bg-blue-500/25 text-blue-800 shadow-sm dark:text-blue-200'
              : hasRainChance
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200'
                : 'border-border/50 bg-muted/30 text-muted-foreground'
          }`}
        >
          <CloudRain size={14} />
          <span>{hasRainChance ? `${rainChance}% rain` : 'No rain'}</span>
        </div>

        <div className={`flex min-h-8 items-center gap-1 rounded-lg border border-border/50 bg-muted/30 px-2 font-mono text-xs font-bold ${
          isHighWind ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground'
        }`}>
          <Wind size={14} />
          <span title={isHighWind ? 'Wind is at or above 10 mph (spraying warning)' : undefined}>
            {windSpeed > 0 ? `${windSpeed} mph` : 'No wind'}
          </span>
        </div>

        {/* Apple Weather Style Range Bar */}
        <div className="relative ml-auto hidden h-2 min-w-20 flex-1 overflow-hidden rounded-full bg-muted/60 sm:block">
          <div
            className="absolute h-full rounded-full bg-gradient-to-r from-blue-400 via-amber-400 to-orange-400"
            style={{
              left: `${leftPercent}%`,
              width: `${barWidth}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ForecastGrid({ days }: ForecastGridProps) {
  if (days.length === 0) return null;

  // Compute absolute min and max temperatures to scale ranges
  const tempLows = days.map(d => d.tempLowF).filter((t): t is number => t !== null);
  const tempHighs = days.map(d => d.tempHighF).filter((t): t is number => t !== null);
  const minTemp = tempLows.length > 0 ? Math.min(...tempLows) : 32;
  const maxTemp = tempHighs.length > 0 ? Math.max(...tempHighs) : 100;
  const tempRange = maxTemp - minTemp || 1;

  const displayDays = days.slice(0, 10);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Cloud size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {displayDays.length}-Day Forecast
          </h2>
        </div>
      </div>

      {/* Vertical List */}
      <div className="p-2.5 flex flex-col gap-1">
        {displayDays.map((day, i) => (
          <ForecastDayRow
            key={day.date}
            day={day}
            index={i}
            minTemp={minTemp}
            maxTemp={maxTemp}
            tempRange={tempRange}
          />
        ))}
      </div>
    </div>
  );
}
