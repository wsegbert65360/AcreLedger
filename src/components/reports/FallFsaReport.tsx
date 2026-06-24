import { useMemo } from 'react';
import ReportTable from '@/components/ReportTable';
import { FsaFallProductionRow, FsaFallValidationIssue } from '@/lib/complianceReports';
import { formatIsoDate } from '@/utils/dates';

function fmtDate(d?: string): string {
  return d ? formatIsoDate(d) : '—';
}

interface FallFsaReportProps {
  fsaFallRows: FsaFallProductionRow[];
  totalHarvestBu: number;
  totalFallHayBales: number;
  fsaFallIssues: FsaFallValidationIssue[];
  farmName: string;
  viewingSeason: number;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export default function FallFsaReport({
  fsaFallRows,
  totalHarvestBu,
  totalFallHayBales,
  fsaFallIssues,
  farmName,
  viewingSeason,
  reportDate,
  onExportCsv,
  onExportPdf,
}: FallFsaReportProps) {
  const fsaFallErrors = useMemo(() => fsaFallIssues.filter(issue => issue.severity === 'error'), [fsaFallIssues]);
  const fsaFallWarnings = useMemo(() => fsaFallIssues.filter(issue => issue.severity === 'warning'), [fsaFallIssues]);

  return (
    <ReportTable
      title="FSA Fall Harvest / Production Evidence Worksheet"
      subtitle={`Farm: ${farmName || 'AcreLedger Farm'} | Crop Year: ${viewingSeason} | Not an official USDA form. Generated ${reportDate}.`}
      headers={['DATE', 'FIELD', 'CROP/USE', 'PROD.', 'UNIT', 'MOIST %', 'DEST/STORAGE', 'EVIDENCE #', 'FARM #', 'TRACT #']}
      onExport={onExportCsv}
      onExportPdf={onExportPdf}
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
          <td data-label="DATE" className="px-4 py-3 font-mono text-[10px] text-foreground">{fmtDate(row.harvestDate) || '—'}</td>
          <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground">{row.fieldName}</td>
          <td data-label="CROP/USE" className="px-4 py-3 font-mono text-[10px] text-harvest font-bold">{row.crop || '—'}</td>
          <td data-label="PROD." className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{row.production != null ? row.production.toLocaleString() : '—'}</td>
          <td data-label="UNIT" className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{row.productionUnit}</td>
          <td data-label="MOIST %" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{row.moisturePercent != null ? `${row.moisturePercent}%` : '—'}</td>
          <td data-label="DEST/STORAGE" className="px-4 py-3 font-mono text-[10px] text-foreground truncate max-w-[80px]">{row.destination || '—'}</td>
          <td data-label="EVIDENCE #" className="px-4 py-3 font-mono text-[10px] text-foreground truncate max-w-[80px]">{row.evidenceReference || '—'}</td>
          <td data-label="FARM #" className="px-4 py-3 font-mono text-[10px] text-foreground">{row.farmNumber || '—'}</td>
          <td data-label="TRACT #" className="px-4 py-3 font-mono text-[10px] text-foreground">{row.tractNumber || '—'}</td>
        </tr>
      ))}
      {fsaFallRows.length === 0 && (
        <tr className="full-width-row">
          <td colSpan={10} className="py-12 text-center text-muted-foreground text-xs">
            No harvest or hay production records to report for this season
          </td>
        </tr>
      )}
      {fsaFallRows.length > 0 && fsaFallErrors.length > 0 && (
        <tr className="full-width-row print:hidden">
          <td colSpan={10} className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-xs text-red-600 dark:text-red-400 font-semibold">
            ⚠ {fsaFallErrors.length} error(s) — {fsaFallErrors.map(e => e.message).join('; ')}
          </td>
        </tr>
      )}
      {fsaFallRows.length > 0 && fsaFallWarnings.length > 0 && (
        <tr className="full-width-row print:hidden">
          <td colSpan={10} className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 font-semibold">
            ⚠ {fsaFallWarnings.length} warning(s) — missing destination or evidence references will show as gaps
          </td>
        </tr>
      )}
    </ReportTable>
  );
}
