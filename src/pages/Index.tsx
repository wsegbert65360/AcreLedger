import { useState, useMemo } from 'react';
import { useFarm } from '@/store/farmStore';
import FieldCard from '@/components/FieldCard';
import BottomNav from '@/components/BottomNav';
import WeatherBar from '@/components/WeatherWidget';
import { FieldManager } from '@/components/FieldManageModal';
import { useFieldRainfall } from '@/hooks/useFieldRainfall';
import { Tractor, Settings, History } from 'lucide-react';

const Index = () => {
  const { fields: allFields } = useFarm();
  const { rowCrops, pastureHay } = useMemo(() => {
    return {
      rowCrops: allFields.filter(f => {
        const use = (f.intendedUse || '').toLowerCase();
        return !use.includes('pasture') && !use.includes('hay');
      }),
      pastureHay: allFields.filter(f => {
        const use = (f.intendedUse || '').toLowerCase();
        return use.includes('pasture') || use.includes('hay');
      })
    };
  }, [allFields]);

  const [managing, setManaging] = useState(false);
  const activeFieldsList = useMemo(() => [...rowCrops, ...pastureHay], [rowCrops, pastureHay]);
  const { rain, loading: rainLoading } = useFieldRainfall(activeFieldsList);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tractor size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">AcreLedger</h1>
              <p className="text-xs font-mono text-muted-foreground">{rowCrops.length + pastureHay.length} FIELDS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Manual trigger for rollover/restore modal
                // We'll just force it open for testing or manual maintenance
                // In a real app, this might open a separate History/Settings page
                const event = new CustomEvent('open-rollover');
                window.dispatchEvent(event);
              }}
              className="p-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="History & Backup"
            >
              <History size={20} />
            </button>
            <button
              onClick={() => setManaging(!managing)}
              className={`p-2.5 rounded-lg border transition-colors ${managing ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-3">
        <WeatherBar />
        {managing ? (
          <FieldManager />
        ) : (
          <>
            {rowCrops.length > 0 && (
              <div className="space-y-3">
                {pastureHay.length > 0 && (
                  <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Row Crops</h2>
                )}
                {rowCrops.map(field => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    rain24h={rain[field.id] ?? null}
                    rainLoading={rainLoading && rain[field.id] == null}
                  />
                ))}
              </div>
            )}

            {pastureHay.length > 0 && (
              <div className="space-y-3 pt-2">
                <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Pasture & Hay</h2>
                {pastureHay.map(field => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    rain24h={rain[field.id] ?? null}
                    rainLoading={rainLoading && rain[field.id] == null}
                  />
                ))}
              </div>
            )}
            {rowCrops.length === 0 && pastureHay.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <Tractor size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-mono font-bold text-foreground mb-1 italic">No Fields Detected</h3>
                <p className="text-xs text-muted-foreground font-mono leading-relaxed max-w-[200px] mx-auto uppercase">
                  Use the <Settings size={12} className="inline mx-0.5" /> icon above to add your first field.
                </p>
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
