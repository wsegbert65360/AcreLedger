import { useId } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReportReadinessSummary } from '@/lib/reportReadiness';

interface ReportReadinessPanelProps {
  summary: ReportReadinessSummary;
  itemLabel?: string;
  onReviewIssues?: () => void;
}

const STATUS_CONTENT = {
  ready: {
    title: 'Ready to export',
    description: 'No readiness issues were found.',
    icon: CheckCircle2,
    className: 'border-primary/25 bg-primary/10 text-primary',
  },
  review: {
    title: 'Review recommended',
    description: 'Export remains available while you review these items.',
    icon: AlertTriangle,
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  empty: {
    title: 'No report data',
    description: 'There are no records to include for this report and season.',
    icon: FileQuestion,
    className: 'border-border bg-muted/40 text-muted-foreground',
  },
} as const;

export function ReportReadinessPanel({
  summary,
  itemLabel = 'items',
  onReviewIssues,
}: ReportReadinessPanelProps) {
  const titleId = useId();
  const status = STATUS_CONTENT[summary.status];
  const StatusIcon = status.icon;
  const readyPercent = summary.totalItems > 0
    ? Math.round((summary.readyItems / summary.totalItems) * 100)
    : 0;

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className={cn('flex items-start gap-3 border-b p-4', status.className)}>
        <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-sans text-base font-bold">
            {status.title}
          </h2>
          <p className="mt-0.5 font-sans text-sm leading-relaxed opacity-90">
            {status.description}
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-semibold text-muted-foreground">Report readiness</p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground">
              {summary.readyItems} of {summary.totalItems} {itemLabel} ready
            </p>
          </div>
          <span className="font-mono text-sm font-bold text-foreground">{readyPercent}%</span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Report readiness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={readyPercent}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              summary.errors > 0 ? 'bg-destructive' : summary.warnings > 0 ? 'bg-amber-500' : 'bg-primary',
            )}
            style={{ width: `${readyPercent}%` }}
          />
        </div>

        {summary.issues.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {summary.errors > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-1 font-sans text-xs font-semibold text-destructive">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                {summary.errors} {summary.errors === 1 ? 'error' : 'errors'}
              </span>
            )}
            {summary.warnings > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-sans text-xs font-semibold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {summary.warnings} {summary.warnings === 1 ? 'warning' : 'warnings'}
              </span>
            )}
            {summary.information > 0 && (
              <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-sans text-xs font-semibold text-muted-foreground">
                {summary.information} {summary.information === 1 ? 'note' : 'notes'}
              </span>
            )}
          </div>
        )}

        {summary.issues.length > 0 && onReviewIssues && (
          <Button type="button" variant="outline" className="h-11 w-full" onClick={onReviewIssues}>
            Review {summary.issues.length} {summary.issues.length === 1 ? 'issue' : 'issues'}
          </Button>
        )}
      </div>
    </section>
  );
}
