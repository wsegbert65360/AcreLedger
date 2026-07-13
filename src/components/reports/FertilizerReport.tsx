import ReportTable from '@/components/ReportTable';
import { FertilizerApplication } from '@/types/farm';
import { Field } from '@/types/farm';
import { formatIsoDate } from '@/utils/dates';
import type { ReportReadinessIssue, ReportReadinessSummary } from '@/lib/reportReadiness';
import type { ReportExportStatus } from '@/lib/reportExportHistory';
import { MobileReportExportPanel } from './MobileReportExportPanel';

function fmtDate(d?: string): string {
  return d ? formatIsoDate(d) : '—';
}

interface FertilizerReportProps {
  fertilizerRecords: FertilizerApplication[];
  fieldMap: Map<string, Field>;
  totalFertAcres: number;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
  readinessSummary: ReportReadinessSummary;
  onIssueAction?: (issue: ReportReadinessIssue) => void;
  exportStatus?: ReportExportStatus;
}

export default function FertilizerReport({
  fertilizerRecords,
  fieldMap,
  totalFertAcres,
  reportDate,
  onExportCsv,
  onExportPdf,
  readinessSummary,
  onIssueAction,
  exportStatus,
}: FertilizerReportProps) {
  return (
    <>
      <MobileReportExportPanel
        title="Fertilizer application summary"
        description="Review record completeness and export the season application summary."
        summary={readinessSummary}
        itemLabel="records"
        onExportPdf={onExportPdf}
        onExportData={onExportCsv}
        onIssueAction={onIssueAction}
        exportStatus={exportStatus}
      />
      <div className="hidden lg:block print:block">
      <ReportTable
      title="Fertilizer Application Summary"
      subtitle={`Summary of fertilizer applications. Generated ${reportDate}.`}
      headers={['DATE', 'FIELD', 'FORMULA', 'ACRES']}
      onExport={onExportCsv}
      onExportPdf={onExportPdf}
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
          <td data-label="DATE" className="px-4 py-3 font-mono text-[10px] text-foreground uppercase tracking-tighter">{fmtDate(r.date)}</td>
          <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground sm:min-w-[120px]">
            {fieldMap.get(r.fieldId)?.name || r.fieldName}
          </td>
          <td data-label="FORMULA" className="px-4 py-3 font-mono text-[10px] text-lime-600 dark:text-lime-400 font-bold">{r.fertilizer_formula}</td>
          <td data-label="ACRES" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.acres}</td>
        </tr>
      ))}
      {fertilizerRecords.length === 0 && (
        <tr className="full-width-row">
          <td colSpan={4} className="py-12 text-center text-muted-foreground text-xs">
            No fertilizer records to report for this season
          </td>
        </tr>
      )}
      </ReportTable>
      </div>
    </>
  );
}
