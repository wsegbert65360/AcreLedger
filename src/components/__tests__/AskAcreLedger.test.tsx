/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      light: vi.fn(),
      medium: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  },
}));

vi.mock('@/lib/askSuggestions', () => ({
  getSeasonalAskSuggestions: (viewingSeason: number) => [
    'How much grain is still in my bins?',
    `How many bushels of corn did we harvest in ${viewingSeason}?`,
    `What did each field grow in ${viewingSeason}?`,
    `How much rain did we get in ${viewingSeason}?`,
    `What soybean varieties did I plant in ${viewingSeason}?`,
  ],
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

interface MockSpeechEvents {
  onPartial: (text: string) => void;
  onEnd: () => void;
  onError: (code: string) => void;
}

const speechState = vi.hoisted(() => ({
  canListen: vi.fn<() => boolean>(() => true),
  canSpeak: vi.fn<() => boolean>(() => true),
  startListening: vi.fn<(events: MockSpeechEvents) => Promise<void>>(),
  stopListening: vi.fn<() => Promise<void>>(async () => {}),
  speak: vi.fn<(text: string, onDone?: () => void) => void>(),
  stopSpeaking: vi.fn<() => void>(),
  lastEvents: null as MockSpeechEvents | null,
}));

vi.mock('@/lib/speech', () => ({
  MAX_TRANSCRIPT_LENGTH: 500,
  canListen: () => speechState.canListen(),
  canSpeak: () => speechState.canSpeak(),
  startListening: (events: MockSpeechEvents) => speechState.startListening(events),
  stopListening: () => speechState.stopListening(),
  speak: (text: string, onDone?: () => void) => speechState.speak(text, onDone),
  stopSpeaking: () => speechState.stopSpeaking(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

import { toast } from 'sonner';
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
    speechState.canListen.mockReturnValue(true);
    speechState.canSpeak.mockReturnValue(true);
    speechState.startListening.mockReset();
    speechState.startListening.mockImplementation(events => {
      speechState.lastEvents = events;
      return Promise.resolve();
    });
    speechState.stopListening.mockReset();
    speechState.stopListening.mockResolvedValue(undefined);
    speechState.speak.mockReset();
    speechState.stopSpeaking.mockReset();
    speechState.lastEvents = null;
    vi.mocked(toast.error).mockReset();
  });

  it('disables send offline and shows the connection message', () => {
    askState.isOnline = false;
    render(<AskAcreLedger />);
    expect(screen.getByText('Ask the book needs a connection.')).toBeTruthy();
    expect(screen.getByLabelText('Send question')).toHaveProperty('disabled', true);
    expect(screen.queryByText('Try a question from this farm’s book')).toBeNull();
    expect(screen.queryByRole('button', { name: 'How much grain is still in my bins?' })).toBeNull();
  });

  it('sends a suggestion chip immediately', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByRole('button', { name: 'How much grain is still in my bins?' }));

    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(1));
    expect(askState.askAcreLedger.mock.calls[0][0]).toBe('How much grain is still in my bins?');
    expect(askState.askAcreLedger.mock.calls[0][2]).toBe(2026);
    expect(screen.getByText('How much grain is still in my bins?')).toBeTruthy();
    expect(screen.queryByText('Try a question from this farm’s book')).toBeNull();
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

  it('ignores a late answer after the drawer closes', async () => {
    let resolveAsk!: (value: { answer: string; lookups: string[] }) => void;
    askState.askAcreLedger.mockImplementation(
      () => new Promise(resolve => { resolveAsk = resolve; }),
    );
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'How many acres of corn?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Checking your records…')).toBeTruthy();

    const signal = askState.askAcreLedger.mock.calls[0][4] as AbortSignal;
    fireEvent.click(screen.getByText('Close drawer'));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText('Checking your records…')).toBeNull();

    await act(async () => {
      resolveAsk({
        answer: 'April 12 on Home Place.',
        lookups: ['Earliest dated corn plantings in 2026'],
      });
    });

    expect(screen.queryByText('April 12 on Home Place.')).toBeNull();
    expect(screen.queryByText('How many acres of corn?')).toBeNull();
  });

  it('does not append a stale answer onto a new question', async () => {
    let resolveFirst!: (value: { answer: string; lookups: string[] }) => void;
    let resolveSecond!: (value: { answer: string; lookups: string[] }) => void;
    askState.askAcreLedger
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));

    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'How many acres of corn?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Close drawer'));
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'What is in my bins?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveFirst({ answer: 'Stale first answer.', lookups: [] });
    });
    expect(screen.queryByText('Stale first answer.')).toBeNull();
    expect(screen.getByText('What is in my bins?')).toBeTruthy();

    await act(async () => {
      resolveSecond({
        answer: 'North bin has 500 bushels.',
        lookups: ['Physical grain bin inventory across every season'],
      });
    });
    expect(screen.getByText('North bin has 500 bushels.')).toBeTruthy();
    expect(screen.queryByText('Stale first answer.')).toBeNull();
    expect(askState.askAcreLedger.mock.calls[1][3]).toEqual([]);
  });

  it('hides the mic when speech recognition is unavailable', () => {
    speechState.canListen.mockReturnValue(false);
    render(<AskAcreLedger />);
    expect(screen.queryByLabelText('Ask by voice')).toBeNull();
    expect(screen.queryByLabelText('Stop listening')).toBeNull();
    expect(screen.getByLabelText('Send question')).toBeTruthy();
  });

  it('disables the mic offline', () => {
    askState.isOnline = false;
    render(<AskAcreLedger />);
    expect(screen.getByLabelText('Ask by voice')).toHaveProperty('disabled', true);
  });

  it('disables the mic while an answer is loading', async () => {
    let resolveAsk!: (value: { answer: string; lookups: string[] }) => void;
    askState.askAcreLedger.mockImplementation(() => new Promise(resolve => { resolveAsk = resolve; }));
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'How many acres of corn?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => {
      expect(screen.getByLabelText('Ask by voice')).toHaveProperty('disabled', true);
      expect(screen.getByText('Checking your records…')).toBeTruthy();
    });
    await act(async () => {
      resolveAsk({ answer: '80 acres.', lookups: [] });
    });
  });

  it('streams a partial transcript into the input while listening', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByLabelText('Ask by voice'));
    await waitFor(() => expect(screen.getByLabelText('Stop listening')).toBeTruthy());
    expect(screen.getByLabelText('Question')).toHaveProperty('placeholder', 'Listening…');

    act(() => {
      speechState.lastEvents?.onPartial('North bin has 400 bushels');
    });
    expect(screen.getByLabelText('Question')).toHaveProperty('value', 'North bin has 400 bushels');

    fireEvent.click(screen.getByLabelText('Stop listening'));
    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(1));
    expect(askState.askAcreLedger.mock.calls[0][0]).toBe('North bin has 400 bushels');
  });

  it('sends the voice question and speaks the answer on stop', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByLabelText('Ask by voice'));
    await waitFor(() => expect(screen.getByLabelText('Stop listening')).toBeTruthy());
    act(() => {
      speechState.lastEvents?.onPartial('How much grain is left in the bins?');
    });
    fireEvent.click(screen.getByLabelText('Stop listening'));

    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(1));
    expect(askState.askAcreLedger.mock.calls[0][0]).toBe('How much grain is left in the bins?');

    await waitFor(() => expect(speechState.speak).toHaveBeenCalledTimes(1));
    expect(speechState.speak.mock.calls[0][0]).toBe('April 12 on Home Place.');
    expect(screen.getByRole('button', { name: 'Stop reading' })).toBeTruthy();
  });

  it('does not send when nothing was heard', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByLabelText('Ask by voice'));
    await waitFor(() => expect(screen.getByLabelText('Stop listening')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Stop listening'));

    await waitFor(() => {
      expect(screen.getByText('I didn’t catch that. Try again.')).toBeTruthy();
    });
    expect(askState.askAcreLedger).not.toHaveBeenCalled();
    expect(speechState.speak).not.toHaveBeenCalled();
  });

  it('stays quiet for typed questions but replays on demand', async () => {
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'When was corn planted?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(screen.getByText('April 12 on Home Place.')).toBeTruthy());
    expect(speechState.speak).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Read answer' }));
    expect(speechState.speak).toHaveBeenCalledTimes(1);
    expect(speechState.speak.mock.calls[0][0]).toBe('April 12 on Home Place.');

    fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }));
    expect(speechState.stopSpeaking).toHaveBeenCalled();
  });

  it('stays quiet for suggestion chips', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByRole('button', { name: 'How much grain is still in my bins?' }));
    await waitFor(() => expect(screen.getByText('April 12 on Home Place.')).toBeTruthy());
    expect(speechState.speak).not.toHaveBeenCalled();
  });

  it('stops listening and speaking when the drawer closes', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByLabelText('Ask by voice'));
    await waitFor(() => expect(screen.getByLabelText('Stop listening')).toBeTruthy());

    fireEvent.click(screen.getByText('Close drawer'));
    expect(speechState.stopListening).toHaveBeenCalled();
    expect(speechState.stopSpeaking).toHaveBeenCalled();
  });

  it('toasts when microphone permission is denied', async () => {
    speechState.startListening.mockRejectedValueOnce(new Error('speech-permission-denied'));
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByLabelText('Ask by voice'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'The book needs microphone permission to ask by voice. Typing still works.',
      );
    });
    expect(askState.askAcreLedger).not.toHaveBeenCalled();
  });

  it('cancels listening when the user types and does not send', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByLabelText('Ask by voice'));
    await waitFor(() => expect(screen.getByLabelText('Stop listening')).toBeTruthy());
    act(() => {
      speechState.lastEvents?.onPartial('How much grain');
    });

    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'How much grain did I type' },
    });

    expect(speechState.stopListening).toHaveBeenCalled();
    expect(askState.askAcreLedger).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Question')).toHaveProperty('value', 'How much grain did I type');
  });

  it('sends a voice question when Send is tapped while listening', async () => {
    render(<AskAcreLedger />);
    fireEvent.click(screen.getByLabelText('Ask by voice'));
    await waitFor(() => expect(screen.getByLabelText('Stop listening')).toBeTruthy());
    act(() => {
      speechState.lastEvents?.onPartial('How much grain is left in the bins?');
    });

    fireEvent.click(screen.getByLabelText('Send question'));

    await waitFor(() => expect(askState.askAcreLedger).toHaveBeenCalledTimes(1));
    expect(askState.askAcreLedger.mock.calls[0][0]).toBe('How much grain is left in the bins?');
    await waitFor(() => expect(speechState.speak).toHaveBeenCalledTimes(1));
  });

  it('stops in-flight speech when the drawer closes', async () => {
    render(<AskAcreLedger />);
    fireEvent.change(screen.getByLabelText('Question'), {
      target: { value: 'When was corn planted?' },
    });
    fireEvent.click(screen.getByLabelText('Send question'));
    await waitFor(() => expect(screen.getByText('April 12 on Home Place.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Read answer' }));
    expect(speechState.speak).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Close drawer'));
    expect(speechState.stopSpeaking).toHaveBeenCalled();
  });
});
