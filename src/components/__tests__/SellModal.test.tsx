/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SellModal from '../SellModal';
import { Bin } from '@/types/farm';

// --- Mocks (canonical shape per SprayModal.test.tsx) ---
const addGrainMovementMock = vi.fn().mockResolvedValue(true);
const getBinTotalMock = vi.fn();

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addGrainMovement: addGrainMovementMock,
    getBinTotal: getBinTotalMock,
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

describe('SellModal inventory validation', () => {
  const bin: Bin = {
    id: 'bin-1',
    name: 'Bin 1',
    capacity: 5000,
    farm_id: 'farm-1',
    deleted_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // All-season total: 1,000 prior-season carryover + 300 current-season.
    getBinTotalMock.mockReturnValue(1300);
  });

  it('checks inventory with the all-season total (no season argument)', () => {
    render(<SellModal bin={bin} open={true} onClose={vi.fn()} />);

    expect(getBinTotalMock).toHaveBeenCalledWith('bin-1');
    // Every call must omit the season arg — passing the viewing season here is
    // the carryover-grain bug this rule exists to prevent.
    for (const call of getBinTotalMock.mock.calls) {
      expect(call).toHaveLength(1);
    }
    expect(screen.getByText(/1,300 bu|1300 bu/)).toBeInTheDocument();
  });

  it('blocks a sale that exceeds the bin inventory', async () => {
    render(<SellModal bin={bin} open={true} onClose={vi.fn()} />);

    const bushelsInput = screen.getByLabelText(/bushels sold/i);
    fireEvent.change(bushelsInput, { target: { value: '2000' } });

    expect(screen.getByText(/EXCEEDS BIN INVENTORY/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm sale/i })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm sale/i }));
    });
    expect(addGrainMovementMock).not.toHaveBeenCalled();
  });

  it('allows a sale covered by prior-season carryover grain', async () => {
    render(<SellModal bin={bin} open={true} onClose={vi.fn()} />);

    const bushelsInput = screen.getByLabelText(/bushels sold/i);
    fireEvent.change(bushelsInput, { target: { value: '1000' } });

    const confirmButton = screen.getByRole('button', { name: /confirm sale/i });
    expect(confirmButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(confirmButton);
    });

    await waitFor(() => expect(addGrainMovementMock).toHaveBeenCalledTimes(1));
    expect(addGrainMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        binId: 'bin-1',
        binName: 'Bin 1',
        type: 'out',
        bushels: 1000,
      })
    );
  });
});
