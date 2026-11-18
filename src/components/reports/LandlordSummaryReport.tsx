import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import ReportTable from '@/components/ReportTable';
import { ACTIVITY_BG_COLORS, ACTIVITY_TEXT_COLORS } from '@/lib/activityIcons';
import { LANDLORD_ACTIVITY_LABELS, isBaleOnly, type LandlordSummary } from '@/lib/complianceReports';
import type { ReportReadinessIssue, ReportReadinessSummary } from '@/lib/reportReadiness';
import type { ReportExportStatus } from '@/lib/reportExportHistory';
import { MobileReportExportPanel } from './MobileReportExportPanel';

interface LandlordSummaryReportProps {
  wholeFarm?: boolean;
  onWholeFarmChange?: (wholeFarm: boolean) => void;
  selectedLandlord: string;
  setSelectedLandlord: (name: string) => void;
  uniqueLandlords: string[];
  landlordSummary: LandlordSummary | null;
  reportDate: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
  /** Include the activity timeline pages in the summary PDF. */
  includeTimeline?: boolean;
  onIncludeTimelineChange?: (includeTimeline: boolean) => void;
  readinessSummary: ReportReadinessSummary | null;
  onIssueAction?: (issue: ReportReadinessIssue) => void;
  exportStatus?: ReportExportStatus;
}

export default function LandlordSummaryReport({
  wholeFarm = false,
  onWholeFarmChange,
  selectedLandlord,
  setSelectedLandlord,
  uniqueLandlords,
  landlordSummary,
  reportDate,
  onExportCsv,
  onExportPdf,
  includeTimeline = true,
  onIncludeTimelineChange,
  readinessSummary,
  onIssueAction,
  exportStatus,
}: LandlordSummaryReportProps) {
  const reportTitle = wholeFarm ? 'Farm Owner Summary' : 'Landlord Summary';
  const seasonLabel = landlordSummary?.seasonYear != null
    ? `${landlordSummary.seasonYear} crop year`
    : 'all seasons';

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 print:border-foreground/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 print:hidden">
          <div>
            <h2 className="font-bold text-foreground text-base mb-1">{reportTitle}</h2>
            <p className="text-xs text-muted-foreground">
              All field activity, grain yield, bale production, and crop share {wholeFarm ? 'across the entire farm, including owned land' : 'for the selected landlord'}. Generated {reportDate}.
            </p>
          </div>
          {onWholeFarmChange && (
            <div className="flex flex-wrap gap-2">
              <Button variant={wholeFarm ? 'outline' : 'default'} className="h-11" aria-pressed={!wholeFarm} onClick={() => onWholeFarmChange(false)}>Landlord Summary</Button>
              <Button variant={wholeFarm ? 'default' : 'outline'} className="h-11" aria-pressed={wholeFarm} onClick={() => onWholeFarmChange(true)}>Farm Owner Summary</Button>
            </div>
          )}
          {!wholeFarm && <Select value={selectedLandlord} onValueChange={setSelectedLandlord}>
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
          </Select>}
        </div>

        {!wholeFarm && !selectedLandlord ? (
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
            {onIncludeTimelineChange && (
              <div className="flex min-h-11 items-center gap-3 print:hidden">
                <Switch
                  id="owner-summary-include-timeline"
                  checked={includeTimeline}
                  onCheckedChange={onIncludeTimelineChange}
                />
                <Label htmlFor="owner-summary-include-timeline" className="text-sm text-foreground">
                  Include activity timeline in PDF
                  <span className="block text-xs font-normal text-muted-foreground">
                    {includeTimeline ? 'Full report: production, hay, then the timeline.' : 'Summary only: production, hay, and sign-off.'}
                  </span>
                </Label>
              </div>
            )}
            <div className="hidden gap-2 lg:flex print:hidden">
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
                Detailed PDF
              </Button>
            </div>

            {readinessSummary && (
              <MobileReportExportPanel
                title={wholeFarm ? reportTitle : `${selectedLandlord} landlord summary`}
                description={`Review ${seasonLabel} field activity, grain yield, bale production, and crop-share completeness before exporting.`}
                summary={readinessSummary}
                itemLabel="fields"
                onExportPdf={onExportPdf}
                onExportData={onExportCsv}
                onIssueAction={onIssueAction}
                exportStatus={exportStatus}
              />
            )}

            {/* Fields overview */}
            <div className="hidden space-y-6 lg:block print:block">
            <ReportTable
              title="Fields"
              subtitle={`Per-field grain yield, bale production, and landlord crop share · ${seasonLabel}`}
              headers={['FIELD', 'CROP', 'ACRES', 'TOTAL BU.', 'BU/ACRE', 'BALES', 'LANDLORD SHARE']}
              summary={landlordSummary.fields.length > 0 ? (
                <div className="space-y-1 font-mono">
                  {landlordSummary.cropTotals.map(t => (
                    <div key={t.crop} className="flex items-center justify-between gap-4">
                      <span className="text-sm font-bold text-muted-foreground uppercase">Total {t.crop}</span>
                      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1">
                        <span className="text-sm font-bold text-foreground">{t.acres.toLocaleString()} ac</span>
                        {!isBaleOnly(t) && (
                          <>
                            <span className="text-sm font-bold text-foreground">{t.totalBushels.toLocaleString()} bu</span>
                            <span className="text-sm font-bold text-foreground">
                              {t.buPerAcre != null ? `${t.buPerAcre.toLocaleString()} bu/ac` : '—'}
                            </span>
                            <span className="text-base font-black text-blue-600">{t.landlordShareBushels.toLocaleString()} bu share</span>
                          </>
                        )}
                        {t.totalBales > 0 && (
                          <span className="text-sm font-bold text-foreground">{t.totalBales.toLocaleString()} bales</span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 border-t border-border pt-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase">Field acres (each field once)</span>
                    <span className="text-sm font-bold text-foreground">{landlordSummary.totals.acres.toLocaleString()} ac</span>
                  </div>
                  {landlordSummary.missingShareHarvests > 0 && (
                    <p className="pt-1 text-xs font-sans font-semibold text-amber-600">
                      {landlordSummary.missingShareHarvests} harvest record(s) have no crop-share percent and are counted as 0 share.
                    </p>
                  )}
                </div>
              ) : undefined}
            >
              {landlordSummary.fields.length === 0 ? (
                <tr className="full-width-row">
                  <td colSpan={7} className="py-12 text-center text-muted-foreground text-xs">
                    {wholeFarm ? 'No active fields on this farm.' : 'No fields assigned to this landlord.'}
                  </td>
                </tr>
              ) : (
                landlordSummary.fields.map(f => (
                  <tr key={`${f.fieldId}-${f.crop ?? 'none'}`} className="hover:bg-muted/30 transition-colors">
                    <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground">{f.fieldName}</td>
                    <td data-label="CROP" className="px-4 py-3 font-mono text-xs text-harvest font-bold">{f.crop ?? '—'}</td>
                    <td data-label="ACRES" className="px-4 py-3 font-mono text-xs text-foreground text-right">{f.acres.toLocaleString()}</td>
                    <td data-label="TOTAL BU." className="px-4 py-3 font-mono text-xs text-foreground text-right">{isBaleOnly(f) ? '—' : f.totalBushels.toLocaleString()}</td>
                    <td data-label="BU/ACRE" className="px-4 py-3 font-mono text-xs text-foreground text-right">{f.buPerAcre != null ? f.buPerAcre.toLocaleString() : '—'}</td>
                    <td data-label="BALES" className="px-4 py-3 font-mono text-xs text-foreground text-right">{f.totalBales > 0 ? f.totalBales.toLocaleString() : '—'}</td>
                    <td data-label="LANDLORD SHARE" className="px-4 py-3 font-mono text-xs text-blue-600 font-bold text-right">{isBaleOnly(f) ? '—' : f.landlordShareBushels.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </ReportTable>

            {/* Activity timeline */}
            <ReportTable
              title="Activity Timeline"
              subtitle={`All field activity ${wholeFarm ? 'across the entire farm' : 'for this landlord'} · ${seasonLabel}`}
              headers={['DATE', 'FIELD', 'TYPE', 'CROP', 'DETAIL']}
            >
              {landlordSummary.activity.length === 0 ? (
                <tr className="full-width-row">
                  <td colSpan={5} className="py-12 text-center text-muted-foreground text-xs">
                    {wholeFarm ? 'No activity logged for this farm.' : "No activity logged for this landlord's fields."}
                  </td>
                </tr>
              ) : (
                landlordSummary.activity.map((a, i) => {
                  const typeKey = a.activityType;
                  return (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td data-label="DATE" className="px-4 py-3 font-mono text-xs text-foreground whitespace-nowrap">{a.date}</td>
                      <td data-label="FIELD" className="px-4 py-3 text-xs font-bold text-foreground">{a.fieldName}</td>
                      <td data-label="TYPE" className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-bold border ${ACTIVITY_BG_COLORS[typeKey]} ${ACTIVITY_TEXT_COLORS[typeKey]} border-current/20`}>
                          {LANDLORD_ACTIVITY_LABELS[a.activityType]}
                        </span>
                      </td>
                      <td data-label="CROP" className="px-4 py-3 font-mono text-xs text-foreground">{a.crop ?? '—'}</td>
                      <td data-label="DETAIL" className="px-4 py-3 text-xs text-muted-foreground">{a.detail}</td>
                    </tr>
                  );
                })
              )}
            </ReportTable>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
