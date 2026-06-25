import { cn } from '@/lib/utils';
import { CAPACITY_LEVEL_STYLES, type CapacityLevel, getCapacityLevel } from '@/utils/numbers';

interface BinFillGaugeProps {
  bushels: number;
  capacity: number;
  percentFull: number;
}

const LEVEL_ACCENT: Record<CapacityLevel, { rail: string; marker: string }> = {
  ok: {
    rail: 'bg-primary dark:bg-emerald-400',
    marker: 'border-primary/50 bg-primary/10 text-primary dark:border-emerald-400/50 dark:bg-emerald-400/10 dark:text-emerald-400',
  },
  warning: {
    rail: 'bg-amber-500 dark:bg-amber-400',
    marker: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-400',
  },
  critical: {
    rail: 'bg-destructive dark:bg-red-400',
    marker: 'border-destructive/50 bg-destructive/10 text-red-700 dark:border-red-400/50 dark:bg-red-400/10 dark:text-red-400',
  },
};

export default function BinFillGauge({ bushels, capacity, percentFull }: BinFillGaugeProps) {
  const cappedPercent = Math.max(0, Math.min(percentFull, 100));
  const level = getCapacityLevel(percentFull);
  const accent = LEVEL_ACCENT[level];

  // SVG dimensions
  const w = 200;
  const h = 320;
  const rx = 80;
  const ry = 24;
  const topCy = 40;
  const bottomCy = 280;
  const bodyH = bottomCy - topCy;
  
  // Fill level mapping
  const fillY = bottomCy - (bodyH * cappedPercent) / 100;
  const clipY = fillY;
  const clipH = h - clipY;

  return (
    <div
      className="relative mx-auto flex h-[22rem] w-full max-w-[24rem] items-center justify-center overflow-visible sm:h-[25rem]"
      role="img"
      aria-label={`Bin is ${Math.round(percentFull)} percent full with ${bushels.toLocaleString()} bushels of ${capacity.toLocaleString()} bushels capacity.`}
    >
      <div className="relative flex h-full w-full items-center justify-center pr-12 sm:pr-16">
        {/* Floor shadow */}
        <div className="absolute inset-x-12 bottom-4 h-8 rounded-[50%] bg-black/10 blur-xl dark:bg-black/60" aria-hidden="true" />

        <div className="relative h-full w-full max-w-[16rem]">
          <svg 
            viewBox={`0 0 ${w} ${h}`} 
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full overflow-visible drop-shadow-xl dark:drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)]"
          >
            <defs>
              <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                <stop offset="15%" stopColor="currentColor" stopOpacity="0.02" />
                <stop offset="50%" stopColor="currentColor" stopOpacity="0.0" />
                <stop offset="85%" stopColor="currentColor" stopOpacity="0.05" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.3" />
              </linearGradient>
              
              <linearGradient id="grainGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--harvest))" stopOpacity="0.85" />
                <stop offset="20%" stopColor="hsl(var(--harvest))" stopOpacity="1" />
                <stop offset="80%" stopColor="hsl(var(--harvest))" stopOpacity="0.95" />
                <stop offset="100%" stopColor="hsl(var(--harvest))" stopOpacity="0.7" />
              </linearGradient>

              <linearGradient id="grainTop" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="white" stopOpacity="0.3" />
                <stop offset="50%" stopColor="transparent" stopOpacity="0" />
                <stop offset="100%" stopColor="black" stopOpacity="0.15" />
              </linearGradient>

              <clipPath id="fillClip">
                <rect x="0" y={clipY} width={w} height={clipH} />
              </clipPath>
            </defs>

            {/* Back interior wall */}
            <path 
              d={`M ${w/2 - rx} ${topCy} L ${w/2 - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${bottomCy} L ${w/2 + rx} ${topCy} A ${rx} ${ry} 0 0 0 ${w/2 - rx} ${topCy} Z`} 
              className="fill-slate-200/50 dark:fill-slate-800/60" 
            />

            {/* Grain Fill */}
            {cappedPercent > 0 && (
              <g>
                <g clipPath="url(#fillClip)">
                  {/* Grain body */}
                  <path 
                    d={`M ${w/2 - rx} ${topCy} L ${w/2 - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${bottomCy} L ${w/2 + rx} ${topCy} Z`} 
                    fill="url(#grainGrad)" 
                  />
                </g>
                {/* Grain top surface base color */}
                <ellipse cx={w/2} cy={fillY} rx={rx} ry={ry} className="fill-amber-400 dark:fill-amber-500" />
                {/* Grain top surface gradient highlight */}
                <ellipse cx={w/2} cy={fillY} rx={rx} ry={ry} fill="url(#grainTop)" />
              </g>
            )}

            {/* Front Glass */}
            <path 
              d={`M ${w/2 - rx} ${topCy} L ${w/2 - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${bottomCy} L ${w/2 + rx} ${topCy} A ${rx} ${ry} 0 0 1 ${w/2 - rx} ${topCy} Z`} 
              fill="url(#glass)" 
              className="text-white dark:text-slate-400" 
            />

            {/* Corrugated horizontal lines (behind glass reflection) */}
            <g className="stroke-slate-400/20 fill-none stroke-[1px] dark:stroke-slate-500/20">
              {[...Array(15)].map((_, i) => {
                const y = topCy + (i + 1) * (bodyH / 16);
                return <path key={i} d={`M ${w/2 - rx} ${y} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${y}`} />;
              })}
            </g>

            {/* Top opening rim */}
            <ellipse 
              cx={w/2} cy={topCy} rx={rx} ry={ry} 
              className="fill-slate-900/5 stroke-slate-400/80 stroke-[2px] dark:fill-black/40 dark:stroke-slate-500" 
            />
            {/* Top opening inner shadow highlight */}
            <ellipse 
              cx={w/2} cy={topCy + 1} rx={rx - 1} ry={ry - 1} 
              className="fill-transparent stroke-white/50 stroke-[1px] dark:stroke-white/10" 
            />

            {/* Bottom Rim */}
            <path 
              d={`M ${w/2 - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${bottomCy}`} 
              className="fill-none stroke-slate-400/80 stroke-[3px] dark:stroke-slate-500" 
            />

            {/* Reflections / Highlights */}
            <path d={`M ${w/2 - rx + 15} ${topCy + ry/2} L ${w/2 - rx + 15} ${bottomCy - ry/2}`} className="fill-none stroke-white/60 stroke-[4px] blur-[2px] dark:stroke-white/10" />
            <path d={`M ${w/2 + rx - 10} ${topCy + ry/2} L ${w/2 + rx - 10} ${bottomCy - ry/2}`} className="fill-none stroke-black/5 stroke-[6px] blur-[3px] dark:stroke-black/30" />
          </svg>

          {/* Right side markers & percentage line */}
          <div className="absolute bottom-[12.5%] right-[-3rem] top-[12.5%] z-50 w-full sm:right-[-4rem]">
            <div
              className="absolute right-0 flex items-center gap-2 transition-all duration-500"
              style={{ bottom: `${cappedPercent}%`, transform: 'translateY(50%)' }}
            >
              <span className={cn('h-px w-8 sm:w-10', accent.rail)} />
              <span className={cn('rounded-lg border px-2 py-1 font-mono text-xs font-bold shadow-sm', accent.marker)}>
                {Math.round(percentFull)}%
              </span>
            </div>
          </div>
        </div>

        {/* Axis ticks on the right */}
        <div className="absolute bottom-[12.5%] right-1 top-[12.5%] hidden w-12 sm:block" aria-hidden="true">
          <div className="absolute bottom-0 left-0 top-0 w-px bg-slate-300 dark:bg-slate-700" />
          {[100, 75, 50, 25, 0].map((tick) => (
            <div
              key={tick}
              className="absolute left-0 flex items-center gap-2"
              style={{ bottom: `${tick}%`, transform: 'translateY(50%)' }}
            >
              <span className="h-px w-3 bg-slate-400 dark:bg-slate-600" />
              <span className={cn('font-mono text-[10px]', tick === 100 ? 'text-red-500/80 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                {tick}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Status Badge */}
      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-200">
        <span className={cn('h-2 w-2 rounded-full', accent.rail)} />
        <span className="font-semibold">{CAPACITY_LEVEL_STYLES[level].statusLabel}</span>
      </div>
    </div>
  );
}

