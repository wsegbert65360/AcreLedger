import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SprayAuditReport from '@/components/reports/SprayAuditReport';
import { buildReportReadinessSummary } from '@/lib/reportReadiness';

function windText(): string {
  const wind = screen.getByText('Wind').parentElement?.querySelector('dd');
  return wind?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function renderReport(windSpeed: number, complianceProfile?: string) {
  render(
    <SprayAuditReport
      sprayRows={[{
        _rowKey: 'row-1',
        fieldName: 'Paddock 1',
        timestamp: Date.parse('2026-10-01T12:00:00'),
        product: 'Glyphosate',
        amountDisplay: '10 L',
        windSpeed,
        windDirection: 'NW',
      }]}
      reportDate="Oct 5, 2026"
      onExportCsv={vi.fn()}
      onExportPdf={vi.fn()}
      readinessSummary={buildReportReadinessSummary({ totalItems: 1, issues: [] })}
      complianceProfile={complianceProfile}
    />,
  );
}

describe('SprayAuditReport AU wind units', () => {
  it('shows a stored 10 mph wind as 16.1 km/h and does not alert on the line', () => {
    renderReport(10, 'au-apvma');

    expect(windText()).toBe('16.1 km/h NW');
    expect(screen.queryByText('Wind alert')).not.toBeInTheDocument();
  });

  it('alerts when stored mph converts above the km/h review line', () => {
    // 15 mph is 24.1 km/h. Judging the raw 15 against 16.1 km/h would miss it.
    renderReport(15, 'au-apvma');

    expect(windText()).toBe('24.1 km/h NW');
    expect(screen.getByText('Wind alert')).toBeInTheDocument();
  });

  it('keeps a US wind value in mph', () => {
    renderReport(15, 'us-epa');

    expect(windText()).toBe('15 mph NW');
    expect(screen.getByText('Wind alert')).toBeInTheDocument();
  });
});
