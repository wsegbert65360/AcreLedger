/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const askState = vi.hoisted(() => ({
  isAskOpen: true,
  closeAsk: vi.fn(),
  openAsk: vi.fn(),
  isOnline: true,
  viewingSeason: 2026,
  askAcreLedger: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/context/AskAcreLedgerContext', () => ({
  useAskAcreLedger: () => ({
    isAskOpen: askState.isAskOpen,
    closeAsk: askState.closeAsk,
    openAsk: askState.openAsk,
  }),
}));

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    isOnline: askState.isOnline,
    viewingSeason: askState.viewingSeason,
  }),
}));

vi.mock('@/services/aiAssistantService', () => ({
  askAcreLedger: (...args: unknown[]) => askState.askAcreLedger(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => askState.getSession(...args),
    },
  },
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: {
      success: vi.fn(),
      error: vi.fn(),
    },
  },
}));

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, open, onOpenChange }: { children: unknown; open: boolean; onOpenChange: (open: boolean) => void }) => (
    open
      ? (
        <div data-testid="drawer-root">
          <button type="button" onClick={() => onOpenChange(false)}>Close drawer</button>
          {children as never}
        </div>
      )
      : null
  ),
  DrawerContent: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DrawerHeader: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  DrawerTitle: ({ children }: { children: unknown }) => <h2>{children as never}</h2>,
  DrawerDescription: ({ children }: { children: unknown }) => <p>{children as never}</p>,
}));

import AskAcreLedger from '../AskAcreLedger';

describe('AskAcreLedger', () => {
  beforeEach(() => {
    askState.isAskOpen = true;
    askState.isOnline = true;
    askState.viewingSeason = 2026;
    askState.closeAsk.mockReset();
    askState.askAcreLedger.mockReset();
    askState.getSession.mockReset();
    askState.getSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });
    askState.askAcreLedger.mockResolvedValue({
      answer: 'April 12 on Home Place.',
      lookups: ['Earliest dated corn plantings in 2026'],
    });
  });

  it('disables send offline and shows the connection message', () => {
    askState.isOnline = false;
    render(<AskAcreLedger />);
    expect(screen.getByText('Ask the book needs a connection.')).toBeTruthy();
    expect(screen.getByLabelText('Send question')).toHaveProperty('disabled', true);
  });

  it('does not render a persistent disclaimer or retention footer', () => {
    render(<AskAcreLedger />);
    expect(screen.queryByText(/disclaimer/i)).toBeNull();
    expect(screen.queryByText(/retention/i)).toBeNull();
    expect(screen.queryByText(/verify/i)).toBeNull();
  });

  it('shows lookup text as plain text and does not render HTML from the answer', async () => {
    askState.askAcreLedger.mockResolvedValue({
      answer: '<img src=x onerror=alert(1)> April 12',
      lookups: ['Earliest dated corn plantings in 2026'],
    });
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'When was corn planted?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));

    await waitFor(() => {
      expect(screen.getByText('<img src=x onerror=alert(1)> April 12')).toBeTruthy();
    });
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByText('How I looked it up'));
    expect(screen.getByText('Earliest dated corn plantings in 2026')).toBeTruthy();
  });

  it('includes the first exchange in history on the second send', async () => {
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'How many acres of corn?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(1));

    askState.askAcreLedger.mockResolvedValue({
      answer: '80 acres of soybeans.',
      lookups: ['Sum of planting-record acres in 2026'],
    });
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'What about soybeans?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(2));

    expect(askState.askAcreLedger.mock.calls[1][0]).toBe('What about soybeans?');
    expect(askState.askAcreLedger.mock.calls[1][3]).toEqual([
      { role: 'user', content: 'How many acres of corn?' },
      { role: 'assistant', content: 'April 12 on Home Place.' },
    ]);
  });

  it('restores a failed question without leaving an unmatched history turn', async () => {
    askState.askAcreLedger
      .mockRejectedValueOnce(new Error('The assistant is unavailable right now.'))
      .mockResolvedValueOnce({
        answer: 'North bin has 500 bushels.',
        lookups: ['Physical grain bin inventory across every season'],
      });
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'What is in my bins?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));

    await waitFor(() => {
      expect(screen.getByText('The assistant is unavailable right now.')).toBeTruthy();
      expect(screen.getByLabelText('Question')).toHaveProperty('value', 'What is in my bins?');
    });
    expect(screen.queryByText('What is in my bins?')).toBeNull();

    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(2));
    expect(askState.askAcreLedger.mock.calls[1][3]).toEqual([]);
  });

  it('clears the conversation when the drawer closes', async () => {
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'How many acres of corn?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(screen.getByText('April 12 on Home Place.')).toBeTruthy());

    fireEvent.click(screen.getByText('Close drawer'));
    expect(askState.closeAsk).toHaveBeenCalled();
    expect(screen.queryByText('April 12 on Home Place.')).toBeNull();
  });
});
