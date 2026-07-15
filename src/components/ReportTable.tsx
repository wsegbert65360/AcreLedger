import { ReactNode } from 'react';
import { FileDown } from 'lucide-react';

interface ReportTableProps {
  title: string;
  subtitle: string;
  headers: string[];
  children: ReactNode;
  onExport?: () => void;
  onExportPdf?: () => void;
  exportLabel?: string;
  summary?: ReactNode;
}

export default function ReportTable({
  title, subtitle, headers, children, onExport, onExportPdf, exportLabel = "Export", summary
}: ReportTableProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-muted/30 p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex shrink-0 gap-2 print:hidden">
          {onExport && (
            <button
              onClick={onExport}
              className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-mono font-bold transition-colors hover:bg-muted"
              aria-label={`Export ${exportLabel}`}
            >
              <FileDown size={14} className="text-muted-foreground" />
              {exportLabel}
            </button>
          )}
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-mono font-bold text-primary transition-colors hover:bg-muted"
              aria-label="Export PDF"
            >
              <FileDown size={14} />
              PDF
            </button>
          )}
        </div>
      </div>

      <div className="relative overflow-x-auto mobile-cards">
        <table className="w-full min-w-max text-left border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 text-xs font-bold text-muted-foreground font-mono uppercase tracking-tighter print:px-1 print:py-1 print:text-[9px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {children}
          </tbody>
        </table>
        <div
          aria-hidden="true"
          className="report-scroll-fade pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 print:hidden"
        />
      </div>

      {summary && (
        <div className="p-4 bg-muted/20 border-t border-border mt-auto">
          {summary}
        </div>
      )}
    </div>
  );
}
