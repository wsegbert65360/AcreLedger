/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import FallFsaReport from '@/components/reports/FallFsaReport';
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

function renderFall(farmName: string | null) {
  render(
    <FallFsaReport
      fsaFallRows={[]}
      totalHarvestBu={0}
      totalFallHayBales={0}
      fsaFallIssues={[]}
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

  it('shows the real farm name on the fall production header and a blank when it is missing', () => {
    const { unmount } = render(
      <FallFsaReport
        fsaFallRows={[]}
        totalHarvestBu={0}
        totalFallHayBales={0}
        fsaFallIssues={[]}
        readinessSummary={summary}
        farmName="QA Test Farm"
        viewingSeason={2026}
        reportDate="Oct 18, 2026"
        onExportCsv={vi.fn()}
        onExportPdf={vi.fn()}
      />,
    );
    expect(screen.getByText('Farm: QA Test Farm | Crop Year: 2026 | Not an official USDA form. Generated Oct 18, 2026.')).toBeInTheDocument();
    unmount();

    renderFall(null);
    expect(screen.getByText('Farm: — | Crop Year: 2026 | Not an official USDA form. Generated Oct 18, 2026.')).toBeInTheDocument();
    expect(screen.queryByText(/AcreLedger Farm/)).not.toBeInTheDocument();
  });
});
