import { useMemo } from 'react';
import ReportTable from '@/components/ReportTable';
import { Fsa578ReportRow, Fsa578ValidationIssue, Fsa578FieldAcreTotal } from '@/lib/complianceReports';
import type { ReportReadinessIssue, ReportReadinessSummary } from '@/lib/reportReadiness';
import type { ReportExportStatus } from '@/lib/reportExportHistory';
import { formatIsoDate } from '@/utils/dates';
import { MobileReportExportPanel } from './MobileReportExportPanel';

function fmtDate(d?: string): string {
  return d ? formatIsoDate(d) : '—';
}

interface FsaPlantReportProps {
  fsaPlantRows: Fsa578ReportRow[];
  totalPlantAcres: number;
  plantedAcresByField: Fsa578FieldAcreTotal[];
  fsaReadinessIssues: Fsa578ValidationIssue[];
  readinessSummary: ReportReadinessSummary;
  onIssueAction?: (issue: ReportReadinessIssue) => void;
  exportStatus?: ReportExportStatus;
  farmName: string;
  viewingSeason: number;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export default function FsaPlantReport({
  fsaPlantRows,
  totalPlantAcres,
  plantedAcresByField,
  fsaReadinessIssues,
  readinessSummary,
  onIssueAction,
  exportStatus,
  farmName,
  viewingSeason,
  reportDate,
  onExportCsv,
  onExportPdf,
}: FsaPlantReportProps) {
  const fsaReadinessErrors = useMemo(() => fsaReadinessIssues.filter(issue => issue.severity === 'error'), [fsaReadinessIssues]);
  const fsaReadinessWarnings = useMemo(() => fsaReadinessIssues.filter(issue => issue.severity === 'warning'), [fsaReadinessIssues]);

  return (
    <>
      <MobileReportExportPanel
        title="FSA-578 acreage worksheet"
        description={`Review ${viewingSeason} acreage readiness for ${farmName || 'your farm'}, then export the worksheet for county FSA review.`}
        summary={readinessSummary}
        itemLabel="fields"
        onExportPdf={onExportPdf}
        onExportData={onExportCsv}
        onIssueAction={onIssueAction}
        exportStatus={exportStatus}
      />
      <div className="hidden lg:block print:block">
      <ReportTable
      title="FSA-578 Acreage Certification Worksheet"
      subtitle={`Farm: ${farmName || 'AcreLedger Farm'} | Crop Year: ${viewingSeason} | Not an official USDA form. Generated ${reportDate}.`}
      headers={['FARM #', 'TRACT #', 'CLU/FIELD #', 'FIELD', 'LAND USE', 'CROP', 'SEQ', 'TYPE/VARIETY', 'PATTERN', 'ACRES', 'PLANT DATE', 'USE', 'IRR', 'SHARE %', 'STATUS']}
      onExport={onExportCsv}
      onExportPdf={onExportPdf}
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
      {fsaPlantRows.length > 0 && fsaReadinessIssues.length > 0 && (
        <tr className="full-width-row print:hidden">
          <td colSpan={15} className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
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
      {fsaPlantRows.map(row => (
        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
          <td data-label="FARM #" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.farmNumber || '-'}</td>
          <td data-label="TRACT #" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.tractNumber || '-'}</td>
          <td data-label="CLU/FIELD #" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.fieldNumber || '-'}</td>
          <td data-label="FIELD" className="px-2 py-2 text-[11px] font-bold text-foreground print:px-1 print:py-1">{row.fieldName}</td>
          <td data-label="LAND USE" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.landUse}</td>
          <td data-label="CROP" className="px-2 py-2 font-mono text-[11px] text-harvest font-bold print:px-1 print:py-1">{row.crop || '-'}</td>
          <td data-label="SEQ" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.cropSequence || '-'}</td>
          <td data-label="TYPE/VARIETY" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.seedVariety || '-'}</td>
          <td data-label="PATTERN" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.plantingPattern || '-'}</td>
          <td data-label="ACRES" className="px-2 py-2 font-mono text-[11px] text-foreground text-right print:px-1 print:py-1">{row.acreage}</td>
          <td data-label="PLANT DATE" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.date ? fmtDate(row.date) : '-'}</td>
          <td data-label="USE" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.intendedUse || '-'}</td>
          <td data-label="IRR" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.irrigationCode}</td>
          <td data-label="SHARE %" className="px-2 py-2 font-mono text-[11px] text-foreground text-right print:px-1 print:py-1">{row.producerShare}</td>
          <td data-label="STATUS" className="px-2 py-2 font-mono text-[11px] text-foreground print:px-1 print:py-1">{row.cropStatus || '-'}</td>
        </tr>
      ))}
      {fsaPlantRows.length === 0 && (
        <tr className="full-width-row">
          <td colSpan={15} className="py-12 text-center text-muted-foreground text-xs">
            No planting or non-cropland CLU records to report for this season
          </td>
        </tr>
      )}
      </ReportTable>
      </div>
    </>
  );
}
