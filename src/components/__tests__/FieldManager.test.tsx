import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import FieldManager from '../FieldManager';

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    fields: [{
      id: 'field-1',
      name: 'Bottom Field',
      acreage: 40,
      boundaryAcreage: 40,
      lat: 39,
      lng: -94,
      deleted_at: null,
    }],
    cluAssignments: [{
      id: 'assignment-1',
      farmId: 'farm-1',
      fieldId: 'field-1',
      tractKey: '918-1327',
      cluNumber: '1',
      acres: 32,
      landUse: 'cropland',
      assignedAt: '2026-06-16T00:00:00.000Z',
      deletedAt: null,
    }],
    deleteField: vi.fn(),
    fetchError: null,
  }),
}));

describe('FieldManager acreage display', () => {
  it('shows FSA crop acreage and identifies a different boundary acreage', () => {
    render(<FieldManager />);

    expect(screen.getByText(/32 ac FSA crop/)).toBeInTheDocument();
    expect(screen.getByText('Boundary: 40 ac')).toBeInTheDocument();
  });
});
