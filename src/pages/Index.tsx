import { useState, useMemo } from 'react';
import { useFarm } from '@/store/farmStore';
import FieldList from '@/components/FieldList';
import BottomNav from '@/components/BottomNav';
import WeatherBar from '@/components/WeatherWidget';
import FieldManager from '@/components/FieldManager';
import Logo from '@/components/Logo';
import DashboardStats, { DashboardStatsSkeleton } from '@/components/DashboardStats';
import { Settings, Tractor } from 'lucide-react';

const Index = () => {
  const { fields: allFields, viewingSeason, loading } = useFarm();
  const { rowCrops, pastureHay, totalAcres, cropTotals } = useMemo(() => {
    let total = 0;
    const totals: Record<string, number> = {};

    const rc = [];
    const ph = [];

    for (const f of allFields) {
      const use = f.intendedUse ? f.intendedUse.trim() : 'Unassigned';
      const useLower = use.toLowerCase();
      
      total += f.acreage;
      totals[use] = (totals[use] || 0) + f.acreage;

      if (useLower.includes('pasture') || useLower.includes('hay')) {
        ph.push(f);
      } else {
        rc.push(f);
      }
    }

    const sortedCropTotals = Object.entries(totals)
      .sort((a, b) => b[1] - a[1]);

    return {
      rowCrops: rc,
      pastureHay: ph,
      totalAcres: total,
      cropTotals: sortedCropTotals
    };
  }, [allFields]);

  const [managing, setManaging] = useState(false);
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);

  const { filteredRowCrops, filteredPastureHay } = useMemo(() => {
    if (selectedCrops.length === 0) {
      return { filteredRowCrops: rowCrops, filteredPastureHay: pastureHay };
    }
    return {
      filteredRowCrops: rowCrops.filter(f => selectedCrops.includes(f.intendedUse?.trim() || 'Unassigned')),
      filteredPastureHay: pastureHay.filter(f => selectedCrops.includes(f.intendedUse?.trim() || 'Unassigned'))
    };
  }, [rowCrops, pastureHay, selectedCrops]);

  const toggleCrop = (crop: string) => {
    setSelectedCrops(prev =>
      prev.includes(crop) ? prev.filter(c => c !== crop) : [...prev, crop]
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border print:hidden pb-0">
        <div className="max-w-lg mx-auto px-4 py-2 flex items-center justify-between lg:max-w-5xl lg:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-foreground tracking-tight hidden xs:block">Farm Overview</h1>
              <p className="text-xs text-muted-foreground">{allFields.length} fields · {viewingSeason} season</p>
            </div>
          </div>
          <button
            onClick={() => setManaging(!managing)}
            aria-label={managing ? 'Exit field management' : 'Manage fields'}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors text-xs font-semibold ${managing ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
               }`}
          >
            <Settings size={16} />
            <span>{managing ? 'Done' : 'Manage Fields'}</span>
          </button>
        </div>

      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-3 lg:max-w-5xl lg:px-8">
        {loading ? <DashboardStatsSkeleton /> : <DashboardStats />}
        <WeatherBar />
        {managing ? (
          <FieldManager />
        ) : (
          <>
            {filteredRowCrops.length > 0 && (
              <div className="space-y-1">
                {filteredPastureHay.length > 0 && (
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Row Crops</h2>
                )}
                <FieldList fields={filteredRowCrops} />
              </div>
            )}

            {filteredPastureHay.length > 0 && (
              <div className="space-y-1 pt-1">
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Pasture & Hay</h2>
                <FieldList fields={filteredPastureHay} />
              </div>
            )}
            {filteredRowCrops.length === 0 && filteredPastureHay.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <Tractor size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-1">No Fields Detected</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
                  Use the <Settings size={12} className="inline mx-0.5" /> icon above to add your first field.
                </p>
              </div>
            )}
            
            {allFields.length > 0 && (
            <div className="bg-background/60 backdrop-blur-xl sticky bottom-[72px] mt-8 border-t border-border/50 px-4 py-2 pb-12 z-30">
              {/* Glass Gradient Transition Overlay */}
              <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
              
              <div className="flex flex-col items-center justify-center space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Total Operation: {totalAcres} Acres
                  </div>
                  <div className="flex flex-row overflow-x-auto gap-2 items-center no-scrollbar w-full py-0.5">
                    {cropTotals.map(([crop, acres]) => {
                      const isActive = selectedCrops.includes(crop);
                      return (
                        <button
                          key={crop}
                          onClick={() => toggleCrop(crop)}
                          className={`flex-none flex items-center justify-center h-10 px-3 rounded-xl border transition-all active:scale-95 text-xs font-semibold ${isActive
                            ? 'ring-2 ring-primary bg-primary/10 border-primary/20 text-primary font-black shadow-sm'
                            : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50'
                            }`}
                        >
                          {crop}: {acres} AC
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Index;
