import { useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ReportReadinessIssue, ReportReadinessSummary } from '@/lib/reportReadiness';
import type { ReportExportStatus } from '@/lib/reportExportHistory';
import { formatIsoDate } from '@/utils/dates';
import { ReportIssueList } from './ReportIssueList';
import { ReportReadinessPanel } from './ReportReadinessPanel';

interface MobileReportExportPanelProps {
  title: string;
  description: string;
  summary: ReportReadinessSummary;
  itemLabel: string;
  onExportPdf?: () => void;
  onExportData?: () => void;
  dataExportLabel?: string;
  onIssueAction?: (issue: ReportReadinessIssue) => void;
  exportStatus?: ReportExportStatus;
}

export function MobileReportExportPanel({
  title,
  description,
  summary,
  itemLabel,
  onExportPdf,
  onExportData,
  dataExportLabel = 'Export CSV',
  onIssueAction,
  exportStatus,
}: MobileReportExportPanelProps) {
  const [showIssues, setShowIssues] = useState(false);
  const issuesRef = useRef<HTMLDivElement>(null);

  const handleReviewIssues = () => {
    setShowIssues(true);
    requestAnimationFrame(() => issuesRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <section className="space-y-4 lg:hidden print:hidden">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-sans text-lg font-bold text-foreground">{title}</h2>
            <p className="mt-1 font-sans text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      <ReportReadinessPanel
        summary={summary}
        itemLabel={itemLabel}
        onReviewIssues={summary.issues.length > 0 ? handleReviewIssues : undefined}
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="font-sans text-base font-bold text-foreground">Export report</h3>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          Generate a file for printing, sharing, or office review.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {onExportPdf && (
            <Button type="button" className="h-12 w-full" onClick={onExportPdf}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Export PDF
            </Button>
          )}
          {onExportData && (
            <Button type="button" variant="outline" className="h-12 w-full" onClick={onExportData}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {dataExportLabel}
            </Button>
          )}
        </div>
        {exportStatus && (
          <p className="mt-3 font-sans text-xs font-medium text-muted-foreground" aria-live="polite">
            {!exportStatus.exportedAt
              ? 'Never exported on this device.'
              : exportStatus.hasChanges
                ? `Report data changed since the last export on ${formatIsoDate(exportStatus.exportedAt)}.`
                : `Last exported on ${formatIsoDate(exportStatus.exportedAt)}. No report changes detected.`}
          </p>
        )}
        {summary.issues.length > 0 && (
          <p className="mt-3 font-sans text-xs leading-relaxed text-muted-foreground">
            Readiness findings are advisory. You can export this report now and review corrections with the appropriate office.
          </p>
        )}
      </div>

      {showIssues && (
        <div ref={issuesRef}>
          <ReportIssueList issues={summary.issues} onIssueAction={onIssueAction} />
        </div>
      )}
    </section>
  );
}
