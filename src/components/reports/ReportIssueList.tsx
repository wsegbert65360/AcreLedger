import { useId } from 'react';
import { AlertTriangle, CircleAlert, Info } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReportIssueSeverity, ReportReadinessIssue } from '@/lib/reportReadiness';

interface ReportIssueListProps {
  issues: ReportReadinessIssue[];
  onIssueAction?: (issue: ReportReadinessIssue) => void;
}

const SEVERITY_STYLE: Record<ReportIssueSeverity, string> = {
  error: 'border-destructive/20 bg-destructive/10 text-destructive',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  info: 'border-border bg-muted text-muted-foreground',
};

const SEVERITY_ICON = {
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
} as const;

function groupIssues(issues: ReportReadinessIssue[]) {
  return Array.from(
    issues.reduce((groups, issue) => {
      const categoryIssues = groups.get(issue.category) ?? [];
      categoryIssues.push(issue);
      groups.set(issue.category, categoryIssues);
      return groups;
    }, new Map<string, ReportReadinessIssue[]>()),
  );
}

export function ReportIssueList({ issues, onIssueAction }: ReportIssueListProps) {
  const titleId = useId();
  if (issues.length === 0) {
    return (
      <p className="rounded-2xl border border-primary/20 bg-primary/10 p-4 font-sans text-sm text-primary">
        No readiness issues found.
      </p>
    );
  }

  const groupedIssues = groupIssues(issues);

  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-border bg-card px-4 shadow-sm">
      <h2 id={titleId} className="pt-4 font-sans text-base font-bold text-foreground">
        Items to review
      </h2>
      <Accordion type="multiple" className="w-full">
        {groupedIssues.map(([category, categoryIssues]) => (
          <AccordionItem key={category} value={category}>
            <AccordionTrigger className="min-h-11 gap-3 text-left font-sans hover:no-underline">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{category}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {categoryIssues.length}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2">
              {categoryIssues.map(issue => {
                const SeverityIcon = SEVERITY_ICON[issue.severity];
                return (
                  <article key={issue.id} className="rounded-xl border border-border bg-background p-3">
                    <div className="flex items-start gap-2.5">
                      <span className={cn('mt-0.5 rounded-full border p-1.5', SEVERITY_STYLE[issue.severity])}>
                        <SeverityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">{issue.severity}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm leading-relaxed text-foreground">{issue.message}</p>
                        {onIssueAction && issue.actionLabel && (
                          <Button
                            type="button"
                            variant="link"
                            className="mt-1 h-11 px-0 font-sans text-sm"
                            onClick={() => onIssueAction(issue)}
                          >
                            {issue.actionLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
