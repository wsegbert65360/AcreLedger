import { useState, useMemo } from 'react';
import { Settings, Tractor } from 'lucide-react';

import { useFarm } from '@/store/farmStore';
import FieldList from '@/components/FieldList';
import WeatherBar from '@/components/WeatherWidget';
import FieldManager from '@/components/FieldManager';
import Logo from '@/components/Logo';
import ErrorBoundary from '@/components/ErrorBoundary';
import { buildDisplayFieldAcreMap } from '@/lib/fieldAcreage';
import { formatMeasurement, roundTo } from '@/utils/numbers';

const Index = () => {
  const { fields: allFields, cluAssignments, viewingSeason } = useFarm();
  const { rowCrops, pastureHay, totalAcres, cropTotals } = useMemo(() => {
    let total = 0;
    const totals: Record<string, number> = {};
    const displayAcreMap = buildDisplayFieldAcreMap(allFields, cluAssignments);

    const rc = [];
    const ph = [];

    for (const f of allFields) {
      const use = f.intendedUse ? f.intendedUse.trim() : 'Unassigned';
      const useLower = use.toLowerCase();
      const displayAcres = displayAcreMap.get(f.id) ?? f.acreage;
      
      total += displayAcres;
      totals[use] = (totals[use] || 0) + displayAcres;

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
      totalAcres: roundTo(total, 0),
      cropTotals: sortedCropTotals.map(([crop, acres]) => [crop, roundTo(acres, 0)] as [string, number])
    };
  }, [allFields, cluAssignments]);

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
    <div className="min-h-screen bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
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
        <ErrorBoundary>
          <WeatherBar />
        </ErrorBoundary>
        {managing ? (
          <ErrorBoundary>
            <FieldManager />
          </ErrorBoundary>
        ) : (
          <>
            {allFields.length > 0 && (
              <div className="bg-muted/10 rounded-2xl border border-border/50 p-3 mb-4 space-y-2 mt-4">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-center">
                  Total Operation: {formatMeasurement(totalAcres, 'Acres')}
                </div>
                <div className="flex flex-row overflow-x-auto gap-2 items-center no-scrollbar w-full py-0.5">
                  {cropTotals.map(([crop, acres]) => {
                    const isActive = selectedCrops.includes(crop);
                    return (
                      <button
                        key={crop}
                        onClick={() => toggleCrop(crop)}
                        className={`flex-none flex items-center justify-center h-9 px-3 rounded-xl border transition-all active:scale-95 text-xs font-semibold ${isActive
                          ? 'ring-2 ring-primary bg-primary/10 border-primary/20 text-primary font-black shadow-sm'
                          : 'bg-background border-border/50 text-muted-foreground hover:bg-muted/50'
                          }`}
                      >
                        {crop}: {formatMeasurement(acres, 'AC')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {filteredRowCrops.length > 0 && (
              <div className="space-y-1">
                {filteredPastureHay.length > 0 && (
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Row Crops</h2>
                )}
                <ErrorBoundary>
                  <FieldList fields={filteredRowCrops} />
                </ErrorBoundary>
              </div>
            )}

            {filteredPastureHay.length > 0 && (
              <div className="space-y-1 pt-1">
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Pasture & Hay</h2>
                <ErrorBoundary>
                  <FieldList fields={filteredPastureHay} />
                </ErrorBoundary>
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

          </>
        )}
      </main>
    </div>
  );
};

export default Index;
