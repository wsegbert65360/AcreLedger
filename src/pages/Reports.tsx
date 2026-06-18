import { useState, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { FileText, Sprout, CloudRain, Wheat, Printer, Download, History as HistoryIcon, Tractor } from 'lucide-react';
import { toast } from 'sonner';

import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mergeBundledFsaTracts } from '@/lib/bundledFsaTracts';
import { buildFsa578Rows, buildFsaFallProductionRows, calculateFsa578PlantedAcreTotals, generateMissouriLog, exportFsa578Data, exportFsaFallProductionData, exportFertilizerData, generateLandlordStatement, generateLandlordStatementCSV, getUniqueLandlordNames, exportToPdf, validateFsa578Rows, validateFsaFallProductionRows } from '@/lib/complianceReports';
import { native, sanitizeNativeFileName } from '@/lib/native';
import { generateSprayPDF } from '@/lib/sprayExport';
import ReportTable from '@/components/ReportTable';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { formatTotalAmount } from '@/utils/unitConversion';
import { Field } from '@/types/farm';

// ─── Constants ────────────────────────────────────────────────────────────────

type ReportTab = 'fsa-plant' | 'spray-audit' | 'fertilizer-summary' | 'fsa-harvest' | 'hay-summary' | 'landlord-statement';

const WIND_ALERT_MPH = 10;

const TABS: { key: ReportTab; icon: typeof Sprout; label: string; color: string }[] = [
  { key: 'fsa-plant',          icon: Sprout,    label: 'FSA-578',     color: 'text-plant' },
  { key: 'spray-audit',        icon: CloudRain, label: 'Spray Audit', color: 'text-spray' },
  { key: 'fertilizer-summary', icon: Sprout,    label: 'Fertilizer',  color: 'text-lime-600 dark:text-lime-400' },
  { key: 'fsa-harvest',        icon: Wheat,     label: 'Fall FSA',    color: 'text-harvest' },
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

function safeExport(fn: () => void | Promise<void>, label: string): void {
  try {
    Promise.resolve(fn()).catch((err) => {
      console.error(`Export failed (${label}):`, err);
      toast.error(`Failed to export ${label}. Please try again.`);
    });
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

    fertilizerApplications: allFertilizer,
    fields,
    cluAssignments,
    fsaTracts,
    farmName,
    activeSeason,
    viewingSeason,
    setViewingSeason,
    seasonOptions,
  } = useFarm();

  const [tab, setTab] = useState<ReportTab>('fsa-plant');

  // Fixed at mount — subtitle dates don't shift on re-render or after midnight
  const reportDateRef = useRef(new Date().toLocaleDateString());
  const reportDate = reportDateRef.current;

  // O(1) field lookup — built once per fields change, not per row
  const fieldMap = useMemo(() => buildFieldMap(fields), [fields]);

  // Season selector options — read directly from global farmStore context
  const availableSeasons = seasonOptions;

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
        amountDisplay: p.totalProductAmount 
          ? `${p.totalProductAmount} ${p.totalProductUnit || ''}`.trim()
          : formatTotalAmount(p.rate, treatedArea, p.rateUnit),
      }));
    }

    return [{
      ...r,
      _rowKey: r.id,
      product: '—',
      amountDisplay: r.totalAmountApplied 
        ? `${r.totalAmountApplied} ${r.rateUnit?.replace('/ac', '') || 'gal'}` 
        : '—',
    }];
  }), [sprayRecords, fieldMap]);

  // Summary totals
  const fsaPlantRows = useMemo(
    () => buildFsa578Rows(plantRecords, fields, cluAssignments, mergeBundledFsaTracts(fsaTracts)),
    [plantRecords, fields, cluAssignments, fsaTracts],
  );
  const plantedAcreTotals = useMemo(() => calculateFsa578PlantedAcreTotals(fsaPlantRows), [fsaPlantRows]);
  const totalPlantAcres = plantedAcreTotals.totalAcres;
  const plantedAcresByField = plantedAcreTotals.byField;
  const fsaReadinessIssues = useMemo(() => validateFsa578Rows(fsaPlantRows), [fsaPlantRows]);
  const fsaReadinessErrors = useMemo(() => fsaReadinessIssues.filter(issue => issue.severity === 'error'), [fsaReadinessIssues]);
  const fsaReadinessWarnings = useMemo(() => fsaReadinessIssues.filter(issue => issue.severity === 'warning'), [fsaReadinessIssues]);
  const totalHarvestBu   = useMemo(() => roundTo(harvestRecords.reduce((s, r) => s + r.bushels, 0), 2), [harvestRecords]);
  const fsaFallReport = useMemo(
    () => buildFsaFallProductionRows({ harvestRecords, hayRecords, fields }),
    [harvestRecords, hayRecords, fields],
  );
  const fsaFallRows = useMemo(
    () => [...fsaFallReport.grainRows, ...fsaFallReport.hayRows],
    [fsaFallReport],
  );
  const fsaFallIssues = useMemo(() => validateFsaFallProductionRows(fsaFallRows), [fsaFallRows]);
  const fsaFallErrors = useMemo(() => fsaFallIssues.filter(issue => issue.severity === 'error'), [fsaFallIssues]);
  const fsaFallWarnings = useMemo(() => fsaFallIssues.filter(issue => issue.severity === 'warning'), [fsaFallIssues]);
  const totalFallHayBales = useMemo(() => fsaFallReport.hayRows.reduce((s, row) => s + row.production, 0), [fsaFallReport]);
  const totalFertAcres   = useMemo(() => roundTo(fertilizerRecords.reduce((s, r) => s + r.acres, 0), 2), [fertilizerRecords]);
  const totalHayBales    = useMemo(() => hayRecords.reduce((s, r) => s + r.baleCount, 0), [hayRecords]);

  // Landlord specific logic
  const [selectedLandlord, setSelectedLandlord] = useState<string>('');
  const uniqueLandlords = useMemo(() => getUniqueLandlordNames(harvestRecords), [harvestRecords]);

  const landlordStatement = useMemo(() => {
    if (!selectedLandlord) return null;
    return generateLandlordStatement(harvestRecords, selectedLandlord);
  }, [harvestRecords, selectedLandlord]);

  const handlePrint = () => {
    if (Capacitor.isNativePlatform()) {
      toast.info('Printing is not supported directly in the mobile app. Please export to PDF and print/share from there.');
      return;
    }
    window.print();
  };

  const handleExportLandlordCSV = () => {
    if (!landlordStatement) return;
    safeExport(async () => {
      const csv = generateLandlordStatementCSV(landlordStatement);
      const fileName = sanitizeNativeFileName(`${selectedLandlord}_CropShare.csv`);

      if (Capacitor.isNativePlatform()) {
        await native.shareFile({
          fileName,
          data: csv,
          title: `AcreLedger Export: ${fileName}`,
          encoding: 'utf8'
        });
        return;
      }

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000); // Wait 2s to ensure browser starts download
    }, 'landlord statement');
  };

  const handleExportFsaPlantPdf = () => {
    safeExport(() => {
      exportToPdf({
        title: 'FSA-578 Acreage Certification Worksheet',
        subtitle: `Farmer worksheet for FSA acreage certification. Not an official USDA form. Generated ${reportDate}.`,
        headers: ['FARM #', 'TRACT #', 'CLU/FIELD #', 'FIELD', 'LAND USE', 'CROP', 'TYPE/VARIETY', 'ACRES', 'PLANT DATE', 'USE', 'IRR', 'SHARE %', 'STATUS'],
        rows: fsaPlantRows.map(row => [
          row.farmNumber || '-',
          row.tractNumber || '-',
          row.fieldNumber || '-',
          row.fieldName,
          row.landUse,
          row.crop || '-',
          row.seedVariety || '-',
          row.acreage,
          row.date ? fmtDate(row.date) : '-',
          row.intendedUse || '-',
          row.irrigationCode,
          row.producerShare,
          row.cropStatus || '-',
        ]),
        fileName: `FSA_578_Worksheet_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`,
        summaryText: 'Total Planted Acreage',
        summaryValue: `${totalPlantAcres} AC`,
        footerText: [
          'Planted Acres by Field:',
          ...plantedAcresByField.map(row => `${row.fieldName}: ${row.acres} AC`),
          '',
          'Farmer Review Worksheet',
          'Review acreage, crop/use, shares, and maps with your county FSA office before certification.',
          'Producer Notes: _______________________________',
          'Review Date: ___________________',
          'Notes / FSA Office Corrections:',
          '__________________________________________________',
          '__________________________________________________',
        ],
        orientation: 'landscape',
        tableCellPadding: 1.4,
        tableFontSize: 8.5,
      });
    }, 'FSA planting PDF');
  };

  const handleExportSprayAuditPdf = () => {
    safeExport(() => {
      generateSprayPDF(sprayRecords, farmName);
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
        title: 'FSA Fall Harvest / Production Evidence Worksheet',
        subtitle: `Production support report for FSA/crop-program review. Not an official USDA form. Generated ${reportDate}.`,
        headers: ['DATE', 'FIELD', 'CROP/USE', 'PROD.', 'UNIT', 'MOIST %', 'DEST/STORAGE', 'EVIDENCE #', 'FARM #', 'TRACT #'],
        rows: fsaFallRows.map(row => [
          fmtDate(row.harvestDate) || '—',
          row.fieldName,
          row.crop || '—',
          row.production.toLocaleString(),
          row.productionUnit,
          row.moisturePercent != null ? `${row.moisturePercent}%` : '—',
          row.destination || '—',
          row.evidenceReference || '—',
          row.farmNumber || '—',
          row.tractNumber || '—',
        ]),
        fileName: `FSA_Fall_Production_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`,
        summaryText: totalFallHayBales > 0 ? 'Total Production' : 'Total Grain Production',
        summaryValue: totalFallHayBales > 0
          ? `${totalHarvestBu.toLocaleString()} BU / ${totalFallHayBales.toLocaleString()} BALES`
          : `${totalHarvestBu.toLocaleString()} BU`,
        footerText: [
          'Production Evidence Worksheet',
          'I certify that the production information shown above is accurate to the best of my knowledge.',
          'Producer Signature: _______________________________',
          'Date: ___________________',
          'FSA Office Notes / Corrections:',
          '__________________________________________________',
          '__________________________________________________',
        ]
      });
    }, 'fall production PDF');
  };

  const handleExportHayPdf = () => {
    safeExport(() => {
      const records = fields
        .filter(f => hayRecords.some(r => r.fieldId === f.id))
        .map(f => {
          const fieldHay = hayRecords.filter(r => r.fieldId === f.id);
          const c1 = fieldHay.filter(r => r.cuttingNumber === 1).reduce((s, r) => s + r.baleCount, 0);
          const c2 = fieldHay.filter(r => r.cuttingNumber === 2).reduce((s, r) => s + r.baleCount, 0);
          const c3plus = fieldHay.filter(r => r.cuttingNumber >= 3).reduce((s, r) => s + r.baleCount, 0);
          const total = c1 + c2 + c3plus;
          return [f.name, c1 || '—', c2 || '—', c3plus || '—', total.toLocaleString()];
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
        fileName: sanitizeNativeFileName(`${selectedLandlord}_CropShare_${viewingSeason}.pdf`),
        summaryText: 'Total Landlord Share',
        summaryValue: `${landlordStatement.totalLandlordBushels.toLocaleString()} BU`
      });
    }, 'landlord PDF');
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border pb-0 print:bg-background print:border-0">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between lg:max-w-6xl lg:px-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center print:hidden">
              <FileText size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Reports</h1>
              <p className="text-xs text-muted-foreground">FSA & Compliance</p>
            </div>
          </div>
          {/* Single print button — header only, consistent across all tabs */}
          <button
            onClick={handlePrint}
            className="touch-target flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm hover:bg-muted/80 transition-colors print:hidden"
          >
            <Printer size={16} />
            Print
          </button>
        </div>

      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4 lg:max-w-6xl lg:px-8">
        {/* Season Selector */}
        <div className="flex items-center justify-between gap-4 bg-muted/30 border border-border p-3 rounded-lg print:hidden">
          <div className="flex items-center gap-2">
            <HistoryIcon size={16} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Season View</span>
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
              className={`flex-1 touch-target flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                tab === t.key ? `bg-muted ${t.color}` : 'text-muted-foreground'
              }`}
            >
              <t.icon size={16} />
              <span className="hidden md:inline text-[11px]">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── FSA Planting Report ─────────────────────────────────────────────── */}
        {tab === 'fsa-plant' && (
          <ReportTable
            title="FSA-578 Acreage Certification Worksheet"
            subtitle={`Farmer worksheet for FSA acreage certification. Not an official USDA form. Generated ${reportDate}.`}
            headers={['FARM #', 'TRACT #', 'CLU/FIELD #', 'FIELD', 'LAND USE', 'CROP', 'TYPE/VARIETY', 'ACRES', 'PLANT DATE', 'USE', 'IRR', 'SHARE %', 'STATUS']}
            onExport={() => safeExport(() => exportFsa578Data(plantRecords, fields, cluAssignments, mergeBundledFsaTracts(fsaTracts), {
              farmName,
              cropYear: viewingSeason,
              reportDate: new Date().toISOString().split('T')[0],
            }), 'FSA-578 worksheet data')}
            onExportPdf={handleExportFsaPlantPdf}
            exportLabel="CSV"
            summary={(
              <div className="space-y-3 font-mono text-sm print:space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-muted-foreground uppercase">Total planted acreage</span>
                  <span className="font-bold text-plant">{totalPlantAcres} AC</span>
                </div>
                {plantedAcresByField.length > 0 && (
                  <div className="border-t border-border pt-3 print:pt-2">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground mb-2 print:mb-1">
                      Planted acres by field
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 print:grid-cols-3 print:gap-x-4">
                      {plantedAcresByField.map(row => (
                        <div key={row.fieldName} className="flex justify-between gap-3 text-xs">
                          <span className="text-foreground font-semibold truncate">{row.fieldName}</span>
                          <span className="text-plant font-bold whitespace-nowrap">{row.acres} AC</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          >
            {fsaReadinessIssues.length > 0 && (
              <tr className="print:hidden">
                <td colSpan={13} className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                  <div className="font-bold uppercase tracking-wide mb-1">
                    FSA-578 readiness check: {fsaReadinessErrors.length} errors, {fsaReadinessWarnings.length} warnings
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {fsaReadinessIssues.slice(0, 6).map(issue => (
                      <li key={`${issue.rowId}-${issue.field}-${issue.severity}`}>{issue.message}</li>
                    ))}
                    {fsaReadinessIssues.length > 6 && (
                      <li>{fsaReadinessIssues.length - 6} more issue(s)</li>
                    )}
                  </ul>
                </td>
              </tr>
            )}
            {fsaPlantRows.map(row => {
              return (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.farmNumber || '-'}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.tractNumber || '-'}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.fieldNumber || '-'}</td>
                  <td className="px-2 py-2 text-[11px] font-bold text-foreground print:px-1 print:py-1">{row.fieldName}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.landUse}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-harvest font-bold print:px-1 print:py-1">{row.crop || '-'}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.seedVariety || '-'}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground text-right print:px-1 print:py-1">{row.acreage}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.date ? fmtDate(row.date) : '-'}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.intendedUse || '-'}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.irrigationCode}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground text-right print:px-1 print:py-1">{row.producerShare}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.cropStatus || '-'}</td>
                </tr>
              );
            })}
            {fsaPlantRows.length === 0 && (
              <tr>
                <td colSpan={13} className="py-12 text-center text-muted-foreground text-xs">
                  No planting or non-cropland CLU records to report for this season
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
              <p className="text-xs text-muted-foreground mb-1">
                Private applicator license compliance audit trail. Generated {reportDate}.
              </p>

              <div className="flex gap-2 pb-4 print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] font-mono border-spray/30 text-spray hover:bg-spray/10"
                  onClick={() => safeExport(() => generateMissouriLog(sprayRecords, fields), 'spray log')}
                >
                  <Download size={12} className="mr-1.5" />
                  CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px] font-mono border-primary/30 text-primary hover:bg-primary/10"
                  onClick={handleExportSprayAuditPdf}
                >
                  <Download size={12} className="mr-1.5" />
                  PDF
                </Button>
              </div>

              {sprayRows.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  No spray records to report
                </p>
              ) : (
                <div className="space-y-4">
                  {sprayRows.map(r => (
                    <div key={r._rowKey} className="border border-border/50 rounded-lg p-3 space-y-2 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-spray opacity-50" />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-sm tracking-tight">{r.fieldName}</span>
                        <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {fmtDate(r.sprayDate) || fmt(r.timestamp)}{r.startTime ? ` @ ${r.startTime}${r.endTime ? '-' + r.endTime : ''}` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                        <div><span className="text-muted-foreground uppercase text-[11px]">Crop / Site:</span><div className="text-harvest font-bold">{r.cropOrSiteTreated || '—'}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[11px]">Target Pest:</span> <span className="text-foreground font-bold">{r.targetPest || '—'}</span></div>
                        <div><span className="text-muted-foreground uppercase text-[11px]">Product:</span><div className="text-spray font-bold">{r.product}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[11px]">EPA Reg #:</span><div className="text-foreground">{r.epaRegNumber || '—'}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[11px]">Rate / Ac:</span><div className="text-foreground">{r.applicationRate ? `${r.applicationRate} ${r.rateUnit || ''}` : '—'}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[11px]">Total Acres Treated:</span><div className="text-foreground font-bold">{r.treatedAreaSize || '—'}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[11px]">Total Product:</span><div className="text-foreground font-bold">{r.amountDisplay}</div></div>
                        <div><span className="text-muted-foreground uppercase text-[11px]">Equipment:</span><div className="text-foreground">{r.equipmentId || '—'}</div></div>
                        <div className="col-span-2 pt-1 border-t border-border/30 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          <div><span className="text-muted-foreground uppercase text-[11px]">Applicator:</span> <span className="text-foreground/80">{r.applicatorName || '—'}</span></div>
                          <div><span className="text-muted-foreground uppercase text-[11px]">License:</span> <span className="text-foreground/80">{r.licenseNumber || '—'}</span></div>
                        </div>
                        <div className="col-span-2 pt-1 flex flex-wrap gap-x-4 text-[11px] opacity-80">
                          <div><span className="text-muted-foreground uppercase text-[11px]">Wind:</span> <span className="text-foreground">{r.windSpeed} mph {r.windDirection || ''}</span></div>
                          <div><span className="text-muted-foreground uppercase text-[11px]">Temp:</span> <span className="text-foreground">{r.temperature}°F</span></div>
                          <div><span className="text-muted-foreground uppercase text-[11px]">Hum:</span> <span className="text-foreground">{r.relativeHumidity != null ? `${r.relativeHumidity}%` : '—'}</span></div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap pt-1 print:hidden">
                        {r.windSpeed > WIND_ALERT_MPH && (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            ⚠ WIND ALERT
                          </span>
                        )}
                        {!r.epaRegNumber && (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
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
                <td colSpan={4} className="py-12 text-center text-muted-foreground text-xs">
                  No fertilizer records to report for this season
                </td>
              </tr>
            )}
          </ReportTable>
        )}

        {/* ── FSA Fall Harvest / Production Report ───────────────────────────── */}
        {tab === 'fsa-harvest' && (
          <ReportTable
            title="FSA Fall Harvest / Production Evidence Worksheet"
            subtitle={`Production support report for FSA/crop-program review. Not an official USDA form. Generated ${reportDate}.`}
            headers={['DATE', 'FIELD', 'CROP/USE', 'PROD.', 'UNIT', 'MOIST %', 'DEST/STORAGE', 'EVIDENCE #', 'FARM #', 'TRACT #']}
            onExport={() => safeExport(() => exportFsaFallProductionData({
              harvestRecords,
              hayRecords,
              fields,
              metadata: {
                farmName,
                cropYear: viewingSeason,
                reportDate: new Date().toISOString().split('T')[0],
              },
            }), 'fall production data')}
            onExportPdf={handleExportHarvestPdf}
            exportLabel="CSV"
            summary={(
              <div className="flex flex-col gap-1 font-mono text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-muted-foreground uppercase">TOTAL GRAIN PRODUCTION</span>
                  <span className="font-bold text-harvest">{totalHarvestBu.toLocaleString()} BU</span>
                </div>
                {totalFallHayBales > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-muted-foreground uppercase">TOTAL HAY PRODUCTION</span>
                    <span className="font-bold text-harvest">{totalFallHayBales.toLocaleString()} BALES</span>
                  </div>
                )}
              </div>
            )}
          >
            {fsaFallRows.map(row => (
              <tr key={`${row.recordType}-${row.id}`} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-[10px] text-foreground">{fmtDate(row.harvestDate) || '—'}</td>
                <td className="px-4 py-3 text-xs font-bold text-foreground">{row.fieldName}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-harvest font-bold">{row.crop || '—'}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{row.production.toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{row.productionUnit}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{row.moisturePercent != null ? `${row.moisturePercent}%` : '—'}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-foreground truncate max-w-[80px]">{row.destination || '—'}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-foreground truncate max-w-[80px]">{row.evidenceReference || '—'}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-foreground">{row.farmNumber || '—'}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-foreground">{row.tractNumber || '—'}</td>
              </tr>
            ))}
            {fsaFallRows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-muted-foreground text-xs">
                  No harvest or hay production records to report for this season
                </td>
              </tr>
            )}
            {fsaFallRows.length > 0 && fsaFallErrors.length > 0 && (
              <tr className="print:hidden">
                <td colSpan={10} className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-xs text-red-600 dark:text-red-400 font-semibold">
                  ⚠ {fsaFallErrors.length} error(s) — {fsaFallErrors.map(e => e.message).join('; ')}
                </td>
              </tr>
            )}
            {fsaFallRows.length > 0 && fsaFallWarnings.length > 0 && (
              <tr className="print:hidden">
                <td colSpan={10} className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                  ⚠ {fsaFallWarnings.length} warning(s) — missing destination or evidence references will show as gaps
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
              .filter(f => hayRecords.some(r => r.fieldId === f.id))
              .map(f => {
                const fieldHay  = hayRecords.filter(r => r.fieldId === f.id);
                const c1        = fieldHay.filter(r => r.cuttingNumber === 1).reduce((s, r) => s + r.baleCount, 0);
                const c2        = fieldHay.filter(r => r.cuttingNumber === 2).reduce((s, r) => s + r.baleCount, 0);
                const c3plus    = fieldHay.filter(r => r.cuttingNumber >= 3).reduce((s, r) => s + r.baleCount, 0);
                const total     = c1 + c2 + c3plus;

                return (
                  <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-foreground">{f.name}</td>
                    {/* Use explicit zero check — c1 > 0 avoids hiding a legitimate 0 bale count */}
                    <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{c1 > 0 ? c1 : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{c2 > 0 ? c2 : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{c3plus > 0 ? c3plus : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[10px] font-bold text-harvest text-right border-l border-border/20">
                      {total.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            {hayRecords.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground text-xs">
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
                  <p className="text-xs text-muted-foreground">
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
                  <p className="text-muted-foreground text-sm">
                    Select a landlord to generate their statement
                  </p>
                </div>
              ) : landlordStatement ? (
                <div className="space-y-6">
                  <div className="flex gap-2 print:hidden">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px] font-mono border-blue-500/30 text-blue-600 hover:bg-blue-50"
                      onClick={handleExportLandlordCSV}
                    >
                      <Download size={12} className="mr-1.5" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px] font-mono border-primary/30 text-primary hover:bg-primary/10"
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
                          <th className="px-4 py-3 text-left font-mono text-[11px] text-muted-foreground uppercase">Field</th>
                          <th className="px-4 py-3 text-left font-mono text-[11px] text-muted-foreground uppercase">Crop</th>
                          <th className="px-4 py-3 text-left font-mono text-[11px] text-muted-foreground uppercase">Date</th>
                          <th className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground uppercase">Total Bu.</th>
                          <th className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground uppercase">Split %</th>
                          <th className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground uppercase">Your Share</th>
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

    </div>
  );
}
