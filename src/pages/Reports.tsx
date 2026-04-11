import { useState, useMemo, useRef } from 'react';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Sprout, CloudRain, Wheat, Printer, Download, History, Tractor } from 'lucide-react';
import { generateMissouriLog, exportFsa578Data, exportHarvestData, exportFertilizerData, generateLandlordStatement, generateLandlordStatementCSV, getUniqueLandlordNames, exportToPdf } from '@/lib/complianceReports';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import ReportTable from '@/components/ReportTable';
import { toast } from 'sonner';
import { Field } from '@/types/farm';

// ─── Constants ────────────────────────────────────────────────────────────────

type ReportTab = 'fsa-plant' | 'spray-audit' | 'fertilizer-summary' | 'fsa-harvest' | 'hay-summary' | 'landlord-statement';

const WIND_ALERT_MPH = 10;

const TABS: { key: ReportTab; icon: typeof Sprout; label: string; color: string }[] = [
  { key: 'fsa-plant',          icon: Sprout,    label: 'FSA Plant',   color: 'text-plant' },
  { key: 'spray-audit',        icon: CloudRain, label: 'Spray Audit', color: 'text-spray' },
  { key: 'fertilizer-summary', icon: Sprout,    label: 'Fertilizer',  color: 'text-lime-600 dark:text-lime-400' },
  { key: 'fsa-harvest',        icon: Wheat,     label: 'FSA Harvest', color: 'text-harvest' },
  { key: 'hay-summary',        icon: Tractor,   label: 'Hay Summary', color: 'text-harvest' },
  { key: 'landlord-statement', icon: FileText,  label: 'Landlord',    color: 'text-blue-600' },
];

// ─── Pure helpers (module-level — not recreated on every render) ──────────────

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

function fmtDate(d?: string): string {
  return d ? formatIsoDate(d) : '—';
}

function buildFieldMap(fields: Field[]): Map<string, Field> {
  return new Map(fields.map(f => [f.id, f]));
}

function safeExport(fn: () => void, label: string): void {
  try {
    fn();
  } catch (err) {
    console.error(`Export failed (${label}):`, err);
    toast.error(`Failed to export ${label}. Please try again.`);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const {
    plantRecords:         allPlant,
    sprayRecords:         allSpray,
    harvestRecords:       allHarvest,
    hayHarvestRecords:    allHay,
    grainMovements:       allGrain,
    fertilizerApplications: allFertilizer,
    fields,
    activeSeason,
    viewingSeason,
    setViewingSeason,
  } = useFarm();

  const [tab, setTab] = useState<ReportTab>('fsa-plant');

  // Fixed at mount — subtitle dates don't shift on re-render or after midnight
  const reportDateRef = useRef(new Date().toLocaleDateString());
  const reportDate = reportDateRef.current;

  // O(1) field lookup — built once per fields change, not per row
  const fieldMap = useMemo(() => buildFieldMap(fields), [fields]);

  // Season selector options — memoized across all record arrays
  const availableSeasons = useMemo(() => Array.from(new Set([
    activeSeason,
    ...allPlant.map(r => r.seasonYear),
    ...allSpray.map(r => r.seasonYear),
    ...allHarvest.map(r => r.seasonYear),
    ...allHay.map(r => r.seasonYear),
    ...allGrain.map(r => r.seasonYear),
    ...allFertilizer.map(r => r.seasonYear),
  ])).filter((y): y is number => !!y).sort((a, b) => b - a),
  [activeSeason, allPlant, allSpray, allHarvest, allHay, allGrain, allFertilizer]);

  // Season-filtered record sets — memoized, sorted, non-mutating
  const plantRecords = useMemo(() =>
    [...allPlant.filter(r => r.seasonYear === viewingSeason)]
      .sort((a, b) => a.timestamp - b.timestamp),
  [allPlant, viewingSeason]);

  const sprayRecords = useMemo(() =>
    [...allSpray.filter(r => r.seasonYear === viewingSeason)]
      .sort((a, b) => a.timestamp - b.timestamp),
  [allSpray, viewingSeason]);

  const harvestRecords = useMemo(() =>
    [...allHarvest.filter(r => r.seasonYear === viewingSeason)]
      .sort((a, b) => a.timestamp - b.timestamp),
  [allHarvest, viewingSeason]);

  const hayRecords = useMemo(() =>
    allHay.filter(r => r.seasonYear === viewingSeason),
  [allHay, viewingSeason]);

  const fertilizerRecords = useMemo(() =>
    [...allFertilizer.filter(r => r.seasonYear === viewingSeason)]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  [allFertilizer, viewingSeason]);

  // Expanded spray rows — memoized, keyed by index to avoid product-name collisions
  const sprayRows = useMemo(() => sprayRecords.flatMap(r => {
    const field = fieldMap.get(r.fieldId);
    const treatedArea = r.treatedAreaSize ?? field?.acreage ?? 0;

    if (r.products && r.products.length > 0) {
      return r.products.map((p, i) => ({
        ...r,
        _rowKey: `${r.id}-${i}`,                     // index-based key — no collision on duplicate product names
        product: p.product,
        epaRegNumber: p.epaRegNumber,
        applicationRate: p.rate,
        rateUnit: p.rateUnit,
        amountDisplay: !isNaN(parseFloat(p.rate)) && treatedArea > 0
          ? `${(parseFloat(p.rate) * treatedArea).toFixed(1)} ${p.rateUnit}`
          : '—',
      }));
    }

    return [{
      ...r,
      _rowKey: r.id,
      product: '—',
      amountDisplay: r.totalAmountApplied ? `${r.totalAmountApplied} ${r.rateUnit || ''}` : '—',
    }];
  }), [sprayRecords, fieldMap]);

  // Summary totals
  const totalPlantAcres  = useMemo(() => roundTo(plantRecords.reduce((s, r) => s + r.acreage,  0), 2), [plantRecords]);
  const totalHarvestBu   = useMemo(() => roundTo(harvestRecords.reduce((s, r) => s + r.bushels, 0), 2), [harvestRecords]);
  const totalFertAcres   = useMemo(() => roundTo(fertilizerRecords.reduce((s, r) => s + r.acres, 0), 2), [fertilizerRecords]);
  const totalHayBales    = useMemo(() => hayRecords.reduce((s, r) => s + r.baleCount, 0), [hayRecords]);

  // Pre-calculate hay statistics per field
  const hayStats = useMemo(() => {
    const statsMap = new Map<string, { c1: number; c2: number; c3plus: number; total: number }>();
    for (const r of hayRecords) {
      const stats = statsMap.get(r.fieldId) || { c1: 0, c2: 0, c3plus: 0, total: 0 };
      if (r.cuttingNumber === 1) stats.c1 += r.baleCount;
      else if (r.cuttingNumber === 2) stats.c2 += r.baleCount;
      else if (r.cuttingNumber >= 3) stats.c3plus += r.baleCount;
      stats.total += r.baleCount;
      statsMap.set(r.fieldId, stats);
    }
    return statsMap;
  }, [hayRecords]);

  // Landlord specific logic
  const [selectedLandlord, setSelectedLandlord] = useState<string>('');
  const uniqueLandlords = useMemo(() => getUniqueLandlordNames(harvestRecords), [harvestRecords]);

  const landlordStatement = useMemo(() => {
    if (!selectedLandlord) return null;
    return generateLandlordStatement(harvestRecords, selectedLandlord);
  }, [harvestRecords, selectedLandlord]);

  const handlePrint = () => window.print();

  const handleExportLandlordCSV = () => {
    if (!landlordStatement) return;
    safeExport(() => {
      const csv = generateLandlordStatementCSV(landlordStatement);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${selectedLandlord.replace(/\s+/g, '_')}_CropShare.csv`);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000); // Wait 2s to ensure browser starts download
    }, 'landlord statement');
  };

  const handleExportFsaPlantPdf = () => {
    safeExport(() => {
      exportToPdf({
        title: 'FSA Planting Report',
        subtitle: `Acreage report for Farm Service Agency certification. Generated ${reportDate}.`,
        headers: ['DATE', 'FIELD', 'CROP', 'VARIETY', 'ACRES', 'FARM #', 'TRACT #', 'FIELD #', 'USE', 'IRR', 'SHARE %'],
        rows: plantRecords.map(r => {
          const field = fieldMap.get(r.fieldId);
          return [
            fmtDate(r.plantDate) || fmt(r.timestamp),
            r.fieldName,
            r.crop || '—',
            r.seedVariety,
            r.acreage,
            r.fsaFarmNumber || field?.fsaFarmNumber || '—',
            r.fsaTractNumber || field?.fsaTractNumber || '—',
            r.fsaFieldNumber || field?.fsaFieldNumber || '—',
            r.intendedUse || '—',
            r.irrigationPractice === 'Irrigated' ? 'IR' : 'NI',
            `${(r.producerShare ?? field?.producerShare ?? 100).toFixed(0)}%`
          ];
        }),
        fileName: `FSA_Planting_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`,
        summaryText: 'Total Planted Acreage',
        summaryValue: `${totalPlantAcres} AC`
      });
    }, 'FSA planting PDF');
  };

  const handleExportSprayAuditPdf = () => {
    safeExport(() => {
      exportToPdf({
        title: 'Pesticide Application Record',
        subtitle: `Compliance audit trail. Generated ${reportDate}.`,
        headers: ['DATE', 'FIELD', 'PRODUCT', 'EPA #', 'RATE', 'ACRES', 'TOTAL', 'WIND'],
        rows: sprayRows.map(r => [
          fmtDate(r.sprayDate) || fmt(r.timestamp),
          r.fieldName,
          r.product,
          r.epaRegNumber || '—',
          r.applicationRate ? `${r.applicationRate} ${r.rateUnit || ''}` : '—',
          r.treatedAreaSize || '—',
          r.amountDisplay,
          `${r.windSpeed} mph ${r.windDirection || ''}`
        ]),
        fileName: `Spray_Log_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`
      });
    }, 'spray audit PDF');
  };

  const handleExportFertilizerPdf = () => {
    safeExport(() => {
      exportToPdf({
        title: 'Fertilizer Application Summary',
        subtitle: `Generated ${reportDate}.`,
        headers: ['DATE', 'FIELD', 'FORMULA', 'ACRES'],
        rows: fertilizerRecords.map(r => [
          fmtDate(r.date),
          fieldMap.get(r.fieldId)?.name || r.fieldName,
          r.fertilizer_formula,
          r.acres
        ]),
        fileName: `Fertilizer_Summary_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`,
        summaryText: 'Grand Total Applied',
        summaryValue: `${totalFertAcres} AC`
      });
    }, 'fertilizer PDF');
  };

  const handleExportHarvestPdf = () => {
    safeExport(() => {
      exportToPdf({
        title: 'FSA Harvest Report',
        subtitle: `Grain production report for FSA certification. Generated ${reportDate}.`,
        headers: ['DATE', 'FIELD', 'CROP', 'BUSHELS', 'MOIST %', 'DEST.', 'LL %', 'LL NAME', 'TICKET #', 'FARM #', 'TRACT #'],
        rows: harvestRecords.map(r => {
          const field = fieldMap.get(r.fieldId);
          return [
            fmtDate(r.harvestDate) || fmt(r.timestamp),
            r.fieldName,
            r.crop || '—',
            r.bushels.toLocaleString(),
            `${r.moisturePercent}%`,
            r.destination === 'bin' ? 'Bin' : 'Town',
            `${r.landlordSplitPercent}%`,
            r.landlordName || '—',
            r.scaleTicketNumber || '—',
            r.fsaFarmNumber || field?.fsaFarmNumber || '—',
            r.fsaTractNumber || field?.fsaTractNumber || '—'
          ];
        }),
        fileName: `FSA_Harvest_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`,
        summaryText: 'Total Harvest Production',
        summaryValue: `${totalHarvestBu.toLocaleString()} BU`
      });
    }, 'harvest PDF');
  };

  const handleExportHayPdf = () => {
    safeExport(() => {
      const records = fields
        .filter(f => hayStats.has(f.id))
        .map(f => {
          const stats = hayStats.get(f.id)!;
          return [
            f.name,
            stats.c1 || '—',
            stats.c2 || '—',
            stats.c3plus || '—',
            stats.total.toLocaleString()
          ];
        });

      exportToPdf({
        title: 'Hay Production Summary',
        subtitle: `Total bale production across all cuttings. Generated ${reportDate}.`,
        headers: ['FIELD', 'CUTTING #1', 'CUTTING #2', 'CUTTING #3+', 'TOTAL'],
        rows: records,
        fileName: `Hay_Summary_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`,
        summaryText: 'Season Grand Total',
        summaryValue: `${totalHayBales.toLocaleString()} BALES`
      });
    }, 'hay summary PDF');
  };

  const handleExportLandlordPdf = () => {
    if (!landlordStatement) return;
    safeExport(() => {
      exportToPdf({
        title: 'Landlord Crop Share Statement',
        subtitle: `Prepared for: ${selectedLandlord}. Generated ${reportDate}.`,
        headers: ['FIELD', 'CROP', 'DATE', 'TOTAL BU.', 'SPLIT %', 'YOUR SHARE'],
        rows: landlordStatement.rows.map(r => [
          r.fieldName,
          r.crop,
          r.harvestDate, // already formatted MM/DD/YYYY in the statement generator
          r.totalBushels.toLocaleString(),
          `${r.landlordSplitPercent}%`,
          r.landlordBushels.toLocaleString()
        ]),
        fileName: `${selectedLandlord.replace(/\s+/g, '_')}_CropShare_${viewingSeason}.pdf`,
        summaryText: 'Total Landlord Share',
        summaryValue: `${landlordStatement.totalLandlordBushels.toLocaleString()} BU`
      });
    }, 'landlord PDF');
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border pb-0 print:bg-background print:border-0">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center print:hidden">
              <FileText size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Reports</h1>
              <p className="text-xs font-mono text-muted-foreground">FSA & COMPLIANCE</p>
            </div>
          </div>
          {/* Single print button — header only, consistent across all tabs */}
          <button
            onClick={handlePrint}
            className="touch-target flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-lg text-foreground font-mono text-sm hover:bg-muted/80 transition-colors print:hidden"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 print:hidden" />
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
            onValueChange={(v) => setViewingSeason(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[120px] h-9 font-mono text-sm bg-background border-border">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {availableSeasons.map(y => (
                <SelectItem key={y} value={y.toString()} className="font-mono text-xs">
                  {y}{y === activeSeason ? ' (ACTIVE)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 print:hidden">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 touch-target flex items-center justify-center gap-1.5 rounded-md py-2.5 font-mono text-sm font-semibold transition-all ${
                tab === t.key ? `bg-muted ${t.color}` : 'text-muted-foreground'
              }`}
            >
              <t.icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── FSA Planting Report ─────────────────────────────────────────────── */}
        {tab === 'fsa-plant' && (
          <ReportTable
            title="FSA Planting Report"
            subtitle={`Acreage report for Farm Service Agency certification. Generated ${reportDate}.`}
            headers={['DATE', 'FIELD', 'CROP', 'VARIETY', 'ACRES', 'FARM #', 'TRACT #', 'FIELD #', 'USE', 'IRR', 'SHARE %']}
            onExport={() => safeExport(() => exportFsa578Data(plantRecords, fields), 'FSA planting data')}
            onExportPdf={handleExportFsaPlantPdf}
            exportLabel="CSV"
            summary={(
              <div className="flex justify-between items-center font-mono text-sm">
                <span className="font-bold text-muted-foreground uppercase">TOTAL PLANTED ACREAGE</span>
                <span className="font-bold text-plant">{totalPlantAcres} AC</span>
              </div>
            )}
          >
            {plantRecords.map(r => {
              const field = fieldMap.get(r.fieldId);
              return (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{fmtDate(r.plantDate) || fmt(r.timestamp)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-foreground">{r.fieldName}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-harvest font-bold">{r.crop || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.seedVariety}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.acreage}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.fsaFarmNumber || field?.fsaFarmNumber || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.fsaTractNumber || field?.fsaTractNumber || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.fsaFieldNumber || field?.fsaFieldNumber || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.intendedUse || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.irrigationPractice === 'Irrigated' ? 'IR' : 'NI'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{(r.producerShare ?? field?.producerShare ?? 100).toFixed(0)}%</td>
                </tr>
              );
            })}
            {plantRecords.length === 0 && (
              <tr>
                <td colSpan={11} className="py-12 text-center text-muted-foreground font-mono text-xs">
                  No planting records to report for this season
                </td>
              </tr>
            )}
          </ReportTable>
        )}

        {/* ── Spray Audit ─────────────────────────────────────────────────────── */}
        {tab === 'spray-audit' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
              <h2 className="font-bold text-foreground text-base mb-1">Pesticide Application Record</h2>
              <p className="text-xs font-mono text-muted-foreground mb-1">
                Private applicator license compliance audit trail. Generated {reportDate}.
              </p>

              <div className="flex gap-2 pb-4 print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-spray/30 text-spray hover:bg-spray/10"
                  onClick={() => safeExport(() => generateMissouriLog(sprayRecords, fields), 'spray log')}
                >
                  <Download size={12} className="mr-1.5" />
                  CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[10px] font-mono border-primary/30 text-primary hover:bg-primary/10"
                  onClick={handleExportSprayAuditPdf}
                >
                  <Download size={12} className="mr-1.5" />
                  PDF
                </Button>
              </div>

              {sprayRows.length === 0 ? (
                <p className="text-center text-muted-foreground font-mono text-sm py-8">
                  No spray records to report
                </p>
              ) : (
                <div className="space-y-4">
                  {sprayRows.map(r => (
                    <div key={r._rowKey} className="border border-border/50 rounded-lg p-3 space-y-2 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-spray opacity-50" />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-sm uppercase font-mono tracking-tight">{r.fieldName}</span>
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {fmtDate(r.sprayDate) || fmt(r.timestamp)}{r.startTime ? ` @ ${r.startTime}` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                        <div><span className="text-muted-foreground uppercase text-[9px]">Product:</span><div className="text-spray font-bold">{r.product}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[9px]">EPA Reg #:</span><div className="text-foreground">{r.epaRegNumber || '—'}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[9px]">Rate / Ac:</span><div className="text-foreground">{r.applicationRate ? `${r.applicationRate} ${r.rateUnit || ''}` : '—'}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[9px]">Total Acres Treated:</span><div className="text-foreground font-bold">{r.treatedAreaSize || '—'}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[9px]">Total Product:</span><div className="text-foreground font-bold">{r.amountDisplay}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[9px]">Equipment:</span><div className="text-foreground">{r.equipmentId || '—'}</div></div>
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
                      <div className="flex gap-2 flex-wrap pt-1">
                        {r.windSpeed > WIND_ALERT_MPH && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            ⚠ WIND ALERT
                          </span>
                        )}
                        {!r.epaRegNumber && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
                            NON-COMPLIANT: NO EPA #
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Fertilizer Summary ──────────────────────────────────────────────── */}
        {tab === 'fertilizer-summary' && (
          <ReportTable
            title="Fertilizer Application Summary"
            subtitle={`Summary of fertilizer applications. Generated ${reportDate}.`}
            headers={['DATE', 'FIELD', 'FORMULA', 'ACRES']}
            onExport={() => safeExport(() => exportFertilizerData(fertilizerRecords, fields), 'fertilizer data')}
            onExportPdf={handleExportFertilizerPdf}
            exportLabel="CSV"
            summary={(
              <div className="flex justify-between items-center font-mono text-sm">
                <span className="font-bold text-muted-foreground uppercase">GRAND TOTAL APPLIED</span>
                <span className="font-bold text-lime-600 dark:text-lime-400">{totalFertAcres} AC</span>
              </div>
            )}
          >
            {fertilizerRecords.map(r => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-[10px] text-foreground uppercase tracking-tighter">{fmtDate(r.date)}</td>
                <td className="px-4 py-3 text-xs font-bold text-foreground sm:min-w-[120px]">
                  {fieldMap.get(r.fieldId)?.name || r.fieldName}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-lime-600 dark:text-lime-400 font-bold">{r.fertilizer_formula}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.acres}</td>
              </tr>
            ))}
            {fertilizerRecords.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground font-mono text-xs">
                  No fertilizer records to report for this season
                </td>
              </tr>
            )}
          </ReportTable>
        )}

        {/* ── FSA Harvest Report ──────────────────────────────────────────────── */}
        {tab === 'fsa-harvest' && (
          <ReportTable
            title="FSA Harvest Report"
            subtitle={`Grain production report for FSA certification. Generated ${reportDate}.`}
            headers={['DATE', 'FIELD', 'CROP', 'BUSHELS', 'MOIST %', 'DEST.', 'LL %', 'LL NAME', 'TICKET #', 'FARM #', 'TRACT #']}
            onExport={() => safeExport(() => exportHarvestData(harvestRecords, fields), 'harvest data')}
            onExportPdf={handleExportHarvestPdf}
            exportLabel="CSV"
            summary={(
              <div className="flex justify-between items-center font-mono text-sm">
                <span className="font-bold text-muted-foreground uppercase">TOTAL HARVEST PRODUCTION</span>
                <span className="font-bold text-harvest">{totalHarvestBu.toLocaleString()} BU</span>
              </div>
            )}
          >
            {harvestRecords.map(r => {
              const field = fieldMap.get(r.fieldId);
              return (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{fmtDate(r.harvestDate) || fmt(r.timestamp)}</td>
                  <td className="px-4 py-3 text-xs font-bold text-foreground">{r.fieldName}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-harvest font-bold">{r.crop || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.bushels.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.moisturePercent}%</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.destination === 'bin' ? 'Bin' : 'Town'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.landlordSplitPercent}%</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground truncate max-w-[80px]">{r.landlordName || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground truncate max-w-[80px]">{r.scaleTicketNumber || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.fsaFarmNumber || field?.fsaFarmNumber || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.fsaTractNumber || field?.fsaTractNumber || '—'}</td>
                </tr>
              );
            })}
            {harvestRecords.length === 0 && (
              <tr>
                <td colSpan={11} className="py-12 text-center text-muted-foreground font-mono text-xs">
                  No harvest records to report for this season
                </td>
              </tr>
            )}
          </ReportTable>
        )}

        {/* ── Hay Summary ─────────────────────────────────────────────────────── */}
        {tab === 'hay-summary' && (
          <ReportTable
            title="Hay Production Summary"
            subtitle={`Total bale production across all cuttings. Generated ${reportDate}.`}
            headers={['FIELD', 'CUTTING #1', 'CUTTING #2', 'CUTTING #3+', 'TOTAL']}
            onExportPdf={handleExportHayPdf}
            summary={(
              <div className="flex justify-between items-center font-mono text-sm">
                <span className="font-bold text-muted-foreground uppercase">SEASON GRAND TOTAL</span>
                <span className="font-bold text-harvest">{totalHayBales.toLocaleString()} BALES</span>
              </div>
            )}
          >
            {fields
              .filter(f => hayStats.has(f.id))
              .map(f => {
                const stats = hayStats.get(f.id)!;
                return (
                  <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-foreground">{f.name}</td>
                    {/* Use explicit zero check — stats.c1 > 0 avoids hiding a legitimate 0 bale count */}
                    <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{stats.c1 > 0 ? stats.c1 : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{stats.c2 > 0 ? stats.c2 : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{stats.c3plus > 0 ? stats.c3plus : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[10px] font-bold text-harvest text-right border-l border-border/20">
                      {stats.total.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            {hayRecords.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground font-mono text-xs">
                  No hay records to report for this season
                </td>
              </tr>
            )}
          </ReportTable>
        )}

        {/* ── Landlord Statement ──────────────────────────────────────────────── */}
        {tab === 'landlord-statement' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 print:hidden">
                <div>
                  <h2 className="font-bold text-foreground text-base mb-1">Landlord Crop Share Statement</h2>
                  <p className="text-xs font-mono text-muted-foreground">
                    Per-landlord production summary. Generated {reportDate}.
                  </p>
                </div>
                <Select value={selectedLandlord} onValueChange={setSelectedLandlord}>
                  <SelectTrigger className="w-full sm:w-[200px] h-9 font-mono text-sm bg-background border-border">
                    <SelectValue placeholder="Select Landlord" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {uniqueLandlords.map((name: string) => (
                      <SelectItem key={name} value={name} className="font-mono text-xs">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedLandlord ? (
                <div className="py-12 text-center border-2 border-dashed border-border rounded-lg bg-muted/20">
                  <p className="text-muted-foreground font-mono text-sm">
                    Select a landlord to generate their statement
                  </p>
                </div>
              ) : landlordStatement ? (
                <div className="space-y-6">
                  <div className="flex gap-2 print:hidden">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[10px] font-mono border-blue-500/30 text-blue-600 hover:bg-blue-50"
                      onClick={handleExportLandlordCSV}
                    >
                      <Download size={12} className="mr-1.5" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[10px] font-mono border-primary/30 text-primary hover:bg-primary/10"
                      onClick={handleExportLandlordPdf}
                    >
                      <Download size={12} className="mr-1.5" />
                      PDF
                    </Button>
                  </div>

                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full border-collapse">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-left font-mono text-[10px] text-muted-foreground uppercase">Field</th>
                          <th className="px-4 py-3 text-left font-mono text-[10px] text-muted-foreground uppercase">Crop</th>
                          <th className="px-4 py-3 text-left font-mono text-[10px] text-muted-foreground uppercase">Date</th>
                          <th className="px-4 py-3 text-right font-mono text-[10px] text-muted-foreground uppercase">Total Bu.</th>
                          <th className="px-4 py-3 text-right font-mono text-[10px] text-muted-foreground uppercase">Split %</th>
                          <th className="px-4 py-3 text-right font-mono text-[10px] text-muted-foreground uppercase">Your Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {landlordStatement.rows.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-foreground">{r.fieldName}</td>
                            <td className="px-4 py-3 font-mono text-[10px] text-harvest font-bold">{r.crop}</td>
                            <td className="px-4 py-3 font-mono text-[10px] text-foreground">{r.harvestDate}</td>
                            <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.totalBushels.toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.landlordSplitPercent}%</td>
                            <td className="px-4 py-3 font-mono text-[10px] text-blue-600 font-bold text-right">{r.landlordBushels.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-500/5 border-t-2 border-primary">
                        <tr>
                          <td colSpan={5} className="px-4 py-4 font-mono text-sm font-bold text-muted-foreground uppercase">
                            Total Landlord Share
                          </td>
                          <td className="px-4 py-4 font-mono text-base font-black text-blue-600 text-right">
                            {landlordStatement.totalLandlordBushels.toLocaleString()} BU
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}