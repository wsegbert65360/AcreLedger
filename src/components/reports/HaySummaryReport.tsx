import ReportTable from '@/components/ReportTable';
import { Field, HayHarvestRecord } from '@/types/farm';
import type { ReportReadinessIssue, ReportReadinessSummary } from '@/lib/reportReadiness';
import type { ReportExportStatus } from '@/lib/reportExportHistory';
import { MobileReportExportPanel } from './MobileReportExportPanel';

interface HaySummaryReportProps {
  hayRecords: HayHarvestRecord[];
  fields: Field[];
  totalHayBales: number;
  reportDate: string;
  onExportPdf: () => void;
  readinessSummary: ReportReadinessSummary;
  onIssueAction?: (issue: ReportReadinessIssue) => void;
  exportStatus?: ReportExportStatus;
}

export default function HaySummaryReport({
  hayRecords,
  fields,
  totalHayBales,
  reportDate,
  onExportPdf,
  readinessSummary,
  onIssueAction,
  exportStatus,
}: HaySummaryReportProps) {
  return (
    <>
      <MobileReportExportPanel
        title="Hay production summary"
        description="Review harvest record completeness and export the season bale summary."
        summary={readinessSummary}
        itemLabel="records"
        onExportPdf={onExportPdf}
        onIssueAction={onIssueAction}
        exportStatus={exportStatus}
      />
      <div className="hidden lg:block print:block">
      <ReportTable
      title="Hay Production Summary"
      subtitle={`Total bale production across all cuttings. Generated ${reportDate}.`}
      headers={['FIELD', 'CUTTING #1', 'CUTTING #2', 'CUTTING #3+', 'TOTAL']}
      onExportPdf={onExportPdf}
      summary={(
        <div className="flex justify-between items-center font-mono text-sm">
          <span className="font-bold text-muted-foreground uppercase">SEASON GRAND TOTAL</span>
          <span className="font-bold text-harvest">{totalHayBales != null ? totalHayBales.toLocaleString() : '—'} BALES</span>
        </div>
      )}
    >
      {fields
        .filter(f => hayRecords.some(r => r.fieldId === f.id))
        .map(f => {
          const fieldHay = hayRecords.filter(r => r.fieldId === f.id);
          const c1 = fieldHay.filter(r => r.cuttingNumber === 1).reduce((s, r) => s + r.baleCount, 0);
          const c2 = fieldHay.filter(r => r.cuttingNumber === 2).reduce((s, r) => s + r.baleCount, 0);
          const c3plus = fieldHay.filter(r => r.cuttingNumber >= 3).reduce((s, r) => s + r.baleCount, 0);
          const total = c1 + c2 + c3plus;

          return (
            <tr key={f.id} className="hover:bg-muted/30 transition-colors">
              <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground">{f.name}</td>
              <td data-label="CUTTING #1" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{c1 > 0 ? c1 : '—'}</td>
              <td data-label="CUTTING #2" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{c2 > 0 ? c2 : '—'}</td>
              <td data-label="CUTTING #3+" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{c3plus > 0 ? c3plus : '—'}</td>
              <td data-label="TOTAL" className="px-4 py-3 font-mono text-[10px] font-bold text-harvest text-right border-l border-border/20">
                {total != null ? total.toLocaleString() : '—'}
              </td>
            </tr>
          );
        })}
      {hayRecords.length === 0 && (
        <tr className="full-width-row">
          <td colSpan={5} className="py-12 text-center text-muted-foreground text-xs">
            No hay records to report for this season
          </td>
        </tr>
      )}
      </ReportTable>
      </div>
    </>
  );
}
