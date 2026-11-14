import { Wind } from 'lucide-react';

import { formatRainInches, getWeatherLucideIcon, WIND_ALERT_MPH } from '@/lib/weatherHelpers';
import { ForecastDay } from '@/types/weather';

interface ForecastGridProps {
  days: ForecastDay[];
}

/** Rain chance at or above this gets the strong highlight. */
const HIGH_RAIN_CHANCE = 40;

function localNoon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

function getDayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  return localNoon(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
}

function getFormattedDate(dateStr: string): string {
  return localNoon(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ROW_GRID = 'grid grid-cols-[3rem_1.25rem_minmax(0,1fr)_3.5rem_auto] items-center gap-x-2';

function ForecastDayRow({
  day,
  index,
  minTemp,
  tempRange,
}: {
  day: ForecastDay;
  index: number;
  minTemp: number;
  tempRange: number;
}) {
  const isToday = index === 0;
  const rainChance = day.rainChance ?? 0;
  const precipIn = day.precipIn ?? 0;
  const windSpeed = day.windSpeed;
  const isHighWind = (windSpeed ?? 0) >= WIND_ALERT_MPH;
  const hasRainChance = rainChance > 0;
  const highRainChance = rainChance >= HIGH_RAIN_CHANCE;
  const WeatherIcon = getWeatherLucideIcon(day.icon, rainChance, false);

  // Range bar position on the shared 10-day scale.
  const low = day.tempLowF ?? minTemp;
  const high = day.tempHighF ?? low;
  const leftPercent = tempRange > 0 ? ((low - minTemp) / tempRange) * 100 : 0;
  const barWidth = Math.max(tempRange > 0 ? ((high - low) / tempRange) * 100 : 100, 6);

  return (
    <li
      className={`${ROW_GRID} min-h-[3.25rem] rounded-lg px-2.5 py-2 ${
        highRainChance ? 'bg-secondary/10' : ''
      }`}
    >
      {/* Day and date */}
      <div className="flex min-w-0 flex-col">
        <span className={`text-sm leading-tight ${isToday ? 'font-bold text-foreground' : 'font-semibold text-foreground'}`}>
          {getDayLabel(day.date, index)}
        </span>
        <span className="mt-0.5 font-mono text-xs leading-none text-muted-foreground">
          {getFormattedDate(day.date)}
        </span>
      </div>

      {/* Sky */}
      <span className="flex" title={day.conditions || undefined}>
        <WeatherIcon
          size={20}
          aria-hidden="true"
          className={highRainChance ? 'text-secondary' : 'text-muted-foreground'}
        />
        <span className="sr-only">{day.conditions || 'Conditions unavailable'}</span>
      </span>

      {/* Rain: chance, then the expected amount */}
      <div
        data-rain-tier={highRainChance ? 'high' : hasRainChance ? 'low' : 'none'}
        className="flex min-w-0 flex-col"
      >
        <span
          className={`font-mono text-sm leading-tight ${
            highRainChance
              ? 'font-bold text-secondary'
              : hasRainChance
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground'
          }`}
        >
          {hasRainChance ? `${rainChance}%` : '—'}
          <span className="sr-only">{hasRainChance ? ' chance of rain' : 'No rain expected'}</span>
        </span>
        {precipIn > 0 && (
          <span className="mt-0.5 font-mono text-xs leading-none text-muted-foreground">
            {formatRainInches(precipIn)}
          </span>
        )}
      </div>

      {/* Wind */}
      <div
        className={`flex items-center gap-1 font-mono text-sm ${
          isHighWind ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
        }`}
        title={isHighWind ? `At or above the ${WIND_ALERT_MPH} mph spray drift warning` : undefined}
      >
        {isHighWind && <Wind size={12} aria-hidden="true" className="shrink-0" />}
        <span>{windSpeed != null ? windSpeed : '—'}</span>
        <span className="sr-only">{isHighWind ? 'mph wind, above the spray drift warning' : 'mph wind'}</span>
      </div>

      {/* Low, range bar, high */}
      <div className="flex items-center justify-end gap-2">
        <span className="w-8 text-right font-mono text-sm text-muted-foreground">
          {day.tempLowF != null ? `${day.tempLowF}°` : '—'}
        </span>
        <div className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted min-[420px]:block sm:w-28">
          <div
            className="absolute h-full rounded-full bg-gradient-to-r from-sky-500 to-amber-500"
            style={{ left: `${leftPercent}%`, width: `${Math.min(barWidth, 100 - leftPercent)}%` }}
          />
        </div>
        <span className="w-8 text-right font-mono text-base font-bold text-foreground">
          {day.tempHighF != null ? `${day.tempHighF}°` : '—'}
        </span>
      </div>
    </li>
  );
}

export default function ForecastGrid({ days }: ForecastGridProps) {
  if (days.length === 0) return null;

  const displayDays = days.slice(0, 10);

  // One shared temperature scale so the range bars compare across days.
  const tempLows = displayDays.map(d => d.tempLowF).filter((t): t is number => t !== null);
  const tempHighs = displayDays.map(d => d.tempHighF).filter((t): t is number => t !== null);
  const minTemp = tempLows.length > 0 ? Math.min(...tempLows) : 32;
  const maxTemp = tempHighs.length > 0 ? Math.max(...tempHighs) : 100;
  const tempRange = maxTemp - minTemp || 1;

  const totalRain = displayDays.reduce((sum, d) => sum + (d.precipIn ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="forecast-heading">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3.5">
        <h2 id="forecast-heading" className="text-base font-bold text-foreground">
          {displayDays.length}-day forecast
        </h2>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{formatRainInches(totalRain)}</span> rain expected
        </p>
      </div>

      {/* Column labels */}
      <div className={`${ROW_GRID} px-[1.375rem] pb-1 pt-2 max-[359px]:px-3.5 text-xs text-muted-foreground`} aria-hidden="true">
        <span>Day</span>
        <span />
        <span>Rain</span>
        <span>Wind</span>
        <span className="text-right">Low / High</span>
      </div>

      <ul className="flex flex-col px-3 pb-3 max-[359px]:px-1">
        {displayDays.map((day, i) => (
          <ForecastDayRow
            key={day.date}
            day={day}
            index={i}
            minTemp={minTemp}
            tempRange={tempRange}
          />
        ))}
      </ul>
    </section>
  );
}
