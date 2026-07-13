import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReportIssueList } from '@/components/reports/ReportIssueList';
import { ReportReadinessPanel } from '@/components/reports/ReportReadinessPanel';
import { buildReportReadinessSummary, type ReportReadinessIssue } from '@/lib/reportReadiness';

const issues: ReportReadinessIssue[] = [
  {
    id: 'missing-tract',
    itemId: 'field-a',
    fieldId: 'field-a',
    severity: 'error',
    category: 'Field setup',
    message: 'North Field is missing an FSA tract number.',
    actionLabel: 'Open field',
  },
  {
    id: 'missing-clu',
    itemId: 'field-b',
    fieldId: 'field-b',
    severity: 'warning',
    category: 'Field setup',
    message: 'South Field is missing a CLU number.',
  },
];

describe('ReportReadinessPanel', () => {
  it('shows review status, progress, issue counts, and keeps review advisory', () => {
    const onReviewIssues = vi.fn();
    const summary = buildReportReadinessSummary({ totalItems: 4, issues });

    render(<ReportReadinessPanel summary={summary} itemLabel="fields" onReviewIssues={onReviewIssues} />);

    expect(screen.getByText('Review recommended')).toBeInTheDocument();
    expect(screen.getByText('Export remains available while you review these items.')).toBeInTheDocument();
    expect(screen.getByText('2 of 4 fields ready')).toBeInTheDocument();
    expect(screen.getByText('1 error')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    fireEvent.click(screen.getByRole('button', { name: 'Review 2 issues' }));
    expect(onReviewIssues).toHaveBeenCalledOnce();
  });

  it('shows an explicit empty state', () => {
    const summary = buildReportReadinessSummary({ totalItems: 0, issues: [] });
    render(<ReportReadinessPanel summary={summary} />);
    expect(screen.getByText('No report data')).toBeInTheDocument();
    expect(screen.getByText('0 of 0 items ready')).toBeInTheDocument();
  });
});
describe('ReportIssueList', () => {
  it('groups issues and calls the supplied action with the selected issue', () => {
    const onIssueAction = vi.fn();
    render(<ReportIssueList issues={issues} onIssueAction={onIssueAction} />);

    expect(screen.getByRole('heading', { name: 'Items to review' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Field setup/ }));
    expect(screen.getByText('North Field is missing an FSA tract number.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open field' }));
    expect(onIssueAction).toHaveBeenCalledWith(issues[0]);
  });

  it('shows a clean state when there are no issues', () => {
    render(<ReportIssueList issues={[]} />);
    expect(screen.getByText('No readiness issues found.')).toBeInTheDocument();
  });
});
