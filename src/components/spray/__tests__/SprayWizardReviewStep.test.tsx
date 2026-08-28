/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SprayWizardReviewStep } from '../SprayWizardReviewStep';

const baseProps = {
  fieldName: 'North 40',
  seasonYear: 2026,
  isExisting: false,
  sprayDate: '2026-06-19',
  startTime: '07:00',
  endTime: '08:00',
  applicatorName: 'Pat',
  licenseNumber: '',
  equipmentId: '',
  targetPest: 'waterhemp',
  cropOrSiteTreated: 'Corn',
  applicationMethod: 'Broadcast',
  treatedAreaSize: '73.28',
  treatedAreaUnit: 'ac',
  weather: null,
  manualWindDirection: 'S',
  manualWindSpeed: '6',
  isFullyCompliant: false,
  missingComplianceFields: ['Product rate'],
  notes: '',
  photoBase64: '',
  photoType: '',
};

describe('SprayWizardReviewStep', () => {
  it('shows a dash when a product rate is empty', () => {
    render(
      <SprayWizardReviewStep
        {...baseProps}
        products={[{ product: 'Xsate Glyphosate 53.8', rate: '', rateUnit: 'oz/ac', epaRegNumber: '92808-TX-1' }]}
      />,
    );

    expect(screen.getByText(/— oz\/ac/)).toBeTruthy();
  });
});
