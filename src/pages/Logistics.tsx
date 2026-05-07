import { useMemo, useState } from 'react';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { Warehouse, Wheat, Settings, Banknote, Plus } from 'lucide-react';
import { BinManager } from '@/components/BinManageModal';
import SellModal from '@/components/SellModal';
import AddGrainModal from '@/components/AddGrainModal';
import { Button } from '@/components/ui/button';
import type { Bin } from '@/types/farm';

function formatMovementDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Logistics() {
  const { bins, getBinTotal, grainMovements, viewingSeason } = useFarm();
  const [managing, setManaging] = useState(false);
  const [sellingBin, setSellingBin] = useState<Bin | null>(null);
  const [addingBin, setAddingBin] = useState<Bin | null>(null);

  const binOverview = useMemo(() => {
    return bins.map(bin => {
      const total = getBinTotal(bin.id, viewingSeason);
      const pct = Math.min((total / bin.capacity) * 100, 100);
      const movements = grainMovements
        .filter(m => m.binId === bin.id && m.seasonYear === viewingSeason)
        .slice(-5) // Show more movements
        .reverse();

      return { ...bin, total, pct, recentMovements: movements };
    });
  }, [bins, getBinTotal, grainMovements, viewingSeason]);

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border pb-0">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between lg:max-w-5xl lg:px-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-harvest/10 flex items-center justify-center">
              <Wheat size={20} className="text-harvest" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Grain Logistics</h1>
              <p className="text-xs font-mono text-muted-foreground">{bins.length} BINS · {viewingSeason} SEASON</p>
            </div>
          </div>
          <button
            onClick={() => setManaging(!managing)}
            aria-label={managing ? "Exit management" : "Manage bins"}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors font-mono text-xs font-bold uppercase tracking-wide ${managing ? 'bg-harvest/10 border-harvest/30 text-harvest' : 'border-border text-muted-foreground hover:text-foreground'
               }`}
          >
            <Settings size={16} />
            <span>{managing ? 'Done' : 'Manage Bins'}</span>
          </button>
        </div>

      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4 lg:max-w-5xl lg:px-8">
        {managing ? (
          <BinManager />
        ) : (
          binOverview.length === 0 ? (
            <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
              <Warehouse size={48} className="mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-mono font-bold text-foreground mb-1 italic">No Storage Bins</h3>
              <p className="text-xs text-muted-foreground font-mono leading-relaxed max-w-[200px] mx-auto uppercase">
                Add bins using the <Settings size={12} className="inline mx-0.5" /> icon to start tracking inventory.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {binOverview.map(bin => (
              <div key={bin.id} className="bg-card border border-border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Warehouse size={18} className="text-harvest" />
                    <span className="font-bold text-foreground">{bin.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-foreground">
                      {bin.total.toLocaleString()} bu
                    </div>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      OF {bin.capacity.toLocaleString()} BU
                    </div>
                  </div>
                </div>

                {/* Capacity bar */}
                <div className="h-4 bg-muted rounded-full overflow-hidden border border-border/50">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${bin.pct > 85 ? 'bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.3)]' : bin.pct > 60 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-harvest shadow-[0_0_10px_rgba(212,175,55,0.3)]'}`}
                    style={{ width: `${bin.pct}%` }}
                  />
                </div>

                <div className="space-y-1 rounded-md border border-border/50 bg-muted/20 p-2">
                  <p className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wide">Recent Activity</p>
                  {bin.recentMovements.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No grain movement logged this season.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {bin.recentMovements.slice(0, 3).map((movement) => {
                        const signedBushels = movement.type === 'out' ? -Math.abs(movement.bushels) : movement.bushels;
                        const amountClass = signedBushels < 0 ? 'text-destructive' : 'text-primary';
                        const locationLabel = movement.type === 'in'
                          ? movement.sourceFieldName || 'Field transfer'
                          : movement.destination || 'Destination not set';

                        return (
                          <div key={movement.id} className="flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {movement.type === 'in' ? 'Inbound' : 'Outbound'} · {locationLabel}
                              </p>
                              <p className="font-mono text-muted-foreground">{formatMovementDate(movement.timestamp)}</p>
                            </div>
                            <span className={`font-mono font-bold ${amountClass}`}>
                              {signedBushels > 0 ? '+' : ''}{signedBushels.toLocaleString()} bu
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-harvest/5 border-harvest/30 text-harvest hover:bg-harvest/10 font-bold"
                    onClick={() => setAddingBin({ id: bin.id, name: bin.name, capacity: bin.capacity, deleted_at: null })}
                  >
                    <Plus size={16} className="mr-2" />
                    Add Grain
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bin.total <= 0}
                    className="flex-1 bg-harvest/5 border-harvest/30 text-harvest hover:bg-harvest/10 font-bold"
                    onClick={() => setSellingBin({ id: bin.id, name: bin.name, capacity: bin.capacity, deleted_at: null })}
                  >
                    <Banknote size={16} className="mr-2" />
                    Sell from Bin
                  </Button>
                </div>
              </div>
            ))}
            </div>
          )
        )}
      </main>

      {sellingBin && (
        <SellModal
          bin={sellingBin}
          open={!!sellingBin}
          onClose={() => setSellingBin(null)}
        />
      )}

      {addingBin && (
        <AddGrainModal
          bin={addingBin}
          open={!!addingBin}
          onClose={() => setAddingBin(null)}
        />
      )}


      <BottomNav />
    </div>
  );
}

