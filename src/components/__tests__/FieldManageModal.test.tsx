/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FieldManageModal from '../FieldManageModal';
import { Field } from '@/types/farm';

const addFieldMock = vi.fn().mockResolvedValue(true);
const updateFieldMock = vi.fn().mockResolvedValue(true);

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addField: addFieldMock,
    updateField: updateFieldMock,
    cluAssignments: [],
  })
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: {
      error: vi.fn(),
      success: vi.fn(),
      light: vi.fn()
    },
    geolocation: {
      getCurrentPosition: vi.fn().mockRejectedValue(new Error('unavailable'))
    }
  }
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polygon: () => null,
  useMap: () => ({ setView: vi.fn() }),
  useMapEvents: () => null,
}));

vi.mock('@/lib/leafletSetup', () => ({}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => {
    const trigger = (Array.isArray(children) ? children : [children]).find((c: any) => c?.props?.id);
    return (
      <select
        id={trigger?.props?.id}
        value={value}
        onChange={e => onValueChange(e.target.value)}
        data-testid="select"
      />
    );
  },
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null
}));

const editField: Field = {
  id: 'field-1',
  name: 'North Field',
  acreage: 80,
  boundaryAcreage: 80,
  producerShare: 0,
  lat: null,
  lng: null,
  farm_id: 'farm-1',
  deleted_at: null
};

describe('FieldManageModal producer share zero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addFieldMock.mockResolvedValue(true);
    updateFieldMock.mockResolvedValue(true);
  });

  it('shows a stored 0% share and preserves it through an edit', async () => {
    render(<FieldManageModal open={true} onClose={vi.fn()} editField={editField} />);

    const shareInput = screen.getByLabelText(/producer share/i) as HTMLInputElement;
    expect(shareInput.value).toBe('0');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    await waitFor(() => expect(updateFieldMock).toHaveBeenCalledTimes(1));
    expect(updateFieldMock.mock.calls[0][0]).toMatchObject({
      id: 'field-1',
      producerShare: 0,
    });
    expect(addFieldMock).not.toHaveBeenCalled();
  });

  it('defaults a new field share to 100 and drops a cleared entry to unset', async () => {
    render(<FieldManageModal open={true} onClose={vi.fn()} />);

    const shareInput = screen.getByLabelText(/producer share/i) as HTMLInputElement;
    expect(shareInput.value).toBe('100');

    fireEvent.change(screen.getByLabelText(/field name/i), { target: { value: 'South Field' } });
    fireEvent.change(screen.getByLabelText(/boundary acres/i), { target: { value: '40' } });
    fireEvent.change(shareInput, { target: { value: '0' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    });

    await waitFor(() => expect(addFieldMock).toHaveBeenCalledTimes(1));
    expect(addFieldMock.mock.calls[0][0]).toMatchObject({
      name: 'South Field',
      producerShare: 0,
    });
    expect(updateFieldMock).not.toHaveBeenCalled();
  });
});
