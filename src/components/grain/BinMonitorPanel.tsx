import { AlertTriangle, CalendarClock, Database, Hash, type LucideIcon, TrendingUp, Warehouse } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Bin, GrainMovement } from '@/types/farm';
import { formatDate } from '@/utils/dates';
import { CAPACITY_LEVEL_STYLES, type CapacityLevel, formatMeasurement, getCapacityLevel, roundTo } from '@/utils/numbers';

import BinFillGauge from './BinFillGauge';

export interface BinTrendPoint {
  label: string;
  bushels: number;
}

export interface BinMonitorPanelData extends Bin {
  total: number;
  pct: number;
  lastFill?: GrainMovement;
  trend: BinTrendPoint[];
}

const TREND_WIDTH = 280;
const TREND_PADDING = 8;
const TREND_HEIGHT = 86;
const TREND_VIEWBOX_HEIGHT = 102;

const DARK_LEVEL_TONE: Record<CapacityLevel, string> = {
  ok: 'dark:text-emerald-200',
  warning: 'dark:text-amber-200',
  critical: 'dark:text-red-200',
};

const DARK_STATUS_TONE: Record<CapacityLevel, string> = {
  ok: 'dark:border-emerald-300/35 dark:bg-emerald-400/10 dark:text-emerald-200',
  warning: 'dark:border-amber-300/35 dark:bg-amber-400/10 dark:text-amber-200',
  critical: 'dark:border-red-300/35 dark:bg-red-500/10 dark:text-red-200',
};

function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return '';

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const previous = points[index - 1];
    const controlX = previous.x + (point.x - previous.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

function buildTrendGeometry(trend: BinTrendPoint[]) {
  const plotHeight = TREND_HEIGHT - TREND_PADDING * 2;
  const plotWidth = TREND_WIDTH - TREND_PADDING * 2;
  const values = trend.map((point) => point.bushels);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const range = maxValue - minValue || 1;
  const step = trend.length > 1 ? plotWidth / (trend.length - 1) : 0;

  const points = trend.map((point, index) => ({
    x: TREND_PADDING + index * step,
    y: TREND_PADDING + (1 - (point.bushels - minValue) / range) * plotHeight,
  }));

  const linePath = buildSmoothPath(points);
  const first = points[0] ?? { x: TREND_PADDING, y: TREND_HEIGHT - TREND_PADDING };
  const last = points[points.length - 1] ?? first;
  const areaPath = linePath
    ? `${linePath} L ${last.x} ${TREND_HEIGHT - TREND_PADDING} L ${first.x} ${TREND_HEIGHT - TREND_PADDING} Z`
    : '';

  return { areaPath, linePath, step };
}

function MetaCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 dark:border-slate-700/70 dark:bg-slate-950/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground dark:text-amber-100/75">
          <Icon size={13} className="text-harvest dark:text-amber-300" />
          <span>{label}</span>
        </div>
        <p className="min-w-0 truncate text-right font-mono text-sm font-bold text-foreground dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}

export default function BinMonitorPanel({ bin }: { bin: BinMonitorPanelData }) {
  const level = getCapacityLevel(bin.pct);
  const status = CAPACITY_LEVEL_STYLES[level];
  const safeCurrentBushels = roundTo(bin.total, 1);
  const safeCapacity = roundTo(bin.capacity, 1);
  const trendGeometry = buildTrendGeometry(bin.trend);
  const lastFillLabel = bin.lastFill?.timestamp
    ? formatDate(bin.lastFill.timestamp)
    : 'No fills this season';
  const statusPrefix = level === 'ok' ? 'Status' : 'Warning';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm dark:border-slate-700/80 dark:bg-[#10151a] dark:text-slate-100 dark:shadow-[0_18px_60px_rgba(0,0,0,0.42)] lg:p-5">
      <div className="pointer-events-none absolute inset-0 hidden opacity-75 dark:block [background-image:radial-gradient(circle_at_18%_8%,rgba(245,158,11,0.13),transparent_22rem),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:100%_100%,34px_34px,34px_34px]" />
      <div className="pointer-events-none absolute inset-x-4 top-4 hidden h-px bg-gradient-to-r from-transparent via-slate-500/50 to-transparent dark:block" />

      <div className="relative">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground dark:text-slate-300">
              <span className="h-6 w-1 rounded-full bg-harvest shadow-[0_0_14px_hsl(var(--harvest)/0.65)]" aria-hidden="true" />
              <Warehouse size={16} className="text-harvest dark:text-amber-300" />
              <span>Storage bin monitoring</span>
            </div>
            <h2 className="mt-1 truncate text-2xl font-bold text-foreground dark:text-slate-50">{bin.name}</h2>
          </div>
          <div className={cn('inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold', status.statusClassName, DARK_STATUS_TONE[level])}>
            {level !== 'ok' ? <AlertTriangle size={16} /> : <TrendingUp size={16} />}
            {status.statusLabel}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:items-center">
          <BinFillGauge bushels={safeCurrentBushels} capacity={safeCapacity} percentFull={bin.pct} />

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-3 dark:border-slate-700/80 dark:bg-slate-950/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-harvest dark:text-amber-300" />
                  <span>Fill trend, last 7 days</span>
                </div>
                <span className="font-mono text-foreground dark:text-slate-200">{formatMeasurement(safeCurrentBushels, 'bu', 1)}</span>
              </div>
              <svg className="h-28 w-full overflow-visible" viewBox={`0 0 ${TREND_WIDTH} ${TREND_VIEWBOX_HEIGHT}`} role="img" aria-label="Seven day bin fill trend">
                <defs>
                  <linearGradient id={`binTrendFill-${bin.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--harvest))" stopOpacity="0.48" />
                    <stop offset="95%" stopColor="hsl(var(--harvest))" stopOpacity="0.04" />
                  </linearGradient>
                </defs>
                {[24, 48, 72].map((y) => (
                  <line key={y} x1={TREND_PADDING} x2={TREND_WIDTH - TREND_PADDING} y1={y} y2={y} stroke="rgba(148,163,184,0.28)" strokeDasharray="4 5" />
                ))}
                {trendGeometry.areaPath && <path d={trendGeometry.areaPath} fill={`url(#binTrendFill-${bin.id})`} />}
                {trendGeometry.linePath && <path d={trendGeometry.linePath} fill="none" stroke="hsl(var(--harvest))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />}
                {bin.trend.map((point, index) => (
                  <text key={`${point.label}-${index}`} x={TREND_PADDING + index * trendGeometry.step} y="100" fill="rgba(148,163,184,0.85)" fontSize="10" textAnchor="middle">
                    {point.label}
                  </text>
                ))}
              </svg>
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4 dark:border-amber-300/15 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(15,23,42,0.46)_42%,rgba(2,6,23,0.68))]">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <p className={cn('font-mono text-5xl font-bold leading-none text-harvest sm:text-6xl', DARK_LEVEL_TONE[level])}>
                  {Math.round(bin.pct)}%
                </p>
                <p className="pb-1 text-xl font-bold text-foreground dark:text-slate-100">full</p>
              </div>
              <div className={cn('mt-3 flex items-center gap-2 text-sm font-semibold', level === 'ok' ? 'text-primary dark:text-emerald-200' : status.tone, DARK_LEVEL_TONE[level])}>
                {level !== 'ok' ? <AlertTriangle size={16} /> : <TrendingUp size={16} />}
                <span>{statusPrefix}: {status.statusLabel}</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <MetaCard icon={Hash} label="Bin ID" value={bin.id.slice(0, 8)} />
              <MetaCard icon={CalendarClock} label="Last fill" value={lastFillLabel} />
              <MetaCard icon={Database} label="Capacity" value={formatMeasurement(safeCapacity, 'bu', 1)} />
              <MetaCard icon={Warehouse} label="Current level" value={formatMeasurement(safeCurrentBushels, 'bu', 1)} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
