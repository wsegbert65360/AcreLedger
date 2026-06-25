import { cn } from '@/lib/utils';
import { CAPACITY_LEVEL_STYLES, type CapacityLevel, getCapacityLevel } from '@/utils/numbers';

interface BinFillGaugeProps {
  bushels: number;
  capacity: number;
  percentFull: number;
}

const LEVEL_ACCENT: Record<CapacityLevel, { glow: string; marker: string; rail: string }> = {
  ok: {
    glow: 'shadow-[0_0_35px_rgba(245,158,11,0.7)]',
    marker: 'border-amber-500/50 bg-black/80 text-amber-400 font-bold',
    rail: 'bg-amber-500/80',
  },
  warning: {
    glow: 'shadow-[0_0_45px_rgba(245,158,11,0.9)]',
    marker: 'border-amber-500/80 bg-black/80 text-amber-400 font-bold',
    rail: 'bg-amber-500',
  },
  critical: {
    glow: 'shadow-[0_0_50px_rgba(239,68,68,0.9)]',
    marker: 'border-red-500/80 bg-black/80 text-red-500 font-bold',
    rail: 'bg-red-500',
  },
};

const GRAIN_TEXTURE_CLASS = [
  '[background-image:radial-gradient(circle_at_20%_30%,rgba(255,232,156,0.5)_0_1px,transparent_1.5px),radial-gradient(circle_at_80%_70%,rgba(106,58,18,0.9)_0_1px,transparent_1.5px),radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.5)_0_1px,transparent_1.5px)]',
  '[background-size:4px_6px,5px_7px,3px_5px]'
].join(' ');

export default function BinFillGauge({ bushels, capacity, percentFull }: BinFillGaugeProps) {
  const cappedPercent = Math.max(0, Math.min(percentFull, 100));
  // Tube height is exactly 100% - 4rem (top-8 to bottom-8)
  const markerBottom = `calc(2rem + (100% - 4rem) * ${cappedPercent / 100})`;
  const level = getCapacityLevel(percentFull);
  const accent = LEVEL_ACCENT[level];

  return (
    <div
      className="relative mx-auto flex h-[24rem] w-full max-w-[26rem] items-center justify-center overflow-visible sm:h-[28rem]"
      role="img"
      aria-label={`Bin is ${Math.round(percentFull)} percent full`}
    >
      <div className="relative flex h-full w-full items-center justify-center pr-16 sm:pr-20">
        {/* Floor shadow */}
        <div className="absolute inset-x-12 bottom-2 h-10 rounded-[50%] bg-black/80 blur-2xl" aria-hidden="true" />

        <div className="relative h-[22rem] w-[14rem] sm:h-[26rem] sm:w-[16rem]">
          
          {/* Glass Tube (z-10) */}
          <div className="absolute inset-x-1 bottom-8 top-8 z-10 overflow-hidden rounded-b-[3.5rem] border-x border-slate-700/60 bg-slate-900/90 shadow-[inset_25px_0_40px_rgba(0,0,0,0.9),inset_-25px_0_40px_rgba(0,0,0,0.9)] backdrop-blur-[2px]">
            
            {/* Empty back wall texture */}
            <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0_1px,transparent_1px)] [background-size:4px_4px] opacity-60" />

            {/* Grain Fill */}
            <div
              className={cn('absolute inset-x-0 bottom-0 transition-all duration-700 ease-out', accent.glow)}
              style={{ height: `${cappedPercent}%` }}
            >
              {/* Internal top surface ellipse of the grain */}
              <div className="absolute inset-x-0 top-0 h-10 -translate-y-1/2 rounded-[50%] border-t border-amber-300/40 bg-gradient-to-b from-amber-200 via-amber-500 to-amber-900 shadow-[0_0_35px_rgba(245,158,11,0.9)]" />
              
              {/* Grain body gradient (bright top, dark bottom) */}
              <div className="absolute inset-0 bg-gradient-to-b from-amber-500/90 via-amber-800/80 to-[#050505]" />
              
              {/* Noise texture overlay */}
              <div className={cn("absolute inset-0 mix-blend-overlay opacity-90", GRAIN_TEXTURE_CLASS)} />
              
              {/* Front glass highlight on the grain itself */}
              <div className="absolute inset-y-0 left-[15%] w-[15%] bg-gradient-to-r from-transparent via-white/10 to-transparent blur-[2px]" />
            </div>

            {/* Overall Glass Reflections */}
            <div className="absolute inset-y-0 left-[10%] w-[12%] bg-gradient-to-r from-transparent via-white/10 to-transparent blur-[1px] pointer-events-none" />
            <div className="absolute inset-y-0 right-[8%] w-[15%] bg-gradient-to-r from-transparent via-black/80 to-transparent blur-[4px] pointer-events-none" />
          </div>

          {/* Glowing External Marker Ring (z-50) */}
          {cappedPercent > 0 && (
            <div
              className="absolute inset-x-[2px] z-50 h-8 -translate-y-1/2 rounded-[50%] border-[1.5px] border-amber-300/90 bg-transparent shadow-[0_0_20px_rgba(245,158,11,1),inset_0_0_15px_rgba(245,158,11,0.8)]"
              style={{ bottom: markerBottom }}
              aria-hidden="true"
            >
               <div className="absolute inset-x-[15%] top-0 h-[2px] bg-white/70 blur-[1px]" />
               <div className="absolute inset-x-[15%] bottom-0 h-[1px] bg-white/40 blur-[1px]" />
            </div>
          )}

          {/* Top Cap (z-20 to z-40) */}
          <div className="absolute inset-x-0 top-1 z-30 h-14 rounded-[50%] border-2 border-slate-700 bg-gradient-to-b from-slate-600 via-slate-800 to-[#0a0a0a] shadow-[0_10px_20px_rgba(0,0,0,0.8)]" />
          <div className="absolute inset-x-3 top-3 z-40 h-10 rounded-[50%] border border-black/80 bg-gradient-to-b from-slate-800 to-black shadow-inner" />
          <div className="absolute inset-x-5 top-5 z-50 h-6 rounded-[50%] bg-[#050505] shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)]" />

          {/* Bottom Cap (z-30) */}
          <div className="absolute inset-x-0 bottom-1 z-30 h-14 rounded-[50%] border-b-2 border-slate-700/50 bg-gradient-to-b from-[#111] via-slate-800 to-black shadow-[0_15px_30px_rgba(0,0,0,0.9)]" />
          <div className="absolute inset-x-2 bottom-3 z-40 h-10 rounded-[50%] border border-black/50 bg-gradient-to-b from-slate-800/80 to-[#050505] shadow-inner" />
          <div className="absolute inset-x-5 bottom-4 z-50 h-6 rounded-[50%] bg-black" />

          {/* Right side markers & percentage line */}
          <div
            className="absolute right-[-4.5rem] z-50 flex translate-y-1/2 items-center gap-3 sm:right-[-5.5rem] transition-all duration-700 ease-out"
            style={{ bottom: markerBottom }}
          >
            <span className={cn('h-[2px] w-12 sm:w-16 shadow-[0_0_8px_rgba(245,158,11,0.8)]', accent.rail)} />
            <span className={cn('rounded border px-2 py-1 font-mono text-sm shadow-[0_0_15px_rgba(245,158,11,0.3)] backdrop-blur-sm', accent.marker)}>
              {Math.round(percentFull)}%
            </span>
          </div>

          {/* Axis ticks on the right */}
          <div className="absolute bottom-8 right-1 top-8 hidden w-14 sm:block" aria-hidden="true">
            <div className="absolute bottom-0 left-0 top-0 w-px bg-slate-700/60" />
            {[100, 75, 50, 25, 0].map((tick) => (
              <div
                key={tick}
                className="absolute left-0 flex items-center gap-2"
                style={{ bottom: `${tick}%`, transform: 'translateY(50%)' }}
              >
                <span className="h-px w-4 bg-slate-600" />
                <span className={cn('font-mono text-[11px]', tick === 100 ? 'text-red-500/90 font-bold' : 'text-slate-500')}>
                  {tick}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

