import { cn } from '@/lib/utils';
import { CAPACITY_LEVEL_STYLES, type CapacityLevel, getCapacityLevel, roundTo } from '@/utils/numbers';

interface BinFillGaugeProps {
  bushels: number;
  capacity: number;
  percentFull: number;
}

const LEVEL_ACCENT: Record<CapacityLevel, { rail: string; marker: string; glow: string }> = {
  ok: {
    rail: 'bg-primary dark:bg-emerald-400',
    marker: 'border-primary/50 bg-primary/10 text-primary dark:border-emerald-400/50 dark:bg-emerald-400/10 dark:text-emerald-400',
    glow: 'stroke-primary/80 dark:stroke-emerald-400/80',
  },
  warning: {
    rail: 'bg-amber-500 dark:bg-amber-400',
    marker: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-400',
    glow: 'stroke-amber-500/80 dark:stroke-amber-400/80',
  },
  critical: {
    rail: 'bg-destructive dark:bg-red-400',
    marker: 'border-destructive/50 bg-destructive/10 text-red-700 dark:border-red-400/50 dark:bg-red-400/10 dark:text-red-400',
    glow: 'stroke-red-500/80 dark:stroke-red-400/80',
  },
};

export default function BinFillGauge({ bushels, capacity, percentFull }: BinFillGaugeProps) {
  const cappedPercent = Math.max(0, Math.min(percentFull, 100));
  const level = getCapacityLevel(percentFull);
  const accent = LEVEL_ACCENT[level];

  // SVG coordinates for the grain bin
  const w = 200;
  const h = 360;
  const rx = 80;
  const ry = 22;
  const topCy = 100;
  const bottomCy = 300;
  const bodyH = bottomCy - topCy;
  
  // Fill math
  const fillY = bottomCy - (bodyH * cappedPercent) / 100;
  const clipY = fillY;
  const clipH = h - clipY;

  return (
    <div
      className="relative mx-auto flex h-[24rem] w-full max-w-[26rem] items-center justify-center overflow-visible sm:h-[28rem]"
      role="img"
      aria-label={`Bin holds ${roundTo(bushels, 1)} of ${roundTo(capacity, 1)} bushels (${roundTo(percentFull, 0)} percent full)`}
    >
      <div className="relative flex h-full w-full items-center justify-center pr-16 sm:pr-20">
        
        {/* Floor shadow */}
        <div className="absolute inset-x-10 bottom-6 h-10 rounded-[50%] bg-black/15 blur-xl dark:bg-black/50" aria-hidden="true" />

        <div className="relative h-full w-full max-w-[16rem]">
          <svg 
            viewBox={`0 0 ${w} ${h}`} 
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full overflow-visible drop-shadow-xl dark:drop-shadow-[0_15px_35px_rgba(0,0,0,0.6)]"
          >
            <defs>
              {/* Metallic gradient for roof and structure */}
              <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
                <stop offset="25%" stopColor="currentColor" stopOpacity="0.3" />
                <stop offset="50%" stopColor="currentColor" stopOpacity="0.6" />
                <stop offset="75%" stopColor="currentColor" stopOpacity="0.2" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.9" />
              </linearGradient>

              {/* Glassy reflection for the semi-transparent front wall */}
              <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
                <stop offset="15%" stopColor="currentColor" stopOpacity="0.05" />
                <stop offset="50%" stopColor="currentColor" stopOpacity="0.0" />
                <stop offset="85%" stopColor="currentColor" stopOpacity="0.05" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
              </linearGradient>
              
              <linearGradient id="grainGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--harvest))" stopOpacity="0.85" />
                <stop offset="20%" stopColor="hsl(var(--harvest))" stopOpacity="1" />
                <stop offset="80%" stopColor="hsl(var(--harvest))" stopOpacity="0.95" />
                <stop offset="100%" stopColor="hsl(var(--harvest))" stopOpacity="0.65" />
              </linearGradient>

              <linearGradient id="grainTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0.3" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </linearGradient>

              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <clipPath id="fillClip">
                <rect x="0" y={clipY} width={w} height={clipH} />
              </clipPath>
            </defs>

            {/* Base Concrete Pad */}
            <ellipse 
              cx={w/2} cy={bottomCy + 8} rx={rx + 10} ry={ry + 4} 
              className="fill-slate-300 dark:fill-slate-900 stroke-slate-400 dark:stroke-slate-800 stroke-[2px]" 
            />

            {/* Back interior wall */}
            <path 
              d={`M ${w/2 - rx} ${topCy} L ${w/2 - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${bottomCy} L ${w/2 + rx} ${topCy} A ${rx} ${ry} 0 0 0 ${w/2 - rx} ${topCy} Z`} 
              className="fill-slate-300/60 dark:fill-slate-800/60" 
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
                {/* Grain glowing rim representing the fill line */}
                <ellipse cx={w/2} cy={fillY} rx={rx} ry={ry} className={cn("fill-transparent stroke-[2px]", accent.glow)} filter="url(#glow)" />
              </g>
            )}

            {/* Front Glassy Steel (Semi-transparent view into the bin) */}
            <path 
              d={`M ${w/2 - rx} ${topCy} L ${w/2 - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${bottomCy} L ${w/2 + rx} ${topCy} A ${rx} ${ry} 0 0 1 ${w/2 - rx} ${topCy} Z`} 
              fill="url(#glass)" 
              className="text-slate-300 dark:text-slate-700" 
            />

            {/* Corrugated horizontal lines on the front */}
            <g className="stroke-slate-400/50 dark:stroke-slate-500/50 fill-none stroke-[1.5px]">
              {[...Array(11)].map((_, i) => {
                const y = topCy + (i + 1) * (bodyH / 12);
                return <path key={i} d={`M ${w/2 - rx} ${y} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${y}`} />;
              })}
            </g>
            
            {/* Vertical stiffeners (faint so grain is still visible) */}
            <g className="stroke-slate-400/40 dark:stroke-slate-500/40 fill-none stroke-[3px]">
              <path d={`M ${w/2 - rx*0.75} ${topCy + ry*0.7} L ${w/2 - rx*0.75} ${bottomCy + ry*0.7}`} />
              <path d={`M ${w/2} ${topCy + ry} L ${w/2} ${bottomCy + ry}`} />
              <path d={`M ${w/2 + rx*0.75} ${topCy + ry*0.7} L ${w/2 + rx*0.75} ${bottomCy + ry*0.7}`} />
            </g>

            {/* Bottom Rim of the cylinder */}
            <path 
              d={`M ${w/2 - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${w/2 + rx} ${bottomCy}`} 
              className="fill-none stroke-slate-500 dark:stroke-slate-600 stroke-[4px]" 
            />

            {/* Conical Roof */}
            <g className="text-slate-300 dark:text-slate-800">
              {/* Roof Cone */}
              <path 
                d={`M ${w/2 - rx - 4} ${topCy} L ${w/2} ${topCy - 70} L ${w/2 + rx + 4} ${topCy} A ${rx + 4} ${ry + 2} 0 0 1 ${w/2 - rx - 4} ${topCy} Z`} 
                fill="url(#metal)"
                className="stroke-slate-400 dark:stroke-slate-600 stroke-[1px]"
              />
              
              {/* Roof structural panel lines */}
              <g className="stroke-slate-400/70 dark:stroke-slate-600/70 fill-none stroke-[1.5px]">
                <path d={`M ${w/2} ${topCy - 70} L ${w/2 - rx*0.6} ${topCy + ry*0.8}`} />
                <path d={`M ${w/2} ${topCy - 70} L ${w/2 - rx*0.2} ${topCy + ry*1.1}`} />
                <path d={`M ${w/2} ${topCy - 70} L ${w/2 + rx*0.2} ${topCy + ry*1.1}`} />
                <path d={`M ${w/2} ${topCy - 70} L ${w/2 + rx*0.6} ${topCy + ry*0.8}`} />
              </g>

              {/* Roof Peak Cap / Vent */}
              <path d={`M ${w/2 - 12} ${topCy - 68} L ${w/2 - 12} ${topCy - 80} L ${w/2 + 12} ${topCy - 80} L ${w/2 + 12} ${topCy - 68} Z`} fill="url(#metal)" />
              <path d={`M ${w/2 - 16} ${topCy - 80} L ${w/2} ${topCy - 90} L ${w/2 + 16} ${topCy - 80} Z`} fill="url(#metal)" className="stroke-slate-400 dark:stroke-slate-600 stroke-[1px]" />
            </g>

          </svg>

          {/* Right side marker container aligned exactly to the tube height */}
          <div 
            className="absolute inset-x-0 z-50 w-full" 
            style={{ top: `${(topCy / h) * 100}%`, bottom: `${((h - bottomCy) / h) * 100}%` }}
          >
            <div
              className="absolute right-[-3.5rem] flex items-center gap-2 transition-all duration-500 sm:right-[-4.5rem]"
              style={{ bottom: `${cappedPercent}%`, transform: 'translateY(50%)' }}
            >
              <span className={cn('h-px w-10 sm:w-12', accent.rail)} />
              <span className={cn('rounded-lg border px-2 py-1 font-mono text-xs font-bold shadow-sm backdrop-blur-md bg-white/80 dark:bg-black/60', accent.marker)}>
                {roundTo(percentFull, 0)}%
              </span>
            </div>
            
            {/* Axis ticks on the right */}
            <div className="absolute bottom-0 right-[-0.5rem] top-0 hidden w-14 sm:block" aria-hidden="true">
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
