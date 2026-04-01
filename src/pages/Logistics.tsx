import { useMemo, useState } from 'react';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { Warehouse, Wheat, Settings, Banknote, Plus } from 'lucide-react';
import { BinManager } from '@/components/BinManageModal';
import SellModal from '@/components/SellModal';
import AddGrainModal from '@/components/AddGrainModal';
import { Button } from '@/components/ui/button';
import type { Bin } from '@/types/farm';

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
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border pb-0">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
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
            aria-label={managing ? "Exit management" : "Manage bins"}
            className={`p-2.5 rounded-lg border transition-colors ${managing ? 'bg-harvest/10 border-harvest/30 text-harvest' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
          >
            <Settings size={20} />
          </button>
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-harvest/40 via-harvest to-harvest/40" />
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
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
            ))
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

