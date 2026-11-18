import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import LandlordSummaryReport from './LandlordSummaryReport';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const props = {
  selectedLandlord: '', setSelectedLandlord: vi.fn(), uniqueLandlords: [],
  reportDate: '10/20/2026', onExportCsv: vi.fn(), onExportPdf: vi.fn(), readinessSummary: null,
  landlordSummary: {
    landlordName: 'Farm Owner', generatedAt: '', seasonYear: 2026,
    fields: [{ fieldId: 'owned', fieldName: 'Owned Field', acres: 50, crop: 'Corn', totalBushels: 5000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 0 }],
    activity: [],
    cropTotals: [{ crop: 'Corn', acres: 50, totalBushels: 5000, buPerAcre: 100, totalBales: 0, landlordShareBushels: 0 }],
    missingShareHarvests: 0,
    totals: { acres: 50, totalBales: 0 },
  },
};

describe('Farm Owner Summary rendering', () => {
  test('renders the shared fields/timeline and export controls without a landlord selection', () => {
    render(<LandlordSummaryReport {...props} wholeFarm />);
    expect(screen.getByRole('heading', { name: 'Farm Owner Summary' })).toBeInTheDocument();
    expect(screen.getByText('Owned Field')).toBeInTheDocument();
    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Detailed PDF' }));
    expect(props.onExportCsv).toHaveBeenCalledOnce();
    expect(props.onExportPdf).toHaveBeenCalledOnce();
  });

  test('lets the owner drop the activity timeline from the PDF', () => {
    const onIncludeTimelineChange = vi.fn();
    render(<LandlordSummaryReport {...props} wholeFarm includeTimeline onIncludeTimelineChange={onIncludeTimelineChange} />);
    const toggle = screen.getByRole('switch', { name: /Include activity timeline in PDF/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(onIncludeTimelineChange).toHaveBeenCalledWith(false);
  });

  test('offers the same timeline toggle on a per-landlord summary', () => {
    const onIncludeTimelineChange = vi.fn();
    render(<LandlordSummaryReport {...props} selectedLandlord="John Smith" includeTimeline={false} onIncludeTimelineChange={onIncludeTimelineChange} />);
    const toggle = screen.getByRole('switch', { name: /Include activity timeline in PDF/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(onIncludeTimelineChange).toHaveBeenCalledWith(true);
  });

  test('offers a whole-farm option before any landlord is selected', () => {
    const onWholeFarmChange = vi.fn();
    render(<LandlordSummaryReport {...props} landlordSummary={null} onWholeFarmChange={onWholeFarmChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Farm Owner Summary' }));
    expect(onWholeFarmChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Select a landlord to generate their summary')).toBeInTheDocument();
  });
});
