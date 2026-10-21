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
    activity: [], totals: { acres: 50, totalBushels: 5000, totalBales: 0, landlordShareBushels: 0 },
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

  test('offers a whole-farm option before any landlord is selected', () => {
    const onWholeFarmChange = vi.fn();
    render(<LandlordSummaryReport {...props} landlordSummary={null} onWholeFarmChange={onWholeFarmChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Farm Owner Summary' }));
    expect(onWholeFarmChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Select a landlord to generate their summary')).toBeInTheDocument();
  });
});
