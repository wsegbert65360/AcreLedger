import { useMemo } from 'react';
import ReportTable from '@/components/ReportTable';
import type { FsaFallCropTotal, FsaFallProductionRow, FsaFallValidationIssue } from '@/lib/complianceReports';
import { buildFsaFallGroupedTotals } from '@/lib/complianceReports/fsaReports';
import type { ReportReadinessIssue, ReportReadinessSummary } from '@/lib/reportReadiness';
import type { ReportExportStatus } from '@/lib/reportExportHistory';
import { complianceFarmSubtitle, farmNameForProse } from '@/lib/farmDisplayName';
import { formatIsoDate } from '@/utils/dates';
import { MobileReportExportPanel } from './MobileReportExportPanel';

function fmtDate(d?: string): string {
  return d ? formatIsoDate(d) : '—';
}

interface FallFsaReportProps {
  fsaFallRows: FsaFallProductionRow[];
  cropTotals: FsaFallCropTotal[];
  fsaFallIssues: FsaFallValidationIssue[];
  readinessSummary: ReportReadinessSummary;
  onIssueAction?: (issue: ReportReadinessIssue) => void;
  exportStatus?: ReportExportStatus;
  farmName: string | null;
  viewingSeason: number;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export default function FallFsaReport({
  fsaFallRows,
  cropTotals,
  fsaFallIssues,
  readinessSummary,
  onIssueAction,
  exportStatus,
  farmName,
  viewingSeason,
  reportDate,
  onExportCsv,
  onExportPdf,
}: FallFsaReportProps) {
  const fsaFallErrors = useMemo(() => fsaFallIssues.filter(issue => issue.severity === 'error'), [fsaFallIssues]);
  const fsaFallWarnings = useMemo(() => fsaFallIssues.filter(issue => issue.severity === 'warning'), [fsaFallIssues]);
  const groupedTotals = useMemo(() => buildFsaFallGroupedTotals(fsaFallRows), [fsaFallRows]);

  return (
    <>
      <MobileReportExportPanel
        title="Fall production worksheet"
        description={`Review ${viewingSeason} harvest and hay production readiness for ${farmNameForProse(farmName)}, then export the worksheet for FSA review.`}
        summary={readinessSummary}
        itemLabel="records"
        onExportPdf={onExportPdf}
        onExportData={onExportCsv}
        onIssueAction={onIssueAction}
        exportStatus={exportStatus}
      />
      <div className="hidden lg:block print:block">
      <ReportTable
      title="FSA Fall Harvest / Production Evidence Worksheet"
      subtitle={complianceFarmSubtitle(farmName, viewingSeason, reportDate)}
      headers={['DATE', 'FIELD', 'CROP/USE', 'PROD.', 'UNIT', 'MOIST %', 'DEST/STORAGE', 'EVIDENCE #', 'FARM #', 'TRACT #', 'COUNTY']}
      onExport={onExportCsv}
      onExportPdf={onExportPdf}
      exportLabel="CSV"
      summary={(
        <div className="flex flex-col gap-1 font-mono text-sm">
          {cropTotals.map(total => (
            <div key={`${total.crop}-${total.unit}`} className="flex justify-between items-center">
              <span className="font-bold text-muted-foreground uppercase">TOTAL {total.crop}</span>
              <span className="font-bold text-harvest">{total.production.toLocaleString()} {total.unit.toUpperCase()}</span>
            </div>
          ))}
          {groupedTotals.length > 0 && (
            <div className="mt-3 space-y-1 border-t pt-3">
              <h3 className="font-bold">Production totals by farm and county</h3>
              {groupedTotals.map(total => (
                <div key={JSON.stringify([total.scope, total.county, total.farmNumber, total.crop, total.unit])} className="flex justify-between gap-3">
                  <span>{[total.scope, total.county, total.farmNumber && (/^\d/.test(total.farmNumber) ? `#${total.farmNumber}` : total.farmNumber), total.crop].filter(Boolean).join(' · ')}</span>
                  <span className="font-bold text-harvest whitespace-nowrap">{total.production.toLocaleString()} {total.unit.toUpperCase()}</span>
                </div>
              ))}
              {fsaFallRows.some(row => !row.county?.trim()) && <p className="text-xs text-muted-foreground">To assign missing counties, add County: name and, optionally, State: abbreviation on separate lines in the field notes.</p>}
            </div>
          )}
        </div>
      )}
    >
      {fsaFallRows.map(row => (
        <tr key={`${row.recordType}-${row.id}`} className="hover:bg-muted/30 transition-colors">
          <td data-label="DATE" className="px-4 py-3 font-mono text-xs text-foreground">{fmtDate(row.harvestDate) || '—'}</td>
          <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground">{row.fieldName}</td>
          <td data-label="CROP/USE" className="px-4 py-3 font-mono text-xs text-harvest font-bold">{row.crop || '—'}</td>
          <td data-label="PROD." className="px-4 py-3 font-mono text-xs text-foreground text-right">{row.production != null ? row.production.toLocaleString() : '—'}</td>
          <td data-label="UNIT" className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.productionUnit}</td>
          <td data-label="MOIST %" className="px-4 py-3 font-mono text-xs text-foreground text-right">{row.moisturePercent != null ? `${row.moisturePercent}%` : '—'}</td>
          <td data-label="DEST/STORAGE" className="px-4 py-3 font-mono text-xs text-foreground truncate max-w-[80px]">{row.destination || '—'}</td>
          <td data-label="EVIDENCE #" className="px-4 py-3 font-mono text-xs text-foreground truncate max-w-[80px]">{row.evidenceReference || '—'}</td>
          <td data-label="FARM #" className="px-4 py-3 font-mono text-xs text-foreground">{row.farmNumber || '—'}</td>
          <td data-label="TRACT #" className="px-4 py-3 font-mono text-xs text-foreground">{row.tractNumber || '—'}</td>
          <td data-label="COUNTY" className="px-4 py-3 text-xs text-foreground">{row.county || '—'}</td>
        </tr>
      ))}
      {fsaFallRows.length === 0 && (
        <tr className="full-width-row">
          <td colSpan={11} className="py-12 text-center text-muted-foreground text-xs">
            No harvest or hay production records to report for this season
          </td>
        </tr>
      )}
      {fsaFallRows.length > 0 && fsaFallErrors.length > 0 && (
        <tr className="full-width-row print:hidden">
          <td colSpan={11} className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-xs text-red-600 dark:text-red-400 font-semibold">
            ⚠ {fsaFallErrors.length} error(s) — {fsaFallErrors.map(e => e.message).join('; ')}
          </td>
        </tr>
      )}
      {fsaFallRows.length > 0 && fsaFallWarnings.length > 0 && (
        <tr className="full-width-row print:hidden">
          <td colSpan={11} className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-semibold">
            ⚠ {fsaFallWarnings.length} warning(s) — missing details will show as gaps
          </td>
        </tr>
      )}
      </ReportTable>
      </div>
    </>
  );
}
