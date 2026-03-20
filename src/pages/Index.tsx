import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import FieldCard from '@/components/FieldCard';
import BottomNav from '@/components/BottomNav';
import WeatherBar from '@/components/WeatherWidget';
import FieldManager from '@/components/FieldManager';
import Logo from '@/components/Logo';
import { Settings, History, Tractor } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const { fields: allFields } = useFarm();
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
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border print:hidden pb-0">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-foreground tracking-tight hidden xs:block">Farm Overview</h1>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">{allFields.length} Fields · Active</p>
            </div>
          </div>
          <button
            onClick={() => setManaging(!managing)} // Re-using existing managing state for settings
            className={`p-2.5 rounded-lg border transition-colors ${managing ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
          >
            <Settings size={20} />
          </button>
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-plant/40 via-plant to-plant/40" />
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-3">
        <WeatherBar />
        {managing ? (
          <FieldManager />
        ) : (
          <>
            {filteredRowCrops.length > 0 && (
              <div className="space-y-3">
                {filteredPastureHay.length > 0 && (
                  <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Row Crops</h2>
                )}
                {filteredRowCrops.map(field => (
                  <FieldCard
                    key={field.id}
                    field={field}
                  />
                ))}
              </div>
            )}

            {filteredPastureHay.length > 0 && (
              <div className="space-y-3 pt-2">
                <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Pasture & Hay</h2>
                {filteredPastureHay.map(field => (
                  <FieldCard
                    key={field.id}
                    field={field}
                  />
                ))}
              </div>
            )}
            {filteredRowCrops.length === 0 && filteredPastureHay.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <Tractor size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-mono font-bold text-foreground mb-1 italic">No Fields Detected</h3>
                <p className="text-xs text-muted-foreground font-mono leading-relaxed max-w-[200px] mx-auto uppercase">
                  Use the <Settings size={12} className="inline mx-0.5" /> icon above to add your first field.
                </p>
              </div>
            )}
            
            {allFields.length > 0 && (
              <div className="bg-card/80 backdrop-blur-md sticky bottom-[72px] mt-8 border border-border p-4 rounded-xl shadow-xl z-30">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="text-sm font-black text-foreground tracking-tight uppercase">
                    Total Operation: {totalAcres} Acres
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold uppercase tracking-widest">
                    {cropTotals.map(([crop, acres]) => {
                      const isActive = selectedCrops.includes(crop);
                      return (
                        <button
                          key={crop}
                          onClick={() => toggleCrop(crop)}
                          className={`flex items-center justify-center h-[48px] px-4 rounded-xl border transition-all active:scale-95 ${isActive
                            ? 'ring-2 ring-primary bg-primary/10 border-primary/20 text-primary font-black shadow-sm'
                            : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50 font-bold'
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
