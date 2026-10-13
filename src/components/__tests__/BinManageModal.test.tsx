/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import BinManageModal from '../BinManageModal';

const addBinMock = vi.fn().mockResolvedValue(true);
const updateBinMock = vi.fn().mockResolvedValue(true);
const prefs = vi.hoisted(() => ({ locale: 'en-US' as 'en-US' | 'en-AU' }));

vi.mock('@/store/useAppPreferences', () => ({
  useAppPreferences: () => ({ preferences: { country: 'US', locale: prefs.locale, unitSystem: 'imperial' } }),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addBin: addBinMock,
    updateBin: updateBinMock,
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('@/lib/native', () => ({
  native: { haptic: { error: vi.fn(), success: vi.fn(), light: vi.fn() } },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

describe('BinManageModal capacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prefs.locale = 'en-AU';
    addBinMock.mockResolvedValue(true);
  });

  it('saves a grouped fractional capacity through the app locale', async () => {
    render(<BinManageModal open onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/bin name/i), { target: { value: 'North' } });
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '12,000.5' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add bin/i }));
    });

    await waitFor(() => expect(addBinMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'North',
      capacity: 12000.5,
    })));
  });

  it.each(['0', '-10', '1e5', 'abc'])('rejects a non-finite or non-positive capacity of %s', async (value) => {
    render(<BinManageModal open onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/bin name/i), { target: { value: 'North' } });
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value } });

    const save = screen.getByRole('button', { name: /add bin/i });
    expect(save).toBeDisabled();
    await act(async () => {
      fireEvent.click(save);
    });
    expect(addBinMock).not.toHaveBeenCalled();
  });
});
