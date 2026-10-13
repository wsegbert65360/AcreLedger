/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';

import SellModal from '../SellModal';
import { Bin } from '@/types/farm';
import { toLocalIsoDate } from '@/utils/dates';

// --- Mocks (canonical shape per SprayModal.test.tsx) ---
const addGrainMovementMock = vi.fn().mockResolvedValue(true);
const getBinTotalMock = vi.fn();
const prefs = vi.hoisted(() => ({ locale: 'en-US' as 'en-US' | 'en-AU' }));

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: () => ({ preferences: { country: 'US', locale: prefs.locale, unitSystem: 'imperial' } }),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addGrainMovement: addGrainMovementMock,
    getBinTotal: getBinTotalMock,
    viewingSeason: 2026,
    session: { user: { id: 'user-1' } },
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
    prefs.locale = 'en-US';
    // All-season total: 1,000 prior-season carryover + 300 current-season.
    getBinTotalMock.mockReturnValue(1300);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks inventory with the all-season total (no season argument)', () => {
    render(<SellModal bin={bin} open={true} onClose={vi.fn()} />);

    expect(getBinTotalMock).toHaveBeenCalledWith('bin-1');
    // Every call must omit the season arg — passing the viewing season here is
    // the carryover-grain bug this rule exists to prevent.
    for (const call of getBinTotalMock.mock.calls) {
      expect(call).toHaveLength(1);
    }
    expect(screen.getByText(/1,300 bu/)).toBeInTheDocument();
  });

  it('warns without blocking a sale that would leave negative inventory', async () => {
    render(<SellModal bin={bin} open={true} onClose={vi.fn()} />);

    const bushelsInput = screen.getByLabelText(/bushels sold/i);
    fireEvent.change(bushelsInput, { target: { value: '2000' } });

    expect(screen.getByText(/negative bin inventory/i)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /confirm sale/i });
    expect(confirm).toBeEnabled();

    await act(async () => {
      fireEvent.click(confirm);
    });
    await waitFor(() => expect(addGrainMovementMock).toHaveBeenCalledTimes(1));
    expect(addGrainMovementMock).toHaveBeenCalledWith(expect.objectContaining({ bushels: 2000 }));
    expect(toast.warning).toHaveBeenCalledWith('This sale would leave negative bin inventory.');
  });

  it('parses grouped bushels with the app locale and keeps an explicit 0% moisture', async () => {
    prefs.locale = 'en-AU';
    render(<SellModal bin={bin} open={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/bushels sold/i), { target: { value: '1,000.5' } });
    fireEvent.change(screen.getByLabelText(/price \/ bu/i), { target: { value: '4.50' } });
    fireEvent.change(screen.getByLabelText(/moisture/i), { target: { value: '0' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm sale/i }));
    });

    await waitFor(() => expect(addGrainMovementMock).toHaveBeenCalledTimes(1));
    expect(addGrainMovementMock).toHaveBeenCalledWith(expect.objectContaining({
      bushels: 1000.5,
      price: 4.5,
      moisturePercent: 0,
    }));
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
        moisturePercent: 15,
      })
    );
  });

  it('resets the sale date to today when opened after the page was left overnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 22, 0, 0));
    const { rerender } = render(<SellModal bin={bin} open={false} onClose={vi.fn()} />);

    vi.setSystemTime(new Date(2026, 9, 12, 8, 0, 0));
    rerender(<SellModal bin={bin} open={true} onClose={vi.fn()} />);

    expect(screen.getByLabelText(/date/i)).toHaveValue(toLocalIsoDate(new Date(2026, 9, 12, 8, 0, 0).getTime()));
  });
});
