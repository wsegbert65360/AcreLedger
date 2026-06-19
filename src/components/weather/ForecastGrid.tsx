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
  const rainActive = rainChance > 20 || precipIn > 0;
  const WeatherIcon = getWeatherLucideIcon(day.icon, day.rainChance ?? 0, false);

  // Range bar positioning
  const low = day.tempLowF ?? minTemp;
  const high = day.tempHighF ?? maxTemp;
  const leftPercent = tempRange > 0 ? ((low - minTemp) / tempRange) * 100 : 0;
  const rightPercent = tempRange > 0 ? ((high - minTemp) / tempRange) * 100 : 100;
  const barWidth = Math.max(rightPercent - leftPercent, 4);

  return (
    <div
      className={`flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors ${
        isToday
          ? 'bg-blue-500/10 border border-blue-500/20'
          : rainActive
            ? 'bg-blue-500/5 border border-blue-500/10'
            : 'hover:bg-muted/30 border border-transparent'
      }`}
    >
      {/* 1. Day & Date */}
      <div className="w-14 shrink-0 flex flex-col">
        <span className={`text-xs font-bold leading-tight ${isToday ? 'text-blue-400' : 'text-foreground'}`}>
          {dayName}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/80 leading-none mt-0.5">
          {dateStr}
        </span>
      </div>

      {/* 2. Condition Icon & Description */}
      <div className="flex-1 flex items-center gap-2 min-w-0 px-1">
        <WeatherIcon
          size={16}
          className={`shrink-0 ${
            isToday
              ? 'text-blue-400'
              : rainActive
                ? 'text-blue-400'
                : 'text-muted-foreground/80'
          }`}
        />
        <span className="text-[10px] text-muted-foreground/80 font-medium capitalize truncate hidden min-[360px]:inline">
          {day.conditions || '—'}
        </span>
      </div>

      {/* 3. Ag Compliance Metrics (Rain & Wind) */}
      <div className="flex items-center gap-2 shrink-0 px-2">
        {/* Rain Chance */}
        <div className="flex items-center gap-0.5 w-10 justify-end">
          {rainChance > 0 ? (
            <>
              <CloudRain size={10} className={rainActive ? 'text-blue-400' : 'text-muted-foreground/50'} />
              <span className={`text-[10px] font-mono font-bold ${rainActive ? 'text-blue-400' : 'text-muted-foreground/70'}`}>
                {rainChance}%
              </span>
            </>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground/30">—</span>
          )}
        </div>

        {/* Wind Speed (Agricultural application warning threshold) */}
        <div className="flex items-center gap-0.5 w-14 justify-end">
          {windSpeed > 0 ? (
            <>
              <Wind size={10} className={isHighWind ? 'text-amber-500' : 'text-muted-foreground/50'} />
              <span
                className={`text-[10px] font-mono font-bold ${
                  isHighWind ? 'text-amber-500 font-semibold' : 'text-muted-foreground/70'
                }`}
                title={isHighWind ? 'Wind is above 10 mph (spraying warning)' : undefined}
              >
                {windSpeed} mph
              </span>
            </>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground/30">—</span>
          )}
        </div>
      </div>

      {/* 4. Temps & Apple-style Temperature Range Track */}
      <div className="flex items-center gap-1.5 shrink-0 w-24 sm:w-44 justify-end">
        <span className="text-[11px] font-mono font-medium text-muted-foreground w-7 text-right">
          {day.tempLowF != null ? `${day.tempLowF}°` : '--'}
        </span>

        {/* Apple Weather Style Range Bar */}
        <div className="relative flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden shrink-0 hidden sm:block">
          <div
            className="absolute h-full rounded-full bg-gradient-to-r from-blue-400 via-amber-400 to-orange-400"
            style={{
              left: `${leftPercent}%`,
              width: `${barWidth}%`
            }}
          />
        </div>

        <span className="text-[11px] font-mono font-bold text-foreground w-7 text-right">
          {day.tempHighF != null ? `${day.tempHighF}°` : '--'}
        </span>
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
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
