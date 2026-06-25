import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { CAPACITY_LEVEL_STYLES, CapacityLevel, getCapacityLevel } from '@/utils/numbers';

interface BinFillGaugeProps {
  bushels: number;
  capacity: number;
  percentFull: number;
}

const FILL_GRADIENT: Record<CapacityLevel, string> = {
  ok: 'from-harvest/70 via-harvest to-amber-500/80',
  warning: 'from-amber-400/80 via-harvest to-amber-500/90',
  critical: 'from-destructive/80 via-destructive to-destructive/90',
};

export default function BinFillGauge({ bushels, capacity, percentFull }: BinFillGaugeProps) {
  const cappedPercent = Math.max(0, Math.min(percentFull, 100));
  const markerBottom = `calc(1.75rem + (100% - 4rem) * ${cappedPercent / 100})`;
  const level = getCapacityLevel(percentFull);

  return (
    <div
      className="relative mx-auto flex h-[18rem] w-full max-w-[18rem] items-center justify-center sm:h-[21rem] sm:max-w-[20rem]"
      role="img"
      aria-label={`Bin is ${Math.round(percentFull)} percent full with ${bushels.toLocaleString()} bushels of ${capacity.toLocaleString()} bushels capacity.`}
    >
      <div className="absolute bottom-8 left-3 top-6 hidden w-px bg-border sm:block" aria-hidden="true">
        {[100, 50, 25, 0].map((tick) => (
          <div
            key={tick}
            className="absolute left-0 flex items-center gap-2"
            style={{ bottom: `${tick}%`, transform: 'translateY(50%)' }}
          >
            <span className="h-px w-4 bg-border" />
            <span className="font-mono text-[11px] text-muted-foreground">{tick}%</span>
          </div>
        ))}
      </div>

      <div className="relative h-full w-[62%] min-w-[10rem] max-w-[13rem]">
        <div className="absolute inset-x-0 top-3 z-20 h-11 rounded-[50%] border border-border bg-gradient-to-b from-slate-100 to-slate-400 shadow-lg dark:from-zinc-500 dark:to-zinc-900" />
        <div className="absolute inset-x-1 top-6 z-30 h-5 rounded-[50%] border border-black/30 bg-background/70 shadow-inner" />

        <div className="absolute bottom-7 inset-x-2 top-9 overflow-hidden rounded-b-[2rem] border-x border-border bg-gradient-to-r from-slate-950/10 via-background/40 to-slate-950/10 shadow-inner">
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 bg-gradient-to-b transition-all duration-500',
              FILL_GRADIENT[level],
            )}
            style={{ height: `${cappedPercent}%` }}
          >
            <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.85)_0_1px,transparent_1px),radial-gradient(circle_at_65%_60%,rgba(80,45,10,0.45)_0_1px,transparent_1px)] [background-size:8px_8px,11px_11px]" />
            <div className="absolute inset-x-0 top-0 h-5 -translate-y-1/2 rounded-[50%] bg-harvest/80 shadow-[0_0_22px_hsl(var(--harvest)/0.55)]" />
          </div>
          <div className="absolute inset-y-0 left-1/4 w-1/5 bg-white/20" />
          <div className="absolute inset-y-0 right-1/5 w-px bg-white/25" />
        </div>

        <div className="absolute inset-x-0 bottom-2 z-20 h-10 rounded-[50%] border border-border bg-gradient-to-b from-slate-500 to-slate-950 shadow-lg" />

        <div
          className="absolute right-[-4.5rem] z-40 flex translate-y-1/2 items-center gap-2"
          style={{ bottom: markerBottom }}
        >
          <span className="h-px w-8 bg-harvest" />
          <span className="rounded-lg border border-harvest/40 bg-harvest/10 px-2 py-1 font-mono text-xs font-bold text-harvest">
            {Math.round(percentFull)}%
          </span>
        </div>
      </div>

      {level !== 'ok' && (
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
          <AlertTriangle size={13} />
          <span className="text-xs font-semibold">{CAPACITY_LEVEL_STYLES[level].statusLabel}</span>
        </div>
      )}
    </div>
  );
}
