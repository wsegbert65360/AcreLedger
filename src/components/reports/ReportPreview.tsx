import { PlanUpgradeLink } from '@/components/settings/PlanUpgradeLink';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';

/** Free farms never receive more than this many sample rows in the DOM. */
export const REPORT_PREVIEW_LIMIT = 3;

export interface ReportPreviewRow {
  id: string;
  cells: string[];
}

interface ReportPreviewProps {
  title: string;
  headers: string[];
  rows: ReportPreviewRow[];
}

/**
 * Short stand-in for a Pro report. The full report component is not mounted
 * beside this, so browser print can only print this sample and its watermark.
 */
export function ReportPreview({ title, headers, rows }: ReportPreviewProps) {
  const sample = rows.slice(0, REPORT_PREVIEW_LIMIT);

  return (
    <section
      data-testid="report-preview"
      aria-label={`${title} preview`}
      className="report-preview relative overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="report-preview-watermark" aria-hidden="true">
        {ENTITLEMENT_COPY.reportPreviewLabel}
      </div>
      <div className="relative z-[1] space-y-3 p-4">
        <p className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
          {ENTITLEMENT_COPY.reportPreviewLabel}
        </p>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {sample.length > 0 ? (
          <ul data-testid="report-preview-rows" className="space-y-2">
            {sample.map((row) => (
              <li
                key={row.id}
                data-testid="report-preview-row"
                className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
              >
                {row.cells.map((cell, index) => (
                  <span key={`${row.id}-${headers[index] ?? index}`}>
                    {index > 0 ? ' · ' : ''}
                    <span className="text-muted-foreground">{headers[index] ? `${headers[index]}: ` : ''}</span>
                    {cell}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No rows in this preview.</p>
        )}
        <p className="font-semibold text-foreground">{ENTITLEMENT_COPY.reportLockedTitle}</p>
        <p className="text-sm text-muted-foreground">{ENTITLEMENT_COPY.reportLockedBody}</p>
        <PlanUpgradeLink />
      </div>
    </section>
  );
}

export function ReportPlanLoading() {
  return (
    <div
      role="status"
      data-testid="report-plan-loading"
      className="rounded-2xl border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground"
    >
      {ENTITLEMENT_COPY.reportPlanLoading}
    </div>
  );
}
