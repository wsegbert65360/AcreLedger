import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkRequestDraft } from './useWorkRequestForm';
import FieldReviewStep from './FieldReviewStep';

vi.mock('./WorkRequestFieldMap', () => ({
  default: () => <div>Map preview</div>,
}));

vi.mock('@/lib/workRequests/roadLookup', () => ({
  lookupNearbyRoad: vi.fn().mockResolvedValue({ name: null, point: null }),
  NOMINATIM_ATTRIBUTION: 'Road data attribution',
}));

const draft: WorkRequestDraft = {
  requestNumber: 'WR-2026-CROP',
  status: 'Draft',
  createdAt: '2026-07-24T12:00:00.000Z',
  updatedAt: '2026-07-24T12:00:00.000Z',
  customerName: 'Grandma Bins/Hwy',
  workType: 'other',
  cropYear: 2026,
  notes: 'Spray water hemp.',
  products: [],
  fields: [{
    fieldId: 'field-1',
    farmName: 'Grandma Bins/Hwy',
    fieldName: 'Grandma Bins/Hwy',
    acreage: 105.63,
    crop: 'Soybeans',
  }],
};

describe('FieldReviewStep crop editing', () => {
  it('shows the defaulted field crop and lets the user change it', () => {
    const patchFieldEntry = vi.fn();

    render(
      <FieldReviewStep
        draft={draft}
        patchFieldEntry={patchFieldEntry}
        resolve={() => ({ field: undefined, geometry: null })}
        navUrlFor={() => null}
      />,
    );

    const cropInput = screen.getByLabelText('Crop');
    expect(cropInput).toHaveValue('Soybeans');

    fireEvent.change(cropInput, { target: { value: 'Corn' } });
    expect(patchFieldEntry).toHaveBeenCalledWith('field-1', {
      overrides: { crop: 'Corn' },
    });
  });
});
