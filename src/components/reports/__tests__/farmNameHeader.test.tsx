/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import InsuranceProductionReport from '@/components/reports/InsuranceProductionReport';
import FsaPlantReport from '@/components/reports/FsaPlantReport';
import { buildReportReadinessSummary } from '@/lib/reportReadiness';

const summary = buildReportReadinessSummary({ totalItems: 0, issues: [] });

function renderPlant(farmName: string | null) {
  render(
    <FsaPlantReport
      fsaPlantRows={[]}
      totalPlantAcres={0}
      plantedAcresByField={[]}
      fsaReadinessIssues={[]}
      readinessSummary={summary}
      farmName={farmName}
      viewingSeason={2026}
      reportDate="Oct 18, 2026"
      onExportCsv={vi.fn()}
      onExportPdf={vi.fn()}
    />,
  );
}

function renderInsurance(farmName: string | null) {
  return render(
    <InsuranceProductionReport
      report={{ cropYear: 2026, units: [], issues: [] }}
      readinessSummary={summary}
      farmName={farmName}
      viewingSeason={2026}
      reportDate="Oct 18, 2026"
      onExportCsv={vi.fn()}
      onExportPdf={vi.fn()}
    />,
  );
}

describe('FSA report farm name header', () => {
  it('shows the real farm name on the FSA-578 desktop header', () => {
    renderPlant('QA Test Farm');

    expect(screen.getByText('Farm: QA Test Farm | Crop Year: 2026 | Not an official USDA form. Generated Oct 18, 2026.')).toBeInTheDocument();
  });

  it('shows a blank instead of an invented farm name when the FSA-578 name is missing', () => {
    renderPlant(null);

    expect(screen.getByText('Farm: — | Crop Year: 2026 | Not an official USDA form. Generated Oct 18, 2026.')).toBeInTheDocument();
    expect(screen.getByText(/your farm/)).toBeInTheDocument();
    expect(screen.queryByText(/AcreLedger Farm/)).not.toBeInTheDocument();
  });

  it('shows the real farm name on the insurance production header and a blank when it is missing', () => {
    const { unmount } = renderInsurance('QA Test Farm');
    expect(screen.getByText('Farm: QA Test Farm | Crop Year: 2026 | Generated Oct 18, 2026.')).toBeInTheDocument();
    unmount();

    renderInsurance(null);
    expect(screen.getByText(/^Farm: .* \| Crop Year: 2026 \| Generated Oct 18, 2026\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/AcreLedger Farm/)).not.toBeInTheDocument();
  });
});
