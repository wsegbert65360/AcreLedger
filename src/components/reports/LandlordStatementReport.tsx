import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LandlordStatement } from '@/lib/complianceReports';

interface LandlordStatementReportProps {
  selectedLandlord: string;
  setSelectedLandlord: (name: string) => void;
  uniqueLandlords: string[];
  landlordStatement: LandlordStatement | null;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export default function LandlordStatementReport({
  selectedLandlord,
  setSelectedLandlord,
  uniqueLandlords,
  landlordStatement,
  reportDate,
  onExportCsv,
  onExportPdf,
}: LandlordStatementReportProps) {
  return (
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
                onClick={onExportCsv}
              >
                <Download size={12} className="mr-1.5" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px] font-mono border-primary/30 text-primary hover:bg-primary/10"
                onClick={onExportPdf}
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
                  {landlordStatement.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td data-label="Field" className="px-4 py-3 text-xs font-bold text-foreground">{r.fieldName}</td>
                      <td data-label="Crop" className="px-4 py-3 font-mono text-[10px] text-harvest font-bold">{r.crop}</td>
                      <td data-label="Date" className="px-4 py-3 font-mono text-[10px] text-foreground">{r.harvestDate}</td>
                      <td data-label="Total Bu." className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.totalBushels != null ? r.totalBushels.toLocaleString() : '—'}</td>
                      <td data-label="Split %" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{r.landlordSplitPercent != null ? `${r.landlordSplitPercent}%` : '—'}</td>
                      <td data-label="Your Share" className="px-4 py-3 font-mono text-[10px] text-blue-600 font-bold text-right">{r.landlordBushels != null ? r.landlordBushels.toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-blue-500/5 border-t-2 border-primary">
                  <tr>
                    <td colSpan={5} className="px-4 py-4 font-mono text-sm font-bold text-muted-foreground uppercase">
                      Total Landlord Share
                    </td>
                    <td className="px-4 py-4 font-mono text-base font-black text-blue-600 text-right">
                      {landlordStatement.totalLandlordBushels != null ? landlordStatement.totalLandlordBushels.toLocaleString() : '—'} BU
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
