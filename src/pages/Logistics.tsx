import { useMemo, useState, type ReactNode } from 'react';

import { AlertTriangle, ArrowLeft, Banknote, Plus, Settings, Warehouse, Wheat } from 'lucide-react';

import AddGrainModal from '@/components/AddGrainModal';
import { BinManager } from '@/components/BinManageModal';
import BinMonitorPanel, { BinMonitorPanelData, BinTrendPoint } from '@/components/grain/BinMonitorPanel';
import SellModal from '@/components/SellModal';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFarm } from '@/store/farmStore';
import type { Bin, GrainMovement } from '@/types/farm';
import { formatShortDate } from '@/utils/dates';
import { CAPACITY_LEVEL_STYLES, formatMeasurement, getCapacityLevel, getSignedBushels, roundTo } from '@/utils/numbers';

interface BinDetailView extends BinMonitorPanelData {
  recentMovements: GrainMovement[];
}

function buildBinTrend(movementsForBin: GrainMovement[]): BinTrendPoint[] {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const dayEnds = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return date.getTime();
  });

  const relevant = movementsForBin
    .filter((movement) => movement.timestamp <= dayEnds[6])
    .sort((a, b) => a.timestamp - b.timestamp);

  const points: BinTrendPoint[] = [];
  let cumulative = 0;
  let cursor = 0;

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayEnd = dayEnds[dayIndex];
    while (cursor < relevant.length && relevant[cursor].timestamp <= dayEnd) {
      cumulative += getSignedBushels(relevant[cursor]);
      cursor++;
    }
    points.push({
      label: new Date(dayEnd).toLocaleDateString(undefined, { weekday: 'short' }),
      bushels: roundTo(cumulative, 1),
    });
  }

  return points;
}

function CapacityBar({ pct, className }: { pct: number; className?: string }) {
  const level = getCapacityLevel(pct);
  return (
    <div className={cn('overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-all', CAPACITY_LEVEL_STYLES[level].bar)}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

interface BinQuickActionsProps {
  bin: Pick<Bin, 'name'> & { total: number };
  variant: 'compact' | 'full';
  onAdd: () => void;
  onSell: () => void;
}

function BinQuickActions({ bin, variant, onAdd, onSell }: BinQuickActionsProps) {
  if (variant === 'compact') {
    return (
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-harvest/30 bg-harvest/5 text-harvest hover:bg-harvest/10"
          onClick={onAdd}
          aria-label={`Add grain to ${bin.name}`}
        >
          <Plus size={16} className="sm:mr-2" />
          <span className="hidden sm:inline">Add</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={bin.total <= 0}
          className="border-harvest/30 bg-harvest/5 text-harvest hover:bg-harvest/10"
          onClick={onSell}
          aria-label={`Sell from ${bin.name}`}
        >
          <Banknote size={16} className="sm:mr-2" />
          <span className="hidden sm:inline">Sell</span>
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <Button className="w-full bg-harvest text-harvest-foreground hover:bg-harvest/90" onClick={onAdd}>
        <Plus size={16} className="mr-2" />
        Add grain
      </Button>
      <Button
        variant="outline"
        className="w-full border-harvest/30 text-harvest hover:bg-harvest/10"
        disabled={bin.total <= 0}
        onClick={onSell}
      >
        <Banknote size={16} className="mr-2" />
        Sell from bin
      </Button>
    </div>
  );
}

export default function Logistics() {
  const { bins, getBinTotal, grainMovements } = useFarm();
  const [managing, setManaging] = useState(false);
  const [sellingBin, setSellingBin] = useState<Bin | null>(null);
  const [addingBin, setAddingBin] = useState<Bin | null>(null);
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);

  // Bin inventory is continuous physical storage — it carries across seasons,
  // so this view must NOT filter movements by viewingSeason. The page just shows
  // what is physically in the bins, regardless of the selected season.
  const binMovements = useMemo(
    () => grainMovements.filter((movement) => !movement.deleted_at),
    [grainMovements],
  );

  const { binOverview, totals } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const movement of binMovements) {
      counts.set(movement.binId, (counts.get(movement.binId) ?? 0) + 1);
    }
    let stored = 0;
    let capacity = 0;
    const overview = bins.map((bin) => {
      // All-season total (binId-all) — bin contents are physical and span seasons.
      const total = roundTo(getBinTotal(bin.id), 1);
      const pct = bin.capacity > 0 ? Math.min(Math.max((total / bin.capacity) * 100, 0), 100) : 0;
      stored += total;
      capacity += bin.capacity;
      return { ...bin, total, pct, movementCount: counts.get(bin.id) ?? 0 };
    });
    return {
      binOverview: overview,
      totals: { stored: roundTo(stored, 1), capacity: roundTo(capacity, 1) },
    };
  }, [bins, getBinTotal, binMovements]);

  const selectedBinDetail = useMemo<BinDetailView | null>(() => {
    if (!selectedBinId) return null;
    const selectedBin = binOverview.find((bin) => bin.id === selectedBinId);
    if (!selectedBin) return null;

    const ascending = binMovements
      .filter((movement) => movement.binId === selectedBin.id)
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      ...selectedBin,
      recentMovements: [...ascending].reverse().slice(0, 5),
      lastFill: [...ascending].reverse().find((movement) => movement.type === 'in'),
      trend: buildBinTrend(ascending),
    };
  }, [binOverview, selectedBinId, binMovements]);

  const totalPercent = totals.capacity > 0 ? Math.min((totals.stored / totals.capacity) * 100, 100) : 0;

  let mainContent: ReactNode;
  if (managing) {
    mainContent = (
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground">Manage storage bins</h2>
          <p className="text-sm text-muted-foreground">Add, rename, resize, or remove bins from active tracking.</p>
        </div>
        <BinManager />
      </section>
    );
  } else if (binOverview.length === 0) {
    mainContent = (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center shadow-sm">
        <Warehouse size={48} className="mx-auto mb-4 text-muted-foreground/40" />
        <h3 className="mb-1 text-lg font-bold text-foreground">No storage bins</h3>
        <p className="mx-auto max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
          Add your first bin to start monitoring capacity, inventory, and grain movement.
        </p>
        <Button className="mt-5 bg-harvest text-harvest-foreground hover:bg-harvest/90" onClick={() => setManaging(true)}>
          <Plus size={16} className="mr-2" />
          Add bin
        </Button>
      </div>
    );
  } else if (selectedBinDetail) {
    mainContent = (
      <>
        <Button variant="ghost" className="h-11 px-2 text-muted-foreground hover:text-foreground" onClick={() => setSelectedBinId(null)}>
          <ArrowLeft size={18} className="mr-2" />
          All bins
        </Button>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="space-y-4">
            <BinMonitorPanel bin={selectedBinDetail} />

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Recent movement</h2>
                  <p className="text-sm text-muted-foreground">Latest activity for {selectedBinDetail.name}</p>
                </div>
                <BinQuickActions
                  variant="compact"
                  bin={selectedBinDetail}
                  onAdd={() => setAddingBin(selectedBinDetail)}
                  onSell={() => setSellingBin(selectedBinDetail)}
                />
              </div>

              {selectedBinDetail.recentMovements.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No grain movement logged for this bin yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedBinDetail.recentMovements.map((movement) => {
                    const signedBushels = getSignedBushels(movement);
                    // A negative stored `bushels` is a correction (AGENTS.md), not a
                    // normal outbound sale — color it amber to match the warning icon.
                    // `signedBushels < 0` is true for every outbound, so don't use it
                    // as the error signal.
                    const isCorrection = movement.bushels < 0;
                    const amountClass = isCorrection ? 'text-amber-600' : 'text-foreground';
                    const locationLabel = movement.type === 'in'
                      ? movement.sourceFieldName || 'Field transfer'
                      : movement.destination || 'Destination not set';

                    return (
                      <div key={movement.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {movement.type === 'in' ? 'Inbound' : 'Outbound'} - {locationLabel}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">{formatShortDate(movement.timestamp)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {movement.bushels < 0 && <AlertTriangle size={14} className="text-amber-600" />}
                          <span className={cn('font-mono text-sm font-bold', amountClass)}>
                            {signedBushels > 0 ? '+' : ''}{formatMeasurement(signedBushels, 'bu', 1)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-3">
            <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <h2 className="mb-3 px-1 text-sm font-bold text-foreground">Selected bin</h2>
              <div className="rounded-lg border border-harvest/50 bg-harvest/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{selectedBinDetail.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{formatMeasurement(selectedBinDetail.total, 'bu', 1)}</p>
                  </div>
                  <span className={cn('font-mono text-sm font-bold', CAPACITY_LEVEL_STYLES[getCapacityLevel(selectedBinDetail.pct)].tone)}>
                    {roundTo(selectedBinDetail.pct, 0)}%
                  </span>
                </div>
                <CapacityBar pct={selectedBinDetail.pct} className="mt-3 h-2" />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <BinQuickActions
                variant="full"
                bin={selectedBinDetail}
                onAdd={() => setAddingBin(selectedBinDetail)}
                onSell={() => setSellingBin(selectedBinDetail)}
              />
            </section>
          </aside>
        </div>
      </>
    );
  } else {
    mainContent = (
      <>
        <section className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
            <p className="text-xs font-semibold text-muted-foreground sm:text-sm">Stored</p>
            <p className="mt-1 whitespace-nowrap font-mono text-lg font-bold text-foreground lg:text-2xl">{formatMeasurement(totals.stored, 'bu', 1)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
            <p className="text-xs font-semibold text-muted-foreground sm:text-sm">Capacity</p>
            <p className="mt-1 whitespace-nowrap font-mono text-lg font-bold text-foreground lg:text-2xl">{formatMeasurement(totals.capacity, 'bu', 1)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
            <p className="text-xs font-semibold text-muted-foreground sm:text-sm">Overall fill</p>
            <p className={cn('mt-1 whitespace-nowrap font-mono text-lg font-bold lg:text-2xl', CAPACITY_LEVEL_STYLES[getCapacityLevel(totalPercent)].tone)}>
              {roundTo(totalPercent, 0)}%
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">Bin status</h2>
              <p className="text-sm text-muted-foreground">Tap a bin to open monitoring and movement details.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {binOverview.map((bin) => {
              const level = getCapacityLevel(bin.pct);
              return (
                <button
                  key={bin.id}
                  type="button"
                  onClick={() => setSelectedBinId(bin.id)}
                  className="group rounded-2xl border border-border bg-background/60 p-4 text-left transition-colors hover:border-harvest/50 hover:bg-harvest/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Warehouse size={17} className="text-harvest" />
                        <h3 className="truncate text-base font-bold text-foreground">{bin.name}</h3>
                      </div>
                      <p className="mt-1 font-mono text-sm text-muted-foreground">
                        {formatMeasurement(bin.total, 'bu', 1)} of {formatMeasurement(bin.capacity, 'bu', 1)}
                      </p>
                    </div>
                    <span className={cn('font-mono text-2xl font-bold leading-none', CAPACITY_LEVEL_STYLES[level].tone)}>
                      {roundTo(bin.pct, 0)}%
                    </span>
                  </div>

                  <CapacityBar pct={bin.pct} className="mt-4 h-4 border border-border/50" />

                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{bin.movementCount} all-time movement{bin.movementCount !== 1 ? 's' : ''}</span>
                    <span className="font-semibold text-harvest group-hover:text-harvest">View details</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-4 lg:max-w-6xl lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-harvest/10">
              <Wheat size={20} className="text-harvest" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">Grain logistics</h1>
              <p className="text-xs text-muted-foreground">
                {bins.length} bin{bins.length !== 1 ? 's' : ''} &middot; all-time inventory
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncStatusIndicator />
            <Button
              variant={managing ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setManaging((value) => !value);
                setSelectedBinId(null);
              }}
              aria-label={managing ? 'Done managing bins' : 'Manage bins'}
              className={cn('touch-target min-h-11 min-w-11 px-3', managing && 'bg-harvest text-harvest-foreground hover:bg-harvest/90')}
            >
              <Settings size={16} className="sm:mr-2" />
              <span className="hidden sm:inline">{managing ? 'Done' : 'Manage'}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4 lg:max-w-6xl lg:px-8">{mainContent}</main>

      {sellingBin && <SellModal bin={sellingBin} open={!!sellingBin} onClose={() => setSellingBin(null)} />}
      {addingBin && <AddGrainModal bin={addingBin} open={!!addingBin} onClose={() => setAddingBin(null)} />}
    </div>
  );
}
