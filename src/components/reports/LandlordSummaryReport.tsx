import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportTable from '@/components/ReportTable';
import { ACTIVITY_BG_COLORS, ACTIVITY_TEXT_COLORS } from '@/lib/activityIcons';
import type { LandlordActivityType, LandlordSummary } from '@/lib/complianceReports';

interface LandlordSummaryReportProps {
  selectedLandlord: string;
  setSelectedLandlord: (name: string) => void;
  uniqueLandlords: string[];
  landlordSummary: LandlordSummary | null;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

const ACTIVITY_LABEL: Record<LandlordActivityType, string> = {
  plant: 'Plant',
  spray: 'Spray',
  customSpray: 'Custom Spray',
  fertilizer: 'Fertilizer',
  tillage: 'Tillage',
  harvest: 'Harvest',
};

export default function LandlordSummaryReport({
  selectedLandlord,
  setSelectedLandlord,
  uniqueLandlords,
  landlordSummary,
  reportDate,
  onExportCsv,
  onExportPdf,
}: LandlordSummaryReportProps) {
  const seasonLabel = landlordSummary?.seasonYear != null
    ? `${landlordSummary.seasonYear} crop year`
    : 'all seasons';

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 print:hidden">
          <div>
            <h2 className="font-bold text-foreground text-base mb-1">Landlord Summary</h2>
            <p className="text-xs text-muted-foreground">
              All field activity, yields, and crop share for the selected landlord. Generated {reportDate}.
            </p>
          </div>
          <Select value={selectedLandlord} onValueChange={setSelectedLandlord}>
            <SelectTrigger className="w-full sm:w-[200px] h-11 font-mono text-sm bg-background border-border">
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
              Select a landlord to generate their summary
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Assign a landlord to a field under Edit Field to include it here.
            </p>
          </div>
        ) : landlordSummary ? (
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
                Detailed PDF
              </Button>
            </div>

            {/* Fields overview */}
            <ReportTable
              title="Fields"
              subtitle={`Per-field yield and landlord crop share · ${seasonLabel}`}
              headers={['FIELD', 'CROP', 'ACRES', 'TOTAL BU.', 'BU/ACRE', 'LANDLORD SHARE']}
              summary={landlordSummary.fields.length > 0 ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-sm font-bold text-muted-foreground uppercase">Total</span>
                  <div className="flex items-center gap-6 font-mono">
                    <span className="text-sm font-bold text-foreground">{landlordSummary.totals.acres.toLocaleString()} ac</span>
                    <span className="text-sm font-bold text-foreground">{landlordSummary.totals.totalBushels.toLocaleString()} bu</span>
                    <span className="text-sm font-bold text-foreground">
                      {landlordSummary.totals.acres > 0
                        ? (landlordSummary.totals.totalBushels / landlordSummary.totals.acres).toLocaleString(undefined, { maximumFractionDigits: 2 })
                        : '—'}
                    </span>
                    <span className="text-base font-black text-blue-600">{landlordSummary.totals.landlordShareBushels.toLocaleString()} bu</span>
                  </div>
                </div>
              ) : undefined}
            >
              {landlordSummary.fields.length === 0 ? (
                <tr className="full-width-row">
                  <td colSpan={6} className="py-12 text-center text-muted-foreground text-xs">
                    No fields assigned to this landlord.
                  </td>
                </tr>
              ) : (
                landlordSummary.fields.map(f => (
                  <tr key={f.fieldId} className="hover:bg-muted/30 transition-colors">
                    <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground">{f.fieldName}</td>
                    <td data-label="CROP" className="px-4 py-3 font-mono text-[10px] text-harvest font-bold">{f.crop ?? '—'}</td>
                    <td data-label="ACRES" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{f.acres.toLocaleString()}</td>
                    <td data-label="TOTAL BU." className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{f.totalBushels.toLocaleString()}</td>
                    <td data-label="BU/ACRE" className="px-4 py-3 font-mono text-[10px] text-foreground text-right">{f.buPerAcre != null ? f.buPerAcre.toLocaleString() : '—'}</td>
                    <td data-label="LANDLORD SHARE" className="px-4 py-3 font-mono text-[10px] text-blue-600 font-bold text-right">{f.landlordShareBushels.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </ReportTable>

            {/* Activity timeline */}
            <ReportTable
              title="Activity Timeline"
              subtitle={`All field activity for this landlord · ${seasonLabel}`}
              headers={['DATE', 'FIELD', 'TYPE', 'CROP', 'DETAIL']}
            >
              {landlordSummary.activity.length === 0 ? (
                <tr className="full-width-row">
                  <td colSpan={5} className="py-12 text-center text-muted-foreground text-xs">
                    No activity logged for this landlord's fields.
                  </td>
                </tr>
              ) : (
                landlordSummary.activity.map((a, i) => {
                  const typeKey = a.activityType;
                  return (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td data-label="DATE" className="px-4 py-3 font-mono text-[10px] text-foreground whitespace-nowrap">{a.date}</td>
                      <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground">{a.fieldName}</td>
                      <td data-label="TYPE" className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-bold border ${ACTIVITY_BG_COLORS[typeKey]} ${ACTIVITY_TEXT_COLORS[typeKey]} border-current/20`}>
                          {ACTIVITY_LABEL[a.activityType]}
                        </span>
                      </td>
                      <td data-label="CROP" className="px-4 py-3 font-mono text-[10px] text-foreground">{a.crop ?? '—'}</td>
                      <td data-label="DETAIL" className="px-4 py-3 text-xs text-muted-foreground">{a.detail}</td>
                    </tr>
                  );
                })
              )}
            </ReportTable>
          </div>
        ) : null}
      </div>
    </div>
  );
}
