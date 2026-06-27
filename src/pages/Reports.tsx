import { useState, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { FileText, Printer, History as HistoryIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useFarm } from '@/store/farmStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FsaPlantReport from '@/components/reports/FsaPlantReport';
import SprayAuditReport from '@/components/reports/SprayAuditReport';
import FertilizerReport from '@/components/reports/FertilizerReport';
import FallFsaReport from '@/components/reports/FallFsaReport';
import HaySummaryReport from '@/components/reports/HaySummaryReport';
import LandlordStatementReport from '@/components/reports/LandlordStatementReport';
import { mergeBundledFsaTracts } from '@/lib/bundledFsaTracts';
import { buildFsa578Rows, buildFsaFallProductionRows, calculateFsa578PlantedAcreTotals, generateMissouriLog, exportFsa578Data, exportFsaFallProductionData, exportFertilizerData, generateLandlordStatement, generateLandlordStatementCSV, getUniqueLandlordNames, exportToPdf, validateFsa578Rows, validateFsaFallProductionRows } from '@/lib/complianceReports';
import { native, sanitizeNativeFileName } from '@/lib/native';
import { generateSprayPDF } from '@/lib/sprayExport';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import { ACTIVITY_ICONS, ACTIVITY_TEXT_COLORS } from '@/lib/activityIcons';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { formatTotalAmount } from '@/utils/unitConversion';
import { Field } from '@/types/farm';

// ─── Constants ────────────────────────────────────────────────────────────────

type ReportTab = 'fsa-plant' | 'spray-audit' | 'fertilizer-summary' | 'fsa-harvest' | 'hay-summary' | 'landlord-statement';

const TABS: { key: ReportTab; icon: typeof ACTIVITY_ICONS.plant; label: string; color: string }[] = [
  { key: 'fsa-plant',          icon: ACTIVITY_ICONS.plant,      label: 'FSA-578',     color: ACTIVITY_TEXT_COLORS.plant },
  { key: 'spray-audit',        icon: ACTIVITY_ICONS.spray,      label: 'Spray Audit', color: ACTIVITY_TEXT_COLORS.spray },
  { key: 'fertilizer-summary', icon: ACTIVITY_ICONS.fertilizer, label: 'Fertilizer',  color: ACTIVITY_TEXT_COLORS.fertilizer },
  { key: 'fsa-harvest',        icon: ACTIVITY_ICONS.harvest,    label: 'Fall FSA',    color: ACTIVITY_TEXT_COLORS.harvest },
  { key: 'hay-summary',        icon: ACTIVITY_ICONS.hay,        label: 'Hay Summary', color: ACTIVITY_TEXT_COLORS.hay },
  { key: 'landlord-statement', icon: FileText,                  label: 'Landlord',    color: 'text-blue-600' },
];

// ─── Pure helpers (module-level — not recreated on every render) ──────────────

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
  const fsaCluMapAppendix = useMemo(() => {
    const groups = new Map<string, string[]>();

    cluAssignments
      .filter(assignment => !assignment.deletedAt)
      .forEach(assignment => {
        const field = fieldMap.get(assignment.fieldId);
        const fieldName = field?.name || 'Unmatched field';
        const label = `${assignment.tractKey} / CLU ${assignment.cluNumber} - ${roundTo(assignment.acres, 2)} AC - ${assignment.landUse === 'cropland' ? 'Cropland' : 'Non-cropland'}`;
        groups.set(fieldName, [...(groups.get(fieldName) || []), label]);
      });

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([fieldName, labels]) => [
        fieldName,
        ...labels.sort().map(label => `  ${label}`),
      ]);
  }, [cluAssignments, fieldMap]);
  const fsaReadinessIssues = useMemo(() => validateFsa578Rows(fsaPlantRows), [fsaPlantRows]);
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
        subtitle: `Farm: ${farmName || 'AcreLedger Farm'} | Crop Year: ${viewingSeason} | Not an official USDA form. Generated ${reportDate}.`,
        headers: ['FARM #', 'TRACT #', 'CLU/FIELD #', 'LAND USE', 'CROP', 'SEQ', 'ACRES', 'PLANT DATE', 'SHARE %', 'USE', 'IRR', 'FIELD'],
        rows: fsaPlantRows.map(row => [
          row.farmNumber || '-',
          row.tractNumber || '-',
          row.fieldNumber || '-',
          row.landUse,
          row.crop || '-',
          row.cropSequence || '-',
          row.acreage,
          row.date ? fmtDate(row.date) : '-',
          row.producerShare,
          row.intendedUse || '-',
          row.irrigationCode,
          row.fieldName,
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
          '',
          'CLU Map Appendix:',
          ...fsaCluMapAppendix,
        ],
        orientation: 'landscape',
        tableCellPadding: 1.4,
        tableFontSize: 9,
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
        subtitle: `Farm: ${farmName || 'AcreLedger Farm'} | Crop Year: ${viewingSeason} | Not an official USDA form. Generated ${reportDate}.`,
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
          <div className="flex items-center gap-2">
            <SyncStatusIndicator />
            <button
              onClick={handlePrint}
              className="touch-target flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm hover:bg-muted/80 transition-colors print:hidden"
            >
              <Printer size={16} />
              Print
            </button>
          </div>
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
            <SelectTrigger className="w-[120px] h-11 font-mono text-sm bg-background border-border">
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

        {/* Tab Bar — flex-1 shrink-0 allows tabs to fill screen width equally on desktop, but never shrink below content size on mobile */}
        <div className="flex overflow-x-auto no-scrollbar gap-1 bg-card border border-border rounded-lg p-1 print:hidden">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 shrink-0 touch-target flex items-center justify-center gap-1.5 rounded-lg py-2.5 px-3 text-sm font-semibold transition-all ${
                tab === t.key ? `bg-muted ${t.color}` : 'text-muted-foreground'
              }`}
            >
              <t.icon size={16} className="shrink-0" />
              <span className="text-[11px] whitespace-nowrap">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── FSA Planting Report ─────────────────────────────────────────────── */}
        {tab === 'fsa-plant' && (
          <FsaPlantReport
            fsaPlantRows={fsaPlantRows}
            totalPlantAcres={totalPlantAcres}
            plantedAcresByField={plantedAcresByField}
            fsaReadinessIssues={fsaReadinessIssues}
            farmName={farmName}
            viewingSeason={viewingSeason}
            reportDate={reportDate}
            onExportCsv={() => safeExport(() => exportFsa578Data(plantRecords, fields, cluAssignments, mergeBundledFsaTracts(fsaTracts), {
              farmName,
              cropYear: viewingSeason,
              reportDate: new Date().toISOString().split('T')[0],
            }), 'FSA-578 worksheet data')}
            onExportPdf={handleExportFsaPlantPdf}
          />
        )}

        {/* ── Spray Audit ─────────────────────────────────────────────────────── */}
        {tab === 'spray-audit' && (
          <SprayAuditReport
            sprayRows={sprayRows}
            reportDate={reportDate}
            onExportCsv={() => safeExport(() => generateMissouriLog(sprayRecords, fields), 'spray log')}
            onExportPdf={handleExportSprayAuditPdf}
          />
        )}

        {/* ── Fertilizer Summary ──────────────────────────────────────────────── */}
        {tab === 'fertilizer-summary' && (
          <FertilizerReport
            fertilizerRecords={fertilizerRecords}
            fieldMap={fieldMap}
            totalFertAcres={totalFertAcres}
            reportDate={reportDate}
            onExportCsv={() => safeExport(() => exportFertilizerData(fertilizerRecords, fields), 'fertilizer data')}
            onExportPdf={handleExportFertilizerPdf}
          />
        )}

        {/* ── FSA Fall Harvest / Production Report ───────────────────────────── */}
        {tab === 'fsa-harvest' && (
          <FallFsaReport
            fsaFallRows={fsaFallRows}
            totalHarvestBu={totalHarvestBu}
            totalFallHayBales={totalFallHayBales}
            fsaFallIssues={fsaFallIssues}
            farmName={farmName}
            viewingSeason={viewingSeason}
            reportDate={reportDate}
            onExportCsv={() => safeExport(() => exportFsaFallProductionData({
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
          />
        )}

        {/* ── Hay Summary ─────────────────────────────────────────────────────── */}
        {tab === 'hay-summary' && (
          <HaySummaryReport
            hayRecords={hayRecords}
            fields={fields}
            totalHayBales={totalHayBales}
            reportDate={reportDate}
            onExportPdf={handleExportHayPdf}
          />
        )}

        {/* ── Landlord Statement ──────────────────────────────────────────────── */}
        {tab === 'landlord-statement' && (
          <LandlordStatementReport
            selectedLandlord={selectedLandlord}
            setSelectedLandlord={setSelectedLandlord}
            uniqueLandlords={uniqueLandlords}
            landlordStatement={landlordStatement}
            reportDate={reportDate}
            onExportCsv={handleExportLandlordCSV}
            onExportPdf={handleExportLandlordPdf}
          />
        )}
      </main>

    </div>
  );
}
