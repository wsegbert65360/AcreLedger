/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FertilizerModal from '../FertilizerModal';
import { Field, FertilizerApplication } from '@/types/farm';
import type { FieldCluAssignment } from '@/types/fsaTract';

// --- Mocks (canonical shape per SprayModal.test.tsx) ---
const addFertilizerApplicationMock = vi.fn().mockResolvedValue(true);
const updateFertilizerApplicationMock = vi.fn().mockResolvedValue(true);
let mockCluAssignments: FieldCluAssignment[] = [];

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addFertilizerApplication: addFertilizerApplicationMock,
    updateFertilizerApplication: updateFertilizerApplicationMock,
    deleteFertilizerApplications: vi.fn(),
    addFertilizerRecipe: vi.fn(),
    deleteFertilizerRecipe: vi.fn(),
    fertilizerRecipes: [],
    fertilizerApplications: [],
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

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onCheckedChange(e.target.checked)}
      data-testid="switch"
    />
  )
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => open ? <div data-testid="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
}));

describe('FertilizerModal acreage defaults', () => {
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

  it('refreshes untouched applied acres when CLU assignments load after opening', async () => {
    const { rerender } = render(
      <FertilizerModal field={field} open={true} onClose={vi.fn()} />
    );

    const acresInput = screen.getByLabelText(/acres applied/i) as HTMLInputElement;
    expect(acresInput.value).toBe('80');

    mockCluAssignments = [cluAssignment];
    rerender(<FertilizerModal field={field} open={true} onClose={vi.fn()} />);

    // FSA cropland (55) wins over the raw field acreage (80).
    await waitFor(() => expect(acresInput.value).toBe('55'));
  });

  it('preserves user-entered applied acres when CLU assignments load later', async () => {
    const { rerender } = render(
      <FertilizerModal field={field} open={true} onClose={vi.fn()} />
    );

    const acresInput = screen.getByLabelText(/acres applied/i) as HTMLInputElement;
    fireEvent.change(acresInput, { target: { value: '12.5' } });

    mockCluAssignments = [cluAssignment];
    rerender(<FertilizerModal field={field} open={true} onClose={vi.fn()} />);

    await waitFor(() => expect(acresInput.value).toBe('12.5'));
  });

  it('preserves the stored acres on edit even with CLU assignments present', () => {
    mockCluAssignments = [cluAssignment];
    const existing: FertilizerApplication = {
      id: 'fert-1',
      fieldId: field.id,
      fieldName: field.name,
      date: '2025-03-15',
      acres: 33,
      fertilizer_formula: '28-0-0',
      timestamp: 1000,
      seasonYear: 2025,
      farm_id: 'farm-1',
      deleted_at: null,
    };

    render(
      <FertilizerModal field={field} open={true} onClose={vi.fn()} initialData={existing} />
    );

    const acresInput = screen.getByLabelText(/acres applied/i) as HTMLInputElement;
    expect(acresInput.value).toBe('33');
  });
});

describe('FertilizerModal duplicate mode', () => {
  const field: Field = {
    id: 'field-1',
    name: 'North Field',
    acreage: 80,
    lat: null,
    lng: null,
    farm_id: 'farm-1',
    deleted_at: null
  };

  const source: FertilizerApplication = {
    id: 'fert-1',
    fieldId: field.id,
    fieldName: field.name,
    date: '2025-03-15',
    acres: 33,
    fertilizer_formula: '28-0-0',
    timestamp: 1000,
    seasonYear: 2025,
    farm_id: 'farm-1',
    deleted_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCluAssignments = [];
  });

  it('stamps today and creates a new record via addFertilizerApplication, not an update', async () => {
    render(
      <FertilizerModal field={field} open={true} onClose={vi.fn()} initialData={source} mode="duplicate" />
    );

    const today = new Date().toISOString().split('T')[0];
    const dateInput = screen.getByLabelText(/application date/i) as HTMLInputElement;
    expect(dateInput.value).toBe(today);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save & another/i }));
    });

    await waitFor(() => expect(addFertilizerApplicationMock).toHaveBeenCalledTimes(1));
    const arg = addFertilizerApplicationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      fieldId: field.id,
      date: today,
      acres: 33,
      fertilizer_formula: '28-0-0',
    });
    // Fresh record: id/seasonYear/farm_id are stamped by the hook, not the modal.
    expect(arg.id).toBeUndefined();
    expect(arg.seasonYear).toBeUndefined();
    expect(arg.farm_id).toBeUndefined();
    expect(updateFertilizerApplicationMock).not.toHaveBeenCalled();
  });
});
