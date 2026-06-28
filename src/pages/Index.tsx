import { useState, useMemo } from 'react';
import { Settings, Tractor, Search, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

import { useFarm } from '@/store/farmStore';
import FieldList from '@/components/FieldList';
import WeatherBar from '@/components/WeatherWidget';
import FieldManager from '@/components/FieldManager';
import FieldManageModal from '@/components/FieldManageModal';
import Logo from '@/components/Logo';
import ErrorBoundary from '@/components/ErrorBoundary';
import { buildDisplayFieldAcreMap } from '@/lib/fieldAcreage';
import { formatMeasurement, roundTo } from '@/utils/numbers';

const Index = () => {
  const { fields: allFields, cluAssignments, viewingSeason, setViewingSeason, seasonOptions } = useFarm();
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

  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);

  const { filteredRowCrops, filteredPastureHay } = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();
    
    let rc = rowCrops;
    let ph = pastureHay;

    if (selectedCrops.length > 0) {
      rc = rowCrops.filter(f => selectedCrops.includes(f.intendedUse?.trim() || 'Unassigned'));
      ph = pastureHay.filter(f => selectedCrops.includes(f.intendedUse?.trim() || 'Unassigned'));
    }

    if (trimmedSearch) {
      rc = rc.filter(f => f.name.toLowerCase().includes(trimmedSearch));
      ph = ph.filter(f => f.name.toLowerCase().includes(trimmedSearch));
    }

    return {
      filteredRowCrops: rc,
      filteredPastureHay: ph
    };
  }, [rowCrops, pastureHay, selectedCrops, search]);

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
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {allFields.length} fields · 
                <Select 
                  value={viewingSeason.toString()} 
                  onValueChange={(val) => setViewingSeason(parseInt(val, 10))}
                >
                  <SelectTrigger className="h-5 py-0 px-1.5 text-xs font-bold border-none bg-transparent hover:bg-muted focus:ring-0 w-fit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {seasonOptions.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year} season</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Add new field"
              className="flex items-center gap-1.5 px-3 py-2 h-11 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-semibold"
            >
              <Plus size={16} className="text-primary" />
              <span>Add Field</span>
            </button>
            <button
              onClick={() => setManageOpen(true)}
              aria-label="Manage fields"
              className="flex items-center gap-1.5 px-3 py-2 h-11 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-semibold"
            >
              <Settings size={16} />
              <span>Manage</span>
            </button>
          </div>
        </div>

      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-3 lg:max-w-5xl lg:px-8">
        <ErrorBoundary>
          <WeatherBar />
        </ErrorBoundary>
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
                        className={`flex-none flex items-center justify-center h-11 px-3 rounded-xl border transition-all active:scale-95 text-xs font-semibold ${isActive
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
            {allFields.length > 0 && (
              <div className="relative mb-3">
                <Label htmlFor="field-search" className="sr-only">Search fields</Label>
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="field-search"
                  name="field-search"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  placeholder="Search fields by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 pl-9"
                />
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
            {allFields.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <Tractor size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-1">No Fields Detected</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
                  Tap <Plus size={12} className="inline mx-0.5" /> Add Field above to create your first field.
                </p>
              </div>
            )}

            {allFields.length > 0 && filteredRowCrops.length === 0 && filteredPastureHay.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {search.trim() ? `No fields match "${search}".` : 'No fields match the selected crops.'}
                </p>
              </div>
            )}

          </>
      </main>

      <FieldManageModal open={addOpen} onClose={() => setAddOpen(false)} />
      <Sheet open={manageOpen} onOpenChange={(o) => setManageOpen(o)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Manage Fields</SheetTitle>
            <SheetDescription className="sr-only">
              Add, edit, or delete fields. Deletions can be undone from the toast.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <FieldManager />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
