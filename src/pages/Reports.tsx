import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { FileText, Printer, History as HistoryIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useFarm } from '@/store/farmStore';
import SeasonSelect from '@/components/SeasonSelect';
import FsaPlantReport from '@/components/reports/FsaPlantReport';
import SprayAuditReport from '@/components/reports/SprayAuditReport';
import FertilizerReport from '@/components/reports/FertilizerReport';
import FallFsaReport from '@/components/reports/FallFsaReport';
import HaySummaryReport from '@/components/reports/HaySummaryReport';
import LandlordSummaryReport from '@/components/reports/LandlordSummaryReport';
import { loadBundledFsaTracts, mergeBundledFsaTracts } from '@/lib/bundledFsaTracts';
import { buildFsa578Rows, buildFsaFallProductionRows, calculateFsa578PlantedAcreTotals, generateMissouriLog, exportFsa578Data, exportFsaFallProductionData, exportFertilizerData, generateLandlordSummary, generateLandlordSummaryCSV, getFieldLandlordNames, exportToPdf, exportFsa578WorksheetPdf, validateFsa578Rows, validateFsaFallProductionRows } from '@/lib/complianceReports';
import { native, sanitizeNativeFileName } from '@/lib/native';
import { generateSprayPDF } from '@/lib/sprayExport';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ACTIVITY_ICONS, ACTIVITY_TEXT_COLORS } from '@/lib/activityIcons';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { formatSprayProductTotal } from '@/utils/unitConversion';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';
import { Field } from '@/types/farm';
import {
  buildFertilizerReadiness,
  buildFsa578Readiness,
  buildFsaFallReadiness,
  buildHayReadiness,
  buildLandlordReadiness,
  buildSprayReadiness,
} from '@/lib/reportReadiness';
import type { ReportReadinessIssue } from '@/lib/reportReadiness';
import { WIND_ALERT_MPH } from '@/lib/weatherHelpers';
import {
  buildReportFingerprint,
  getReportExportStatus,
  recordReportExport,
  type ReportExportType,
} from '@/lib/reportExportHistory';

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    plantRecords:         allPlant,
    sprayRecords:         allSpray,
    harvestRecords:       allHarvest,
    hayHarvestRecords:    allHay,
    customSprayRecords:   allCustomSpray,
    tillageRecords:       allTillage,

    fertilizerApplications: allFertilizer,
    fields,
    cluAssignments,
    fsaTracts,
    farmName,
    viewingSeason,
    session,
    farm_id,
  } = useFarm();

  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<ReportTab>(() =>
    TABS.some(candidate => candidate.key === requestedTab) ? requestedTab as ReportTab : 'fsa-plant',
  );
  const [bundledFsaTracts, setBundledFsaTracts] = useState<Awaited<ReturnType<typeof loadBundledFsaTracts>>>([]);
  const [exportHistoryVersion, setExportHistoryVersion] = useState(0);

  // Fixed at mount — subtitle dates don't shift on re-render or after midnight
  const reportDateRef = useRef(new Date().toLocaleDateString());
  const reportDate = reportDateRef.current;

  useEffect(() => {
    if (tab !== 'fsa-plant') return;

    let cancelled = false;
    loadBundledFsaTracts()
      .then(tracts => {
        if (!cancelled) setBundledFsaTracts(tracts);
      })
      .catch(err => {
        console.error('[Reports] Failed to load bundled FSA tracts:', err);
        if (!cancelled) setBundledFsaTracts([]);
      });

    return () => { cancelled = true; };
  }, [tab]);

  useEffect(() => {
    if (TABS.some(candidate => candidate.key === requestedTab)) setTab(requestedTab as ReportTab);
  }, [requestedTab]);

  // O(1) field lookup — built once per fields change, not per row
  const fieldMap = useMemo(() => buildFieldMap(fields), [fields]);
  const activeFieldIds = useMemo(() => new Set(fields.filter(field => !field.deleted_at).map(field => field.id)), [fields]);


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

  const tillageRecords = useMemo(() =>
    [...allTillage.filter(r => r.seasonYear === viewingSeason)]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  [allTillage, viewingSeason]);

  const customSprayRecords = useMemo(() =>
    [...allCustomSpray.filter(r => r.seasonYear === viewingSeason)]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  [allCustomSpray, viewingSeason]);

  // Expanded spray rows — memoized, keyed by index to avoid product-name collisions
  const sprayRows = useMemo(() => sprayRecords.flatMap(r => {
    const field = fieldMap.get(r.fieldId);
    const treatedArea = r.treatedAreaSize ?? (field ? getDisplayFieldAcres(field, cluAssignments) : 0) ?? 0;

    if (r.products && r.products.length > 0) {
      return r.products.map((p, i) => ({
        ...r,
        _rowKey: `${r.id}-${i}`,                     // index-based key — no collision on duplicate product names
        product: p.product,
        epaRegNumber: p.epaRegNumber,
        applicationRate: p.rate,
        rateUnit: p.rateUnit,
        amountDisplay: formatSprayProductTotal(p, treatedArea),
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
  }), [sprayRecords, fieldMap, cluAssignments]);
  const sprayReadinessSummary = useMemo(
    () => buildSprayReadiness(sprayRecords, WIND_ALERT_MPH),
    [sprayRecords],
  );

  // Summary totals
  const mergedFsaTracts = useMemo(
    () => mergeBundledFsaTracts(fsaTracts, bundledFsaTracts),
    [fsaTracts, bundledFsaTracts],
  );

  const fsaPlantRows = useMemo(
    () => buildFsa578Rows(plantRecords, fields, cluAssignments, mergedFsaTracts),
    [plantRecords, fields, cluAssignments, mergedFsaTracts],
  );
  const plantedAcreTotals = useMemo(() => calculateFsa578PlantedAcreTotals(fsaPlantRows), [fsaPlantRows]);
  const totalPlantAcres = plantedAcreTotals.totalAcres;
  const plantedAcresByField = plantedAcreTotals.byField;
  const fsaReadinessIssues = useMemo(() => validateFsa578Rows(fsaPlantRows), [fsaPlantRows]);
  const fsaReadinessSummary = useMemo(
    () => buildFsa578Readiness(fsaPlantRows, fsaReadinessIssues),
    [fsaPlantRows, fsaReadinessIssues],
  );
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
  const fsaFallReadinessSummary = useMemo(
    () => buildFsaFallReadiness(fsaFallRows, fsaFallIssues),
    [fsaFallRows, fsaFallIssues],
  );
  const totalFallHayBales = useMemo(() => fsaFallReport.hayRows.reduce((s, row) => s + row.production, 0), [fsaFallReport]);
  const totalFertAcres   = useMemo(() => roundTo(fertilizerRecords.reduce((s, r) => s + r.acres, 0), 2), [fertilizerRecords]);
  const totalHayBales    = useMemo(() => hayRecords.reduce((s, r) => s + r.baleCount, 0), [hayRecords]);
  const fertilizerReadinessSummary = useMemo(
    () => buildFertilizerReadiness(fertilizerRecords, activeFieldIds),
    [fertilizerRecords, activeFieldIds],
  );
  const hayReadinessSummary = useMemo(
    () => buildHayReadiness(hayRecords, activeFieldIds),
    [hayRecords, activeFieldIds],
  );

  // Landlord specific logic — driven by field-level landlord assignment
  const [selectedLandlord, setSelectedLandlord] = useState<string>('');
  const uniqueLandlords = useMemo(() => getFieldLandlordNames(fields), [fields]);

  const landlordSummary = useMemo(() => {
    if (!selectedLandlord) return null;
    return generateLandlordSummary({
      landlordName: selectedLandlord,
      fields,
      cluAssignments,
      plantRecords,
      sprayRecords,
      customSprayRecords,
      fertilizerApplications: fertilizerRecords,
      tillageRecords,
      harvestRecords,
      seasonYear: viewingSeason,
    });
  }, [selectedLandlord, fields, cluAssignments, plantRecords, sprayRecords, customSprayRecords, fertilizerRecords, tillageRecords, harvestRecords, viewingSeason]);
  const landlordReadinessSummary = useMemo(
    () => selectedLandlord ? buildLandlordReadiness(landlordSummary, harvestRecords) : null,
    [selectedLandlord, landlordSummary, harvestRecords],
  );

  const exportFingerprints = useMemo<Record<ReportTab, string>>(() => ({
    'fsa-plant': buildReportFingerprint(fsaPlantRows),
    'spray-audit': buildReportFingerprint(sprayRecords),
    'fertilizer-summary': buildReportFingerprint(fertilizerRecords),
    'fsa-harvest': buildReportFingerprint(fsaFallRows),
    'hay-summary': buildReportFingerprint(hayRecords),
    'landlord-statement': buildReportFingerprint(landlordSummary ? {
      fields: landlordSummary.fields,
      activity: landlordSummary.activity,
      totals: landlordSummary.totals,
    } : null),
  }), [fsaPlantRows, sprayRecords, fertilizerRecords, fsaFallRows, hayRecords, landlordSummary]);

  const getExportStatus = (reportType: ReportExportType) => {
    void exportHistoryVersion;
    if (!session?.user.id || !farm_id) return undefined;
    return getReportExportStatus(
      { userId: session.user.id, farmId: farm_id, seasonYear: viewingSeason, reportType },
      exportFingerprints[reportType],
    );
  };

  const runTrackedExport = (
    reportType: ReportExportType,
    fn: () => void | Promise<void>,
    label: string,
  ) => {
    try {
      Promise.resolve(fn())
        .then(() => {
          if (session?.user.id && farm_id) {
            recordReportExport(
              { userId: session.user.id, farmId: farm_id, seasonYear: viewingSeason, reportType },
              exportFingerprints[reportType],
            );
            setExportHistoryVersion(version => version + 1);
          }
        })
        .catch((err) => {
          console.error(`Export failed (${label}):`, err);
          toast.error(`Failed to export ${label}. Please try again.`);
        });
    } catch (err) {
      console.error(`Export failed (${label}):`, err);
      toast.error(`Failed to export ${label}. Please try again.`);
    }
  };

  const handleIssueAction = (issue: ReportReadinessIssue) => {
    if (issue.recordId && issue.recordType && issue.recordType !== 'plant') {
      const activityTab = issue.recordType === 'customSpray' ? 'spray' : issue.recordType;
      navigate(`/activity?tab=${encodeURIComponent(activityTab)}&record=${encodeURIComponent(issue.recordId)}&type=${encodeURIComponent(issue.recordType)}`);
      return;
    }
    if (issue.fieldId) {
      navigate(`/field/${encodeURIComponent(issue.fieldId)}`);
      return;
    }
    navigate('/activity');
  };

  const getMergedFsaTractsForExport = async () => {
    if (bundledFsaTracts.length > 0) return mergedFsaTracts;

    const loadedTracts = await loadBundledFsaTracts();
    setBundledFsaTracts(loadedTracts);
    return mergeBundledFsaTracts(fsaTracts, loadedTracts);
  };

  const handlePrint = () => {
    if (Capacitor.isNativePlatform()) {
      toast.info('Printing is not supported directly in the mobile app. Please export to PDF and print/share from there.');
      return;
    }
    window.print();
  };

  const handleExportLandlordCSV = () => {
    if (!landlordSummary) return;
    runTrackedExport('landlord-statement', async () => {
      const csv = generateLandlordSummaryCSV(landlordSummary);
      const fileName = sanitizeNativeFileName(`${selectedLandlord}_Summary_${viewingSeason}.csv`);

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
    }, 'landlord summary');
  };

  const handleExportFsaPlantPdf = () => {
    runTrackedExport('fsa-plant', async () => {
      const reportTracts = await getMergedFsaTractsForExport();
      const reportRows = buildFsa578Rows(plantRecords, fields, cluAssignments, reportTracts);
      const issues = validateFsa578Rows(reportRows);

      exportFsa578WorksheetPdf({
        metadata: {
          farmName: farmName || 'AcreLedger Farm',
          cropYear: viewingSeason,
          reportDate,
        },
        rows: reportRows,
        issues,
        fileName: `FSA_578_Worksheet_${viewingSeason}_${new Date().toISOString().split('T')[0]}.pdf`,
      });
    }, 'FSA planting PDF');
  };

  const handleExportSprayAuditPdf = () => {
    runTrackedExport('spray-audit', () => {
      generateSprayPDF(sprayRecords, farmName);
    }, 'spray audit PDF');
  };

  const handleExportFertilizerPdf = () => {
    runTrackedExport('fertilizer-summary', () => {
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
    runTrackedExport('fsa-harvest', () => {
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
    runTrackedExport('hay-summary', () => {
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
    if (!landlordSummary) return;
    runTrackedExport('landlord-statement', () => {
      exportToPdf({
        title: 'Landlord Summary',
        subtitle: `${farmName ? farmName + ' — ' : ''}Prepared for: ${selectedLandlord} · ${viewingSeason} crop year · Generated ${reportDate}`,
        orientation: 'landscape',
        headers: ['FIELD', 'CROP', 'ACRES', 'TOTAL BU.', 'BU/ACRE', 'LANDLORD SHARE'],
        rows: landlordSummary.fields.map(f => [
          f.fieldName,
          f.crop ?? '—',
          f.acres.toLocaleString(),
          f.totalBushels.toLocaleString(),
          f.buPerAcre != null ? f.buPerAcre.toLocaleString() : '—',
          f.landlordShareBushels.toLocaleString(),
        ]),
        fileName: sanitizeNativeFileName(`${selectedLandlord}_Summary_${viewingSeason}.pdf`),
        summaryText: 'Total Landlord Share',
        summaryValue: `${landlordSummary.totals.landlordShareBushels.toLocaleString()} BU`,
        footerText: landlordSummary.activity.length > 0
          ? [
              'Activity Timeline:',
              ...landlordSummary.activity.map(a => `${a.date} · ${a.fieldName} · ${a.activityType}${a.crop ? ' (' + a.crop + ')' : ''} — ${a.detail}`),
            ]
          : undefined,
      });
    }, 'landlord PDF');
  };

  return (
    <div className="min-h-screen bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
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
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              className="hidden h-11 rounded-lg bg-card px-3 text-sm lg:inline-flex print:hidden"
            >
              <Printer size={16} />
              Print
            </Button>
          </div>
        </div>

      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 lg:max-w-6xl lg:px-8">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ReportTab)}
          className="space-y-4"
        >
        {/* Season Selector */}
        <div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-muted/30 px-3 py-2 print:hidden">
          <div className="flex items-center gap-2">
            <HistoryIcon size={16} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Season view</span>
          </div>
          <SeasonSelect className="w-[5.5rem] bg-background text-sm" />
        </div>

        {/* Tab Bar — flex-1 shrink-0 allows tabs to fill screen width equally on desktop, but never shrink below content size on mobile */}
        <div className="relative print:hidden">
        <TabsList
          aria-label="Report type"
          className="no-scrollbar flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1"
        >
          {TABS.map(t => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className={`h-11 flex-none shrink-0 gap-2 rounded-lg px-3 text-xs font-semibold shadow-none data-[state=active]:bg-muted data-[state=active]:shadow-none ${
                tab === t.key ? t.color : 'text-muted-foreground'
              }`}
            >
              <t.icon size={16} className="shrink-0" />
              <span className="whitespace-nowrap">{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1 bottom-1 z-10 w-8 rounded-r-2xl bg-gradient-to-l from-card via-card/60 to-transparent"
        />
        </div>

        {/* ── FSA Planting Report ─────────────────────────────────────────────── */}
        <TabsContent value="fsa-plant" className="mt-0">
          <FsaPlantReport
            fsaPlantRows={fsaPlantRows}
            totalPlantAcres={totalPlantAcres}
            plantedAcresByField={plantedAcresByField}
            fsaReadinessIssues={fsaReadinessIssues}
            readinessSummary={fsaReadinessSummary}
            exportStatus={getExportStatus('fsa-plant')}
            farmName={farmName}
            viewingSeason={viewingSeason}
            reportDate={reportDate}
            onExportCsv={() => runTrackedExport('fsa-plant', async () => exportFsa578Data(plantRecords, fields, cluAssignments, await getMergedFsaTractsForExport(), {
              farmName,
              cropYear: viewingSeason,
              reportDate: new Date().toISOString().split('T')[0],
            }), 'FSA-578 worksheet data')}
            onExportPdf={handleExportFsaPlantPdf}
            onIssueAction={handleIssueAction}
          />
        </TabsContent>

        {/* ── Spray Audit ─────────────────────────────────────────────────────── */}
        <TabsContent value="spray-audit" className="mt-0">
          <SprayAuditReport
            sprayRows={sprayRows}
            readinessSummary={sprayReadinessSummary}
            exportStatus={getExportStatus('spray-audit')}
            reportDate={reportDate}
            onExportCsv={() => runTrackedExport('spray-audit', () => generateMissouriLog(sprayRecords, fields, cluAssignments), 'spray log')}
            onExportPdf={handleExportSprayAuditPdf}
            onIssueAction={handleIssueAction}
          />
        </TabsContent>

        {/* ── Fertilizer Summary ──────────────────────────────────────────────── */}
        <TabsContent value="fertilizer-summary" className="mt-0">
          <FertilizerReport
            fertilizerRecords={fertilizerRecords}
            fieldMap={fieldMap}
            totalFertAcres={totalFertAcres}
            reportDate={reportDate}
            onExportCsv={() => runTrackedExport('fertilizer-summary', () => exportFertilizerData(fertilizerRecords, fields), 'fertilizer data')}
            onExportPdf={handleExportFertilizerPdf}
            readinessSummary={fertilizerReadinessSummary}
            exportStatus={getExportStatus('fertilizer-summary')}
            onIssueAction={handleIssueAction}
          />
        </TabsContent>

        {/* ── FSA Fall Harvest / Production Report ───────────────────────────── */}
        <TabsContent value="fsa-harvest" className="mt-0">
          <FallFsaReport
            fsaFallRows={fsaFallRows}
            totalHarvestBu={totalHarvestBu}
            totalFallHayBales={totalFallHayBales}
            fsaFallIssues={fsaFallIssues}
            readinessSummary={fsaFallReadinessSummary}
            exportStatus={getExportStatus('fsa-harvest')}
            onIssueAction={handleIssueAction}
            farmName={farmName}
            viewingSeason={viewingSeason}
            reportDate={reportDate}
            onExportCsv={() => runTrackedExport('fsa-harvest', () => exportFsaFallProductionData({
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
        </TabsContent>

        {/* ── Hay Summary ─────────────────────────────────────────────────────── */}
        <TabsContent value="hay-summary" className="mt-0">
          <HaySummaryReport
            hayRecords={hayRecords}
            fields={fields}
            totalHayBales={totalHayBales}
            reportDate={reportDate}
            onExportPdf={handleExportHayPdf}
            readinessSummary={hayReadinessSummary}
            exportStatus={getExportStatus('hay-summary')}
            onIssueAction={handleIssueAction}
          />
        </TabsContent>

        {/* ── Landlord Summary ──────────────────────────────────────────────── */}
        <TabsContent value="landlord-statement" className="mt-0">
          <LandlordSummaryReport
            selectedLandlord={selectedLandlord}
            setSelectedLandlord={setSelectedLandlord}
            uniqueLandlords={uniqueLandlords}
            landlordSummary={landlordSummary}
            reportDate={reportDate}
            onExportCsv={handleExportLandlordCSV}
            onExportPdf={handleExportLandlordPdf}
            readinessSummary={landlordReadinessSummary}
            exportStatus={getExportStatus('landlord-statement')}
            onIssueAction={handleIssueAction}
          />
        </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}
