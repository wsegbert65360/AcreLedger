import { useMemo, useState } from 'react';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { Warehouse, Wheat, Settings, Banknote } from 'lucide-react';
import { BinManager } from '@/components/BinManageModal';
import SellModal from '@/components/SellModal';
import { Button } from '@/components/ui/button';
import type { Bin } from '@/types/farm';

export default function Logistics() {
  const { bins: allBins, getBinTotal, grainMovements, activeSeason } = useFarm();
  const bins = allBins.filter(b => !b.deleted_at);
  const [managing, setManaging] = useState(false);
  const [sellingBin, setSellingBin] = useState<Bin | null>(null);

  const binOverview = useMemo(() => {
    return bins.map(bin => {
      const total = getBinTotal(bin.id);
      const pct = Math.min((total / bin.capacity) * 100, 100);
      const movements = grainMovements
        .filter(m => m.binId === bin.id)
        .slice(-5) // Show more movements
        .reverse();

      return { ...bin, total, pct, recentMovements: movements };
    });
  }, [bins, getBinTotal, grainMovements, activeSeason]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-harvest/10 flex items-center justify-center">
              <Wheat size={20} className="text-harvest" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Grain Logistics</h1>
              <p className="text-xs font-mono text-muted-foreground">{bins.length} BINS · INVENTORY</p>
            </div>
          </div>
          <button
            onClick={() => setManaging(!managing)}
            className={`p-2.5 rounded-lg border transition-colors ${managing ? 'bg-harvest/10 border-harvest/30 text-harvest' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {managing ? (
          <BinManager />
        ) : (
          binOverview.map(bin => (
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
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                    OF {bin.capacity.toLocaleString()} BU
                  </div>
                </div>
              </div>

              {/* Capacity bar */}
              <div className="h-4 bg-muted rounded-full overflow-hidden border border-border/50">
                <div
                  className="h-full bg-harvest rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(212,175,55,0.3)]"
                  style={{ width: `${bin.pct}%` }}
                />
              </div>

              <div className="flex gap-2 pt-1 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bin.total <= 0}
                  className="flex-1 bg-harvest/5 border-harvest/30 text-harvest hover:bg-harvest/10 font-bold"
                  onClick={() => setSellingBin({ id: bin.id, name: bin.name, capacity: bin.capacity })}
                >
                  <Banknote size={16} className="mr-2" />
                  Sell from Bin
                </Button>
              </div>
            </div>
          ))
        )}
      </main>

      {sellingBin && (
        <SellModal
          bin={sellingBin}
          open={!!sellingBin}
          onClose={() => setSellingBin(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}

