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
      <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-mono font-bold hover:bg-muted transition-colors"
              aria-label={`Export ${exportLabel}`}
            >
              <FileDown size={14} className="text-muted-foreground" />
              {exportLabel.toUpperCase()}
            </button>
          )}
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-mono font-bold hover:bg-muted transition-colors text-primary"
              aria-label="Export PDF"
            >
              <FileDown size={14} />
              PDF
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 text-xs font-bold text-muted-foreground font-mono uppercase tracking-tighter">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {children}
          </tbody>
        </table>
      </div>

      {summary && (
        <div className="p-4 bg-muted/20 border-t border-border mt-auto">
          {summary}
        </div>
      )}
    </div>
  );
}
