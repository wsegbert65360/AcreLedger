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
                className="h-8 text-xs font-mono border-blue-500/30 text-blue-600 hover:bg-blue-50"
                onClick={onExportCsv}
              >
                <Download size={12} className="mr-1.5" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-mono border-primary/30 text-primary hover:bg-primary/10"
                onClick={onExportPdf}
              >
                <Download size={12} className="mr-1.5" />
                PDF
              </Button>
            </div>

            {/* Phone layout: one card per harvest row instead of a sideways-scrolling table */}
            <ul className="space-y-3 lg:hidden print:hidden" aria-label="Landlord share by field">
              {landlordStatement.rows.map((r, i) => (
                <li key={i} className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-bold leading-tight text-foreground">{r.fieldName}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        <span className="font-bold text-harvest">{r.crop}</span> · {r.harvestDate}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">Your share</p>
                      <p className="font-mono text-lg font-black leading-tight text-blue-600">
                        {r.landlordBushels != null ? r.landlordBushels.toLocaleString() : '—'}
                        <span className="ml-1 text-xs font-bold">BU</span>
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Total bushels</dt>
                      <dd className="font-mono text-sm font-semibold text-foreground">
                        {r.totalBushels != null ? r.totalBushels.toLocaleString() : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Split</dt>
                      <dd className="font-mono text-sm font-semibold text-foreground">
                        {r.landlordSplitPercent != null ? `${r.landlordSplitPercent}%` : '—'}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
              <li className="flex items-center justify-between rounded-2xl border-2 border-primary bg-blue-500/5 p-3.5">
                <span className="text-sm font-bold text-muted-foreground">Total landlord share</span>
                <span className="font-mono text-lg font-black text-blue-600">
                  {landlordStatement.totalLandlordBushels != null ? landlordStatement.totalLandlordBushels.toLocaleString() : '—'} BU
                </span>
              </li>
            </ul>

            <div className="hidden overflow-x-auto border border-border rounded-lg lg:block print:block">
              <table className="w-full border-collapse">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-mono text-xs text-muted-foreground uppercase">Field</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-muted-foreground uppercase">Crop</th>
                    <th className="px-4 py-3 text-left font-mono text-xs text-muted-foreground uppercase">Date</th>
                    <th className="px-4 py-3 text-right font-mono text-xs text-muted-foreground uppercase">Total Bu.</th>
                    <th className="px-4 py-3 text-right font-mono text-xs text-muted-foreground uppercase">Split %</th>
                    <th className="px-4 py-3 text-right font-mono text-xs text-muted-foreground uppercase">Your Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {landlordStatement.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td data-label="Field" className="px-4 py-3 text-xs font-bold text-foreground">{r.fieldName}</td>
                      <td data-label="Crop" className="px-4 py-3 font-mono text-xs text-harvest font-bold">{r.crop}</td>
                      <td data-label="Date" className="px-4 py-3 font-mono text-xs text-foreground">{r.harvestDate}</td>
                      <td data-label="Total Bu." className="px-4 py-3 font-mono text-xs text-foreground text-right">{r.totalBushels != null ? r.totalBushels.toLocaleString() : '—'}</td>
                      <td data-label="Split %" className="px-4 py-3 font-mono text-xs text-foreground text-right">{r.landlordSplitPercent != null ? `${r.landlordSplitPercent}%` : '—'}</td>
                      <td data-label="Your Share" className="px-4 py-3 font-mono text-xs text-blue-600 font-bold text-right">{r.landlordBushels != null ? r.landlordBushels.toLocaleString() : '—'}</td>
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
