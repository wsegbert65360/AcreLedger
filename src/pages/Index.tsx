import { useState, useMemo } from 'react';
import { Settings, Tractor, Search, Plus, X } from 'lucide-react';
import SeasonSelect from '@/components/SeasonSelect';
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
import {
  buildFieldActivityStatusMap,
  parseSearchQuery,
  fieldMatchesQuery,
} from '@/lib/fieldSearch';
import { formatMeasurement, roundTo } from '@/utils/numbers';

const Index = () => {
  const {
    fields: allFields,
    cluAssignments,
    plantRecords,
    sprayRecords,
    fertilizerApplications,
    harvestRecords,
    hayHarvestRecords,
    viewingSeason,
  } = useFarm();

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);

  const activityMap = useMemo(
    () => buildFieldActivityStatusMap(
      allFields,
      {
        plantRecords,
        sprayRecords,
        fertilizerApplications,
        harvestRecords,
        hayHarvestRecords,
      },
      viewingSeason,
    ),
    [allFields, plantRecords, sprayRecords, fertilizerApplications, harvestRecords, hayHarvestRecords, viewingSeason],
  );

  const parsedQuery = useMemo(() => parseSearchQuery(search), [search]);
  const hasSearch = parsedQuery.nameTerms.length > 0 || parsedQuery.statuses.length > 0;

  const { filteredRowCrops, filteredPastureHay } = useMemo(() => {
    let rc = rowCrops;
    let ph = pastureHay;

    if (selectedCrops.length > 0) {
      rc = rowCrops.filter(f => selectedCrops.includes(f.intendedUse?.trim() || 'Unassigned'));
      ph = pastureHay.filter(f => selectedCrops.includes(f.intendedUse?.trim() || 'Unassigned'));
    }

    if (hasSearch) {
      rc = rc.filter(f => fieldMatchesQuery(f.name, activityMap.get(f.id), parsedQuery));
      ph = ph.filter(f => fieldMatchesQuery(f.name, activityMap.get(f.id), parsedQuery));
    }

    return {
      filteredRowCrops: rc,
      filteredPastureHay: ph
    };
  }, [rowCrops, pastureHay, selectedCrops, hasSearch, activityMap, parsedQuery]);

  const toggleCrop = (crop: string) => {
    setSelectedCrops(prev =>
      prev.includes(crop) ? prev.filter(c => c !== crop) : [...prev, crop]
    );
  };

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearch('');
    } else {
      setSearchOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 shadow-sm backdrop-blur-xl print:hidden">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between gap-2 lg:max-w-5xl lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <div className="flex min-w-0 flex-col">
              <h1 className="text-sm font-bold text-foreground tracking-tight hidden xs:block">Farm Overview</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="whitespace-nowrap">{allFields.length} fields</span>
                <SeasonSelect className="min-w-[4.75rem] border-none bg-muted/60 px-2 text-xs shadow-none focus:ring-1 focus:ring-primary/30" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Add new field"
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 text-xs font-semibold text-primary shadow-sm transition-all hover:bg-primary/15 active:scale-95 sm:w-auto sm:px-3"
            >
              <Plus size={16} className="text-primary" />
              <span className="hidden sm:inline">Add field</span>
            </button>
            <button
              onClick={() => setManageOpen(true)}
              aria-label="Manage fields"
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-card/70 text-xs font-semibold text-muted-foreground shadow-sm transition-all hover:bg-card hover:text-foreground active:scale-95 sm:w-auto sm:px-3"
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Manage</span>
            </button>
          </div>
        </div>

      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4 lg:max-w-5xl lg:px-8 lg:py-6">
        <ErrorBoundary>
          <WeatherBar />
        </ErrorBoundary>
          <>
            {allFields.length > 0 && (
              <section className="rounded-2xl border border-border/70 bg-card/75 p-3.5 shadow-sm backdrop-blur-sm space-y-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Your operation</p>
                    <p className="font-mono text-lg font-bold tracking-tight text-foreground">{formatMeasurement(totalAcres, 'Acres')}</p>
                  </div>
                  <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {allFields.length} field{allFields.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="relative">
                <div className="flex flex-row overflow-x-auto gap-2 items-center no-scrollbar w-full py-0.5">
                  {cropTotals.map(([crop, acres]) => {
                    const isActive = selectedCrops.includes(crop);
                    return (
                      <button
                        key={crop}
                        onClick={() => toggleCrop(crop)}
                        className={`flex-none flex items-center justify-center h-11 px-3 rounded-xl border transition-all active:scale-95 text-xs font-semibold whitespace-nowrap ${isActive
                          ? 'ring-2 ring-primary bg-primary/10 border-primary/20 text-primary font-black shadow-sm'
                          : 'bg-background border-border/50 text-muted-foreground hover:bg-muted/50'
                          }`}
                      >
                        {crop}: {formatMeasurement(acres, 'AC')}
                      </button>
                    );
                  })}
                  <button
                    onClick={toggleSearch}
                    aria-label={searchOpen ? 'Close search' : 'Open search'}
                    aria-pressed={searchOpen}
                    className={`flex-none flex items-center justify-center gap-1 h-11 px-3 rounded-xl border transition-all active:scale-95 text-xs font-semibold whitespace-nowrap ${searchOpen || hasSearch
                      ? 'ring-2 ring-primary bg-primary/10 border-primary/20 text-primary font-black shadow-sm'
                      : 'bg-background border-border/50 text-muted-foreground hover:bg-muted/50'
                      }`}
                  >
                    <Search size={14} />
                    <span>Search</span>
                  </button>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-card via-card/60 to-transparent"
                />
                </div>
                {searchOpen && (
                  <div className="relative mt-1">
                    <Label htmlFor="field-search" className="sr-only">Search fields</Label>
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      id="field-search"
                      name="field-search"
                      type="search"
                      inputMode="search"
                      autoComplete="off"
                      placeholder="field name, planted, not sprayed, fertilized…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-11 pl-9 pr-9"
                      autoFocus
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            {filteredRowCrops.length > 0 && (
              <section className="space-y-2">
                {filteredPastureHay.length > 0 && (
                  <h2 className="px-1 text-sm font-bold tracking-tight text-foreground">Row crops</h2>
                )}
                <ErrorBoundary>
                  <FieldList fields={filteredRowCrops} />
                </ErrorBoundary>
              </section>
            )}

            {filteredPastureHay.length > 0 && (
              <section className="space-y-2 pt-1">
                <h2 className="px-1 text-sm font-bold tracking-tight text-foreground">Pasture & hay</h2>
                <ErrorBoundary>
                  <FieldList fields={filteredPastureHay} />
                </ErrorBoundary>
              </section>
            )}
            {allFields.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <Tractor size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-1">No fields yet</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
                  Tap <Plus size={12} className="inline mx-0.5" /> Add field above to create your first field.
                </p>
              </div>
            )}

            {allFields.length > 0 && filteredRowCrops.length === 0 && filteredPastureHay.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {hasSearch ? `No fields match "${search.trim()}".` : 'No fields match the selected crops.'}
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
