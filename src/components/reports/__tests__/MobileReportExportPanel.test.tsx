import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileReportExportPanel } from '@/components/reports/MobileReportExportPanel';
import { buildReportReadinessSummary } from '@/lib/reportReadiness';

describe('MobileReportExportPanel', () => {
  it('prioritizes readiness and exports without rendering issues until requested', () => {
    const onExportPdf = vi.fn();
    const onExportData = vi.fn();
    const summary = buildReportReadinessSummary({
      totalItems: 2,
      issues: [{
        id: 'issue-1',
        itemId: 'field-1',
        severity: 'error',
        category: 'Field setup',
        message: 'North is missing a tract number.',
      }],
    });

    render(
      <MobileReportExportPanel
        title="FSA-578 worksheet"
        description="Prepare the worksheet for county office review."
        summary={summary}
        itemLabel="fields"
        onExportPdf={onExportPdf}
        onExportData={onExportData}
      />,
    );

    expect(screen.queryByText('North is missing a tract number.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onExportPdf).toHaveBeenCalledOnce();
    expect(onExportData).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Review 1 issue' }));
    fireEvent.click(screen.getByRole('button', { name: /Field setup/ }));
    expect(screen.getByText('North is missing a tract number.')).toBeInTheDocument();
  });
});
