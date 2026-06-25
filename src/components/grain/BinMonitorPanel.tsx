import { AlertTriangle, CalendarClock, Database, Hash, LucideIcon, TrendingUp, Warehouse } from 'lucide-react';

import type { Bin, GrainMovement } from '@/types/farm';
import { formatDate } from '@/utils/dates';
import { CAPACITY_LEVEL_STYLES, formatMeasurement, getCapacityLevel, roundTo } from '@/utils/numbers';

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

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const first = points[0] ?? { x: TREND_PADDING, y: TREND_HEIGHT - TREND_PADDING };
  const last = points[points.length - 1] ?? first;
  const areaPath = `${linePath} L ${last.x} ${TREND_HEIGHT - TREND_PADDING} L ${first.x} ${TREND_HEIGHT - TREND_PADDING} Z`;

  return { areaPath, linePath, step };
}

function MetaCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon size={13} />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate font-mono text-sm font-bold text-foreground">{value}</p>
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

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Warehouse size={16} className="text-harvest" />
            <span>Storage bin monitoring</span>
          </div>
          <h2 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground">{bin.name}</h2>
        </div>
        <div className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${status.statusClassName}`}>
          {level !== 'ok' ? <AlertTriangle size={16} /> : <TrendingUp size={16} />}
          {status.statusLabel}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:items-center">
        <BinFillGauge bushels={safeCurrentBushels} capacity={safeCapacity} percentFull={bin.pct} />

        <div className="space-y-4">
          <div>
            <p className="font-mono text-5xl font-bold leading-none text-harvest sm:text-6xl">
              {Math.round(bin.pct)}%
            </p>
            <p className="mt-1 text-lg font-bold text-foreground">full</p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} />
                <span>Fill trend, last 7 days</span>
              </div>
              <span className="font-mono">{formatMeasurement(safeCurrentBushels, 'bu', 1)}</span>
            </div>
            <svg className="h-28 w-full overflow-visible" viewBox={`0 0 ${TREND_WIDTH} ${TREND_VIEWBOX_HEIGHT}`} role="img" aria-label="Seven day bin fill trend">
              <defs>
                <linearGradient id={`binTrendFill-${bin.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--harvest))" stopOpacity="0.45" />
                  <stop offset="95%" stopColor="hsl(var(--harvest))" stopOpacity="0.04" />
                </linearGradient>
              </defs>
              {[24, 48, 72].map((y) => (
                <line key={y} x1={TREND_PADDING} x2={TREND_WIDTH - TREND_PADDING} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="4 5" strokeOpacity="0.65" />
              ))}
              <path d={trendGeometry.areaPath} fill={`url(#binTrendFill-${bin.id})`} />
              <path d={trendGeometry.linePath} fill="none" stroke="hsl(var(--harvest))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              {bin.trend.map((point, index) => (
                <text key={`${point.label}-${index}`} x={TREND_PADDING + index * trendGeometry.step} y="100" fill="hsl(var(--muted-foreground))" fontSize="10" textAnchor="middle">
                  {point.label}
                </text>
              ))}
            </svg>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <MetaCard icon={Hash} label="Bin ID" value={bin.id.slice(0, 8)} />
            <MetaCard icon={CalendarClock} label="Last fill" value={lastFillLabel} />
            <MetaCard icon={Database} label="Capacity" value={formatMeasurement(safeCapacity, 'bu', 1)} />
            <MetaCard icon={Warehouse} label="Current level" value={formatMeasurement(safeCurrentBushels, 'bu', 1)} />
          </div>
        </div>
      </div>
    </section>
  );
}
