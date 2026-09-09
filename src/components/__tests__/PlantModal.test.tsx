/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PlantModal from '../PlantModal';
import { Field, PlantRecord } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';
import { toLocalIsoDate } from '@/utils/dates';

// --- Mocks (canonical shape per SprayModal.test.tsx) ---
const addPlantRecordMock = vi.fn().mockResolvedValue(true);
const updatePlantRecordMock = vi.fn().mockResolvedValue(true);
let mockCluAssignments: FieldCluAssignment[] = [];

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addPlantRecord: addPlantRecordMock,
    updatePlantRecord: updatePlantRecordMock,
    plantRecords: [],
    savedSeeds: [],
    cluAssignments: mockCluAssignments,
    viewingSeason: 2026,
  })
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: {
      error: vi.fn(),
      success: vi.fn(),
      light: vi.fn()
    }
  }
}));

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
    const collectOptions = (node: any): any[] => {
      if (!node) return [];
      if (Array.isArray(node)) return node.flatMap(collectOptions);
      if (node.props?.value != null) return [node];
      return collectOptions(node.props?.children);
    };

    return (
      <select
        id={trigger?.props?.id}
        value={value}
        onChange={e => onValueChange(e.target.value)}
        data-testid="select"
      >
        {collectOptions(children)}
      </select>
    );
  },
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null
}));

describe('PlantModal acreage defaults', () => {
  const field: Field = {
    id: 'field-1',
    name: 'North Field',
    acreage: 80,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null
  };

  const cluAssignment: FieldCluAssignment = {
    id: 'assignment-1',
    farmId: 'farm-1',
    fieldId: field.id,
    tractKey: '100-200',
    cluNumber: '1',
    acres: 55,
    landUse: 'cropland',
    assignedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCluAssignments = [];
  });

  it('refreshes untouched planted acres when CLU assignments load after opening', async () => {
    const { rerender } = render(
      <PlantModal field={field} open={true} onClose={vi.fn()} />
    );

    const acreageInput = screen.getByLabelText(/planted acres/i) as HTMLInputElement;
    expect(acreageInput.value).toBe('80');

    mockCluAssignments = [cluAssignment];
    rerender(<PlantModal field={field} open={true} onClose={vi.fn()} />);

    // FSA cropland (55) wins over the raw field acreage (80).
    await waitFor(() => expect(acreageInput.value).toBe('55'));
  });

  it('preserves user-entered planted acres when CLU assignments load later', async () => {
    const { rerender } = render(
      <PlantModal field={field} open={true} onClose={vi.fn()} />
    );

    const acreageInput = screen.getByLabelText(/planted acres/i) as HTMLInputElement;
    fireEvent.change(acreageInput, { target: { value: '12.5' } });

    mockCluAssignments = [cluAssignment];
    rerender(<PlantModal field={field} open={true} onClose={vi.fn()} />);

    await waitFor(() => expect(acreageInput.value).toBe('12.5'));
  });

  it('preserves the stored acreage on edit even with CLU assignments present', () => {
    mockCluAssignments = [cluAssignment];
    const existing: PlantRecord = {
      id: 'plant-1',
      fieldId: field.id,
      fieldName: field.name,
      seedVariety: 'P1197',
      acreage: 33,
      timestamp: 1000,
      seasonYear: 2025,
      farm_id: 'farm-1',
      deleted_at: null,
      plantDate: '2025-04-10',
      crop: 'Corn',
    };

    render(
      <PlantModal field={field} open={true} onClose={vi.fn()} initialData={existing} />
    );

    const acreageInput = screen.getByLabelText(/planted acres/i) as HTMLInputElement;
    expect(acreageInput.value).toBe('33');
  });
});

describe('PlantModal duplicate mode', () => {
  const field: Field = {
    id: 'field-1',
    name: 'North Field',
    acreage: 80,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null
  };

  const source: PlantRecord = {
    id: 'plant-1',
    fieldId: field.id,
    fieldName: field.name,
    seedVariety: 'P1197',
    acreage: 33,
    timestamp: 1000,
    seasonYear: 2025,
    farm_id: 'farm-1',
    deleted_at: null,
    plantDate: '2025-04-10',
    crop: 'Corn',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCluAssignments = [];
  });

  it('stamps today and creates a new record via addPlantRecord, not an update', async () => {
    render(
      <PlantModal field={field} open={true} onClose={vi.fn()} initialData={source} mode="duplicate" />
    );

    const today = toLocalIsoDate(Date.now());
    const dateInput = screen.getByLabelText(/plant date/i) as HTMLInputElement;
    expect(dateInput.value).toBe(today);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log duplicate/i }));
    });

    await waitFor(() => expect(addPlantRecordMock).toHaveBeenCalledTimes(1));
    const arg = addPlantRecordMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      fieldId: field.id,
      fieldName: field.name,
      seedVariety: 'P1197',
      acreage: 33,
      plantDate: today,
    });
    // Fresh record: id/seasonYear/farm_id are stamped by the hook, not the modal.
    expect(arg.id).toBeUndefined();
    expect(arg.seasonYear).toBeUndefined();
    expect(arg.farm_id).toBeUndefined();
    expect(updatePlantRecordMock).not.toHaveBeenCalled();
  });
});

describe('PlantModal producer share zero', () => {
  const field: Field = {
    id: 'field-1',
    name: 'North Field',
    acreage: 80,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCluAssignments = [];
  });

  it('defaults the share from a 0% field and saves 0 on a new record', async () => {
    render(
      <PlantModal field={{ ...field, producerShare: 0 }} open={true} onClose={vi.fn()} />
    );

    const shareInput = screen.getByLabelText(/producer share/i) as HTMLInputElement;
    expect(shareInput.value).toBe('0');

    fireEvent.change(screen.getByLabelText(/seed variety/i), { target: { value: 'P1197' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log planting/i }));
    });

    await waitFor(() => expect(addPlantRecordMock).toHaveBeenCalledTimes(1));
    expect(addPlantRecordMock.mock.calls[0][0]).toMatchObject({
      fieldId: field.id,
      producerShare: 0,
    });
  });

  it('preserves a stored 0% share when editing a record on a field without a share', async () => {
    const existing: PlantRecord = {
      id: 'plant-1',
      fieldId: field.id,
      fieldName: field.name,
      seedVariety: 'P1197',
      acreage: 33,
      producerShare: 0,
      timestamp: 1000,
      seasonYear: 2025,
      farm_id: 'farm-1',
      deleted_at: null,
      plantDate: '2025-04-10',
      crop: 'Corn',
    };

    render(
      <PlantModal field={field} open={true} onClose={vi.fn()} initialData={existing} />
    );

    const shareInput = screen.getByLabelText(/producer share/i) as HTMLInputElement;
    expect(shareInput.value).toBe('0');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /update record/i }));
    });

    await waitFor(() => expect(updatePlantRecordMock).toHaveBeenCalledTimes(1));
    expect(updatePlantRecordMock.mock.calls[0][0]).toMatchObject({
      id: 'plant-1',
      producerShare: 0,
    });
  });

  it('falls back to the field default when the share entry is cleared', async () => {
    render(
      <PlantModal field={{ ...field, producerShare: 60 }} open={true} onClose={vi.fn()} />
    );

    fireEvent.change(screen.getByLabelText(/seed variety/i), { target: { value: 'P1197' } });
    fireEvent.change(screen.getByLabelText(/producer share/i), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log planting/i }));
    });

    await waitFor(() => expect(addPlantRecordMock).toHaveBeenCalledTimes(1));
    expect(addPlantRecordMock.mock.calls[0][0]).toMatchObject({
      fieldId: field.id,
      producerShare: 60,
    });
  });
});
