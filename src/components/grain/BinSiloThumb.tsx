import { cn } from '@/lib/utils';
import { getCapacityLevel, type CapacityLevel } from '@/utils/numbers';

interface BinSiloThumbProps {
  id: string;
  percentFull: number;
  className?: string;
}

const LEVEL_GRAIN: Record<CapacityLevel, { body: string; top: string }> = {
  ok: { body: 'hsl(var(--harvest))', top: '#f5c14a' },
  warning: { body: '#d97706', top: '#fbbf24' },
  critical: { body: 'hsl(var(--destructive))', top: '#fb7185' },
};

export default function BinSiloThumb({ id, percentFull, className }: BinSiloThumbProps) {
  const capped = Number.isFinite(percentFull) ? Math.max(0, Math.min(percentFull, 100)) : 0;
  const level = getCapacityLevel(capped);
  const grain = LEVEL_GRAIN[level];
  const uid = `silo-${id.replace(/[^a-zA-Z0-9_-]/g, '') || 'bin'}`;

  const w = 88;
  const h = 140;
  const cx = 40;
  const rx = 24;
  const ry = 8;
  const topCy = 46;
  const bottomCy = 118;
  const bodyH = bottomCy - topCy;
  const fillY = bottomCy - (bodyH * capped) / 100;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-24 w-[4.25rem] shrink-0 overflow-visible', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.88" />
          <stop offset="28%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="52%" stopColor="currentColor" stopOpacity="0.62" />
          <stop offset="78%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={`${uid}-grain`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={grain.body} stopOpacity="0.72" />
          <stop offset="22%" stopColor={grain.body} stopOpacity="1" />
          <stop offset="78%" stopColor={grain.body} stopOpacity="0.95" />
          <stop offset="100%" stopColor={grain.body} stopOpacity="0.62" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <rect x="0" y={fillY} width={w} height={h - fillY} />
        </clipPath>
      </defs>

      <ellipse cx={cx} cy={bottomCy + 10} rx={rx + 10} ry={7} className="fill-foreground/10" />

      <path
        d={`M ${cx - rx} ${topCy} L ${cx - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${bottomCy} L ${cx + rx} ${topCy} A ${rx} ${ry} 0 0 0 ${cx - rx} ${topCy} Z`}
        className="fill-muted"
      />

      {capped > 0 && (
        <g>
          <g clipPath={`url(#${uid}-clip)`}>
            <path
              d={`M ${cx - rx} ${topCy} L ${cx - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${bottomCy} L ${cx + rx} ${topCy} Z`}
              fill={`url(#${uid}-grain)`}
            />
          </g>
          <ellipse cx={cx} cy={fillY} rx={rx} ry={ry} fill={grain.top} />
          <ellipse cx={cx} cy={fillY} rx={rx * 0.55} ry={ry * 0.45} fill="white" fillOpacity="0.28" />
        </g>
      )}

      <path
        d={`M ${cx - rx} ${topCy} L ${cx - rx} ${bottomCy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${bottomCy} L ${cx + rx} ${topCy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${topCy} Z`}
        fill={`url(#${uid}-metal)`}
        className="text-slate-300 dark:text-slate-600"
        fillOpacity="0.55"
      />

      <g className="fill-none stroke-slate-500/35 dark:stroke-slate-300/25" strokeWidth="1.2">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const y = topCy + ((i + 1) * bodyH) / 7;
          return <path key={i} d={`M ${cx - rx} ${y} A ${rx} ${ry} 0 0 0 ${cx + rx} ${y}`} />;
        })}
      </g>

      <g className="stroke-slate-500/50 dark:stroke-slate-300/30" strokeWidth="2" fill="none">
        <line x1={70} y1={topCy + 6} x2={70} y2={bottomCy - 4} />
        {[0, 1, 2, 3, 4].map((i) => {
          const y = topCy + 12 + i * 14;
          return <line key={i} x1={66} y1={y} x2={74} y2={y} />;
        })}
      </g>

      <path
        d={`M ${cx - rx - 3} ${topCy} L ${cx} ${topCy - 32} L ${cx + rx + 3} ${topCy} A ${rx + 3} ${ry + 1} 0 0 1 ${cx - rx - 3} ${topCy} Z`}
        fill={`url(#${uid}-metal)`}
        className="text-slate-400 dark:text-slate-500"
      />
      <path d={`M ${cx - 6} ${topCy - 31} L ${cx - 6} ${topCy - 38} L ${cx + 6} ${topCy - 38} L ${cx + 6} ${topCy - 31} Z`} fill={`url(#${uid}-metal)`} className="text-slate-400 dark:text-slate-500" />
      <path d={`M ${cx - 8} ${topCy - 38} L ${cx} ${topCy - 44} L ${cx + 8} ${topCy - 38} Z`} fill={`url(#${uid}-metal)`} className="text-slate-400 dark:text-slate-500" />
    </svg>
  );
}
