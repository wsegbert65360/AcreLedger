import { useState } from 'react';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Sprout, CloudRain, Wheat, Printer, Download, History, Tractor } from 'lucide-react';
import { generateMissouriLog, exportFsa578Data, exportHarvestData, exportFertilizerData } from '@/lib/complianceReports';
import { formatIsoDate, parseLocalDate, formatDisplayDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';

type ReportTab = 'fsa-plant' | 'spray-audit' | 'fertilizer-summary' | 'fsa-harvest' | 'hay-summary';

export default function Reports() {
  const {
    plantRecords: allPlant,
    sprayRecords: allSpray,
    harvestRecords: allHarvest,
    hayHarvestRecords: allHay,
    grainMovements: allGrain,
    fertilizerApplications: allFertilizer,
    fields,
    activeSeason,
    viewingSeason,
    setViewingSeason
  } = useFarm();

  const [tab, setTab] = useState<ReportTab>('fsa-plant');

  // Filter records by the selected season year
  const plantRecords = allPlant.filter(r => r.seasonYear === viewingSeason);
  const sprayRecords = allSpray.filter(r => r.seasonYear === viewingSeason);
  const harvestRecords = allHarvest.filter(r => r.seasonYear === viewingSeason);
  const hayRecords = allHay.filter(r => r.seasonYear === viewingSeason);
  const fertilizerRecords = allFertilizer.filter(r => r.season_year === viewingSeason);

  // Derive available seasons for the selector
  const availableSeasons = Array.from(new Set([
    activeSeason,
    ...allPlant.map(r => r.seasonYear),
    ...allSpray.map(r => r.seasonYear),
    ...allHarvest.map(r => r.seasonYear),
    ...allHay.map(r => r.seasonYear),
    ...allGrain.map(r => r.seasonYear),
    ...allFertilizer.map(r => r.season_year)
  ])).filter((y): y is number => !!y).sort((a, b) => b - a);

  const fmt = (ts: number) => new Date(ts).toLocaleDateString();
  const fmtDate = (d?: string) => d ? formatIsoDate(d) : '—';

  const tabs: { key: ReportTab; icon: typeof Sprout; label: string; color: string }[] = [
    { key: 'fsa-plant', icon: Sprout, label: 'FSA Plant', color: 'text-plant' },
    { key: 'spray-audit', icon: CloudRain, label: 'Spray Audit', color: 'text-spray' },
    { key: 'fertilizer-summary', icon: Sprout, label: 'Fertilizer', color: 'text-lime-600 dark:text-lime-400' },
    { key: 'fsa-harvest', icon: Wheat, label: 'FSA Harvest', color: 'text-harvest' },
    { key: 'hay-summary', icon: Tractor, label: 'Hay Summary', color: 'text-harvest' },
  ];

  const handlePrint = () => window.print();

  // Totals based on filtered records
  const totalPlantAcres = roundTo(plantRecords.reduce((sum, r) => sum + r.acreage, 0), 2);
  const totalHarvestBu = roundTo(harvestRecords.reduce((sum, r) => sum + r.bushels, 0), 2);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-4 print:bg-background print:border-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center print:hidden">
              <FileText size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Reports</h1>
              <p className="text-xs font-mono text-muted-foreground">FSA & COMPLIANCE</p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="touch-target flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-lg text-foreground font-mono text-sm hover:bg-muted/80 transition-colors print:hidden"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Season Selector */}
        <div className="flex items-center justify-between gap-4 bg-muted/30 border border-border p-3 rounded-lg print:hidden">
          <div className="flex items-center gap-2">
            <History size={16} className="text-muted-foreground" />
            <span className="text-xs font-mono font-bold uppercase text-muted-foreground">Season View</span>
          </div>
          <Select
            value={viewingSeason.toString()}
            onValueChange={(v) => setViewingSeason(parseInt(v))}
          >
            <SelectTrigger className="w-[120px] h-9 font-mono text-sm bg-background border-border">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {availableSeasons.map(y => (
                <SelectItem key={y} value={y.toString()} className="font-mono text-xs">
                  {y} {y === activeSeason ? '(ACTIVE)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 print:hidden">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 touch-target flex items-center justify-center gap-1.5 rounded-md py-2.5 font-mono text-sm font-semibold transition-all ${tab === t.key ? `bg-muted ${t.color}` : 'text-muted-foreground'
                }`}
            >
              <t.icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* FSA Planting Report */}
        {tab === 'fsa-plant' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
              <h2 className="font-bold text-foreground text-base mb-1">FSA Planting Report</h2>
              <p className="text-xs font-mono text-muted-foreground mb-1">
                Acreage report for Farm Service Agency certification. Generated {new Date().toLocaleDateString()}.
              </p>

              <div className="flex gap-2 pb-4 print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-plant/30 text-plant hover:bg-plant/10"
                  onClick={() => exportFsa578Data(plantRecords, fields)}
                >
                  <Download size={12} className="mr-1.5" />
                  EXPORT CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-border text-muted-foreground hover:bg-muted"
                  onClick={() => window.print()}
                >
                  <Printer size={12} className="mr-1.5" />
                  PRINT PDF
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">DATE</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">FIELD</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">CROP</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">VARIETY</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">ACRES</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">FARM #</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">TRACT #</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">USE</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">IRR</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">SHARE %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plantRecords
                      .sort((a, b) => a.timestamp - b.timestamp)
                      .map(r => (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 px-2 font-mono text-xs text-foreground">{fmtDate(r.plantDate) || fmt(r.timestamp)}</td>
                          <td className="py-2 px-2 text-foreground font-semibold text-xs">{r.fieldName}</td>
                          <td className="py-2 px-2 font-mono text-xs text-harvest">{r.crop || '—'}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground">{r.seedVariety}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{r.acreage}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground">
                            {fields.find(f => f.id === r.fieldId)?.fsaFarmNumber || '—'}
                          </td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground">
                            {fields.find(f => f.id === r.fieldId)?.fsaTractNumber || '—'}
                          </td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground">{r.intendedUse || '—'}</td>
                          <td className="py-2 px-2 font-mono text-[10px] text-foreground">{r.irrigationPractice === 'Irrigated' ? 'IR' : 'NI'}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{(r.producerShare ?? 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/30">
                      <td colSpan={4} className="py-2 px-2 font-mono text-xs font-bold text-foreground">TOTAL</td>
                      <td className="py-2 px-2 font-mono text-xs font-bold text-plant text-right">{totalPlantAcres} ac</td>
                      <td colSpan={5}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {plantRecords.length === 0 && (
                <p className="text-center text-muted-foreground font-mono text-sm py-8">No planting records to report</p>
              )}
            </div>
          </div>
        )}

        {/* Spray Audit Report */}
        {tab === 'spray-audit' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
              <h2 className="font-bold text-foreground text-base mb-1">Pesticide Application Record</h2>
              <p className="text-xs font-mono text-muted-foreground mb-1">
                Private applicator license compliance audit trail. Generated {new Date().toLocaleDateString()}.
              </p>

              <div className="flex gap-2 pb-4 print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-spray/30 text-spray hover:bg-spray/10"
                  onClick={() => generateMissouriLog(sprayRecords, fields)}
                >
                  <Download size={12} className="mr-1.5" />
                  EXPORT CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-border text-muted-foreground hover:bg-muted"
                  onClick={() => window.print()}
                >
                  <Printer size={12} className="mr-1.5" />
                  PRINT PDF
                </Button>
              </div>

              {sprayRecords.length === 0 ? (
                <p className="text-center text-muted-foreground font-mono text-sm py-8">No spray records to report</p>
              ) : (
                <div className="space-y-4">
                  {sprayRecords
                    .sort((a, b) => a.timestamp - b.timestamp)
                    .flatMap(r => {
                      const field = fields.find(f => f.id === r.fieldId);
                      const treatedArea = parseFloat(r.treatedAreaSize || field?.acreage?.toString() || '0');

                      // If we have granular products, return a list of virtual records
                      if (r.products && r.products.length > 0) {
                        return r.products.map(p => ({
                          ...r,
                          id: `${r.id}-${p.product}`, // Unique key for mapping
                          product: p.product,
                          epaRegNumber: p.epaRegNumber,
                          applicationRate: p.rate,
                          rateUnit: p.rateUnit,
                          // Per-product total applied
                          amountDisplay: !isNaN(parseFloat(p.rate)) && treatedArea > 0
                            ? `${(parseFloat(p.rate) * treatedArea).toFixed(1)} ${p.rateUnit}`
                            : '—'
                        }));
                      }

                      // Fallback for legacy
                      return [{
                        ...r,
                        amountDisplay: r.totalAmountApplied ? `${r.totalAmountApplied} ${r.rateUnit || ''}` : '—'
                      }];
                    })
                    .map(r => (
                      <div key={r.id} className="border border-border/50 rounded-lg p-3 space-y-2 relative overflow-hidden">
                        {/* Audit specific color strip */}
                        <div className="absolute top-0 left-0 w-1 h-full bg-spray opacity-50" />

                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground text-sm uppercase font-mono tracking-tight">{r.fieldName}</span>
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {fmtDate(r.sprayDate) || fmt(r.timestamp)} {r.startTime ? ` @ ${r.startTime}` : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                          <div className="col-span-1"><span className="text-muted-foreground uppercase text-[9px]">Product:</span> <div className="text-spray font-bold">{r.product}</div></div>
                          <div className="col-span-1"><span className="text-muted-foreground uppercase text-[9px]">EPA Reg #:</span> <div className="text-foreground">{r.epaRegNumber || '—'}</div></div>

                          <div className="col-span-1"><span className="text-muted-foreground uppercase text-[9px]">Rate / Ac:</span> <div className="text-foreground">{r.applicationRate ? `${r.applicationRate} ${r.rateUnit || ''}` : '—'}</div></div>
                          <div className="col-span-1"><span className="text-muted-foreground uppercase text-[9px]">Total Acres Treated:</span> <div className="text-foreground font-bold">{r.treatedAreaSize || '—'}</div></div>

                          <div className="col-span-1"><span className="text-muted-foreground uppercase text-[9px]">Total Product:</span> <div className="text-foreground font-bold">{(r as { amountDisplay: string }).amountDisplay || '—'}</div></div>
                          <div className="col-span-1"><span className="text-muted-foreground uppercase text-[9px]">Equipment:</span> <div className="text-foreground">{r.equipmentId || '—'}</div></div>

                          <div className="col-span-2 pt-1 border-t border-border/30 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <div><span className="text-muted-foreground uppercase text-[9px]">Target Pest:</span> <span className="text-foreground font-bold">{r.targetPest || '—'}</span></div>
                            <div><span className="text-muted-foreground uppercase text-[9px]">Applicator:</span> <span className="text-foreground/80">{r.applicatorName || '—'}</span></div>
                            <div><span className="text-muted-foreground uppercase text-[9px]">License:</span> <span className="text-foreground/80">{r.licenseNumber || '—'}</span></div>
                          </div>

                          <div className="col-span-2 pt-1 flex flex-wrap gap-x-4 text-[10px] opacity-80">
                            <div><span className="text-muted-foreground uppercase text-[9px]">Wind:</span> <span className="text-foreground">{r.windSpeed} mph {r.windDirection || ''}</span></div>
                            <div><span className="text-muted-foreground uppercase text-[9px]">Temp:</span> <span className="text-foreground">{r.temperature}°F</span></div>
                            <div><span className="text-muted-foreground uppercase text-[9px]">Hum:</span> <span className="text-foreground">{r.relativeHumidity != null ? `${r.relativeHumidity}%` : '—'}</span></div>
                          </div>
                        </div>

                        {/* Compliance flags */}
                        <div className="flex gap-2 flex-wrap pt-1">
                          {r.windSpeed > 10 && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">⚠ WIND ALERT</span>
                          )}
                          {!r.epaRegNumber && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">NON-COMPLIANT: NO EPA #</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* FSA Harvest Report */}
        {tab === 'fsa-harvest' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
              <h2 className="font-bold text-foreground text-base mb-1">FSA Production Report</h2>
              <p className="text-xs font-mono text-muted-foreground mb-1">
                Harvest production for FSA yield reporting. Generated {new Date().toLocaleDateString()}.
              </p>

              <div className="flex gap-2 pb-4 print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-harvest/30 text-harvest hover:bg-harvest/10"
                  onClick={() => exportHarvestData(harvestRecords, fields)}
                >
                  <Download size={12} className="mr-1.5" />
                  EXPORT CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-border text-muted-foreground hover:bg-muted"
                  onClick={() => window.print()}
                >
                  <Printer size={12} className="mr-1.5" />
                  PRINT PDF
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">DATE</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">FIELD</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">CROP</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">BUSHELS</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">MOIST %</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">DEST.</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">LL %</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">FARM #</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">TRACT #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {harvestRecords
                      .sort((a, b) => a.timestamp - b.timestamp)
                      .map(r => (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 px-2 font-mono text-xs text-foreground">{fmtDate(r.harvestDate) || fmt(r.timestamp)}</td>
                          <td className="py-2 px-2 text-foreground font-semibold text-xs">{r.fieldName}</td>
                          <td className="py-2 px-2 font-mono text-xs text-harvest">{r.crop || '—'}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{r.bushels.toLocaleString()}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{r.moisturePercent}%</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground">{r.destination === 'bin' ? 'Bin' : 'Town'}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{r.landlordSplitPercent}%</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground">
                            {fields.find(f => f.id === r.fieldId)?.fsaFarmNumber || '—'}
                          </td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground">
                            {fields.find(f => f.id === r.fieldId)?.fsaTractNumber || '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-harvest/30">
                      <td colSpan={3} className="py-2 px-2 font-mono text-xs font-bold text-foreground">TOTAL</td>
                      <td className="py-2 px-2 font-mono text-xs font-bold text-harvest text-right">{totalHarvestBu.toLocaleString()} bu</td>
                      <td colSpan={5}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {harvestRecords.length === 0 && (
                <p className="text-center text-muted-foreground font-mono text-sm py-8">No harvest records to report</p>
              )}
            </div>
          </div>
        )}

        {/* Fertilizer Summary Report */}
        {tab === 'fertilizer-summary' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
              <h2 className="font-bold text-foreground text-base mb-1">Fertilizer Application Summary</h2>
              <p className="text-xs font-mono text-muted-foreground mb-4">
                Summary of fertilizer applications. Generated {new Date().toLocaleDateString()}.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">DATE</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">FIELD</th>
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">FORMULA</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">ACRES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fertilizerRecords
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map(r => (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 px-2 font-mono text-xs text-foreground uppercase tracking-tighter">{fmtDate(r.date)}</td>
                          <td className="py-2 px-2 text-foreground font-semibold text-xs min-w-[120px]">
                            {fields.find(f => f.id === r.fieldId)?.name || r.fieldName}
                          </td>
                          <td className="py-2 px-2 font-mono text-xs text-lime-600 dark:text-lime-400 font-bold">{r.fertilizer_formula}</td>
                          <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{r.acres}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-lime-500/30">
                      <td colSpan={3} className="py-2 px-4 font-mono text-[10px] font-bold text-muted-foreground uppercase">Grand Total Applied</td>
                      <td className="py-2 px-2 font-mono text-xs font-bold text-lime-600 dark:text-lime-400 text-right whitespace-nowrap">
                        {roundTo(fertilizerRecords.reduce((sum, r) => sum + r.acres, 0), 2)} ac
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {fertilizerRecords.length === 0 && (
                <p className="text-center text-muted-foreground font-mono text-sm py-8">No fertilizer records to report</p>
              )}
            </div>
          </div>
        )}

        {/* Hay Summary Report */}
        {tab === 'hay-summary' && (
          <div className="space-y-4 pb-8">
            <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
              <h2 className="font-bold text-foreground text-base mb-1">Hay Production Summary</h2>
              <p className="text-xs font-mono text-muted-foreground mb-4">
                Total bale production across all cuttings. Generated {new Date().toLocaleDateString()}.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-mono text-xs text-muted-foreground">FIELD</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">CUTTING #1</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">CUTTING #2</th>
                      <th className="text-right py-2 px-2 font-mono text-xs text-muted-foreground">CUTTING #3+</th>
                      <th className="text-right py-2 px-2 font-mono text-xs font-bold text-foreground border-l border-border/20 pl-4">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields
                      .filter(f => hayRecords.some(r => r.fieldId === f.id))
                      .map(f => {
                        const fieldHay = hayRecords.filter(r => r.fieldId === f.id);
                        const c1 = fieldHay.filter(r => r.cuttingNumber === 1).reduce((s, r) => s + r.baleCount, 0);
                        const c2 = fieldHay.filter(r => r.cuttingNumber === 2).reduce((s, r) => s + r.baleCount, 0);
                        const c3plus = fieldHay.filter(r => r.cuttingNumber >= 3).reduce((s, r) => s + r.baleCount, 0);
                        const total = c1 + c2 + c3plus;

                        return (
                          <tr key={f.id} className="border-b border-border/50">
                            <td className="py-2 px-2 text-foreground font-semibold text-xs">{f.name}</td>
                            <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{c1 || '—'}</td>
                            <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{c2 || '—'}</td>
                            <td className="py-2 px-2 font-mono text-xs text-foreground text-right">{c3plus || '—'}</td>
                            <td className="py-2 px-2 font-mono text-xs font-bold text-harvest text-right border-l border-border/20 pl-4">{total.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/30">
                      <td className="py-2 px-2 font-mono text-xs font-bold text-foreground uppercase">Grand Total</td>
                      <td className="py-2 px-2 font-mono text-xs font-bold text-foreground text-right">
                        {hayRecords.filter(r => r.cuttingNumber === 1).reduce((s, r) => s + r.baleCount, 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs font-bold text-foreground text-right">
                        {hayRecords.filter(r => r.cuttingNumber === 2).reduce((s, r) => s + r.baleCount, 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs font-bold text-foreground text-right">
                        {hayRecords.filter(r => r.cuttingNumber >= 3).reduce((s, r) => s + r.baleCount, 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs font-bold text-harvest text-right border-l border-border/30 pl-4">
                        {hayRecords.reduce((s, r) => s + r.baleCount, 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {hayRecords.length === 0 && (
                <p className="text-center text-muted-foreground font-mono text-sm py-8">No hay records to report</p>
              )}
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
