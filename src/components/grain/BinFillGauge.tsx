import { cn } from '@/lib/utils';
import { CAPACITY_LEVEL_STYLES, type CapacityLevel, getCapacityLevel } from '@/utils/numbers';

interface BinFillGaugeProps {
  bushels: number;
  capacity: number;
  percentFull: number;
}

const LEVEL_ACCENT: Record<CapacityLevel, { glow: string; marker: string; rail: string }> = {
  ok: {
    glow: 'shadow-[0_0_28px_hsl(var(--primary)/0.28)]',
    marker: 'border-primary/50 bg-primary/10 text-primary',
    rail: 'bg-primary',
  },
  warning: {
    glow: 'shadow-[0_0_36px_hsl(var(--harvest)/0.48)]',
    marker: 'border-amber-500/60 bg-amber-400/10 text-amber-800 dark:border-amber-300/70 dark:text-amber-200',
    rail: 'bg-amber-500 dark:bg-amber-300',
  },
  critical: {
    glow: 'shadow-[0_0_38px_hsl(var(--destructive)/0.42)]',
    marker: 'border-destructive/60 bg-destructive/10 text-red-700 dark:text-red-200',
    rail: 'bg-destructive',
  },
};

const GRAIN_TEXTURE_CLASS = [
  '[background-image:radial-gradient(circle_at_18%_22%,rgba(255,232,156,0.9)_0_1px,transparent_1.5px),radial-gradient(circle_at_70%_60%,rgba(106,58,18,0.58)_0_1px,transparent_1.5px),linear-gradient(180deg,rgba(255,198,77,0.95),rgba(158,87,22,0.96)_58%,rgba(70,42,19,0.98))]',
  '[background-size:7px_9px,10px_12px,100%_100%]',
].join(' ');

export default function BinFillGauge({ bushels, capacity, percentFull }: BinFillGaugeProps) {
  const cappedPercent = Math.max(0, Math.min(percentFull, 100));
  const markerBottom = `calc(2.5rem + (100% - 5.75rem) * ${cappedPercent / 100})`;
  const level = getCapacityLevel(percentFull);
  const accent = LEVEL_ACCENT[level];

  return (
    <div
      className="relative mx-auto flex h-[22rem] w-full max-w-[24rem] items-center justify-center overflow-visible sm:h-[25rem]"
      role="img"
      aria-label={`Bin is ${Math.round(percentFull)} percent full with ${bushels.toLocaleString()} bushels of ${capacity.toLocaleString()} bushels capacity.`}
    >
      <div className="relative flex h-full w-full items-center justify-center pr-10 sm:pr-14">
        <div className="absolute inset-x-8 bottom-3 h-12 rounded-[50%] bg-black/50 blur-xl" aria-hidden="true" />

        <div className="relative h-[20rem] w-[12.5rem] sm:h-[22.75rem] sm:w-[14.25rem]">
          <div className="absolute inset-x-2 top-1 z-30 h-12 rounded-[50%] border border-slate-500/80 bg-gradient-to-b from-slate-200 via-slate-600 to-slate-950 shadow-[inset_0_5px_10px_rgba(255,255,255,0.22),0_10px_22px_rgba(0,0,0,0.5)]" />
          <div className="absolute inset-x-5 top-4 z-40 h-7 rounded-[50%] border border-black/50 bg-gradient-to-b from-slate-800/90 to-slate-950 shadow-inner" />
          <div className="absolute inset-x-0 top-4 z-20 h-10 rounded-[50%] border border-white/10 bg-gradient-to-b from-white/20 to-transparent" />

          <div className="absolute inset-x-3 bottom-9 top-8 overflow-hidden rounded-b-[2.8rem] border-x border-slate-500/60 bg-gradient-to-r from-slate-950/80 via-slate-700/25 to-slate-950/85 shadow-[inset_18px_0_24px_rgba(255,255,255,0.12),inset_-22px_0_26px_rgba(0,0,0,0.52)]">
            <div
              className={cn('absolute inset-x-0 bottom-0 transition-all duration-500', GRAIN_TEXTURE_CLASS, accent.glow)}
              style={{ height: `${cappedPercent}%` }}
            >
              <div className="absolute inset-x-0 top-0 h-10 -translate-y-1/2 rounded-[50%] border border-amber-200/35 bg-gradient-to-b from-amber-200 via-harvest to-amber-800 shadow-[0_0_24px_rgba(245,158,11,0.65)]" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.13),transparent_26%,transparent_73%,rgba(255,255,255,0.08))]" />
            </div>

            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.24)_0_13%,transparent_13%_34%,rgba(255,255,255,0.1)_34%_48%,transparent_48%_76%,rgba(255,255,255,0.12)_76%_82%,transparent_82%)]" />
            <div className="absolute inset-y-0 left-[18%] w-[18%] bg-white/10 blur-[1px]" />
            <div className="absolute inset-y-0 right-[17%] w-px bg-white/25" />
            <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-white/10 via-transparent to-black/40" />
          </div>

          <div
            className="absolute inset-x-3 z-50 h-3 -translate-y-1/2 rounded-[50%] border border-amber-200/60 bg-gradient-to-r from-amber-200 via-harvest to-amber-700 shadow-[0_0_28px_rgba(245,158,11,0.78)]"
            style={{ bottom: markerBottom }}
            aria-hidden="true"
          />

          <div className="absolute inset-x-1 bottom-5 z-30 h-12 rounded-[50%] border border-slate-500/80 bg-gradient-to-b from-slate-500 via-slate-800 to-black shadow-[inset_0_5px_10px_rgba(255,255,255,0.1),0_12px_20px_rgba(0,0,0,0.45)]" />
          <div className="absolute inset-x-5 bottom-8 z-40 h-5 rounded-[50%] bg-black/45 shadow-inner" />

          <div
            className="absolute right-[-4.35rem] z-50 flex translate-y-1/2 items-center gap-2 sm:right-[-5.1rem]"
            style={{ bottom: markerBottom }}
          >
            <span className={cn('h-px w-8 sm:w-10', accent.rail)} />
            <span className={cn('rounded-lg border px-2 py-1 font-mono text-xs font-bold shadow-[0_0_18px_rgba(245,158,11,0.25)]', accent.marker)}>
              {Math.round(percentFull)}%
            </span>
          </div>
        </div>

        <div className="absolute bottom-10 right-1 top-8 hidden w-12 sm:block" aria-hidden="true">
          <div className="absolute bottom-0 left-0 top-0 w-px bg-slate-600/80" />
          {[100, 50, 25, 0].map((tick) => (
            <div
              key={tick}
              className="absolute left-0 flex items-center gap-2"
              style={{ bottom: `${tick}%`, transform: 'translateY(50%)' }}
            >
              <span className="h-px w-4 bg-slate-500" />
              <span className={cn('font-mono text-[11px]', tick === 100 ? 'text-red-300' : 'text-slate-400')}>
                {tick}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-200 shadow-lg">
        <span className={cn('h-2 w-2 rounded-full', accent.rail)} />
        <span className="font-semibold">{CAPACITY_LEVEL_STYLES[level].statusLabel}</span>
      </div>
    </div>
  );
}
