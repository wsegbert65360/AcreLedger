/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const coreState = vi.hoisted(() => ({ isNative: false }));

const speechPlugin = vi.hoisted(() => ({
  available: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  addListener: vi.fn(),
}));

const ttsPlugin = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => coreState.isNative,
  },
}));

vi.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: speechPlugin,
}));

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: ttsPlugin,
}));

import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

import {
  canListen,
  canSpeak,
  MAX_TRANSCRIPT_LENGTH,
  speak,
  startListening,
  stopListening,
  stopSpeaking,
} from '../speech';

class FakeWebRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn(() => {
    this.onend?.();
  });
}

interface WebSpeechStubs {
  recognition: FakeWebRecognition;
  recognizerCtor: Mock;
  speechSynthesis: { speak: Mock; cancel: Mock };
  utterances: Array<{ text: string; lang: string; rate: number; onend: (() => void) | null }>;
}

function installWebSpeechApi(): WebSpeechStubs {
  const recognition = new FakeWebRecognition();
  const recognizerCtor = vi.fn(() => recognition);
  const speechSynthesis = { speak: vi.fn(), cancel: vi.fn() };
  const utterances: WebSpeechStubs['utterances'] = [];

  class FakeUtterance {
    lang = '';
    rate = 1;
    text: string;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
      utterances.push(this);
    }
  }

  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
    speechSynthesis?: unknown;
    SpeechSynthesisUtterance?: unknown;
  };
  w.SpeechRecognition = recognizerCtor;
  w.speechSynthesis = speechSynthesis;
  w.SpeechSynthesisUtterance = FakeUtterance;

  return { recognition, recognizerCtor, speechSynthesis, utterances };
}

function clearWebSpeechApi(): void {
  const w = window as unknown as Record<string, unknown>;
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  delete w.speechSynthesis;
  delete w.SpeechSynthesisUtterance;
}

function fireResult(recognition: FakeWebRecognition, transcript: string): void {
  fireResults(recognition, [transcript], 0);
}

function fireResults(recognition: FakeWebRecognition, transcripts: string[], resultIndex: number): void {
  const results: Record<number, { 0: { transcript: string } }> & { length: number } = {
    length: transcripts.length,
  };
  transcripts.forEach((transcript, index) => {
    results[index] = { 0: { transcript } };
  });
  (recognition.onresult as ((event: unknown) => void) | null)?.({
    resultIndex,
    results,
  });
}

beforeEach(() => {
  coreState.isNative = false;
  vi.clearAllMocks();
  ttsPlugin.speak.mockResolvedValue(undefined);
  ttsPlugin.stop.mockResolvedValue(undefined);
});

afterEach(async () => {
  await stopListening();
  stopSpeaking();
  clearWebSpeechApi();
});

describe('availability', () => {
  it('reports listen availability from web speech recognition and native always', () => {
    expect(canListen()).toBe(false);
    installWebSpeechApi();
    expect(canListen()).toBe(true);
    coreState.isNative = true;
    clearWebSpeechApi();
    expect(canListen()).toBe(true);
  });

  it('reports speak availability from speechSynthesis and native always', () => {
    expect(canSpeak()).toBe(false);
    installWebSpeechApi();
    expect(canSpeak()).toBe(true);
    coreState.isNative = true;
    clearWebSpeechApi();
    expect(canSpeak()).toBe(true);
  });
});

describe('web listening', () => {
  it('starts the browser recognizer from the tap and never touches the native plugin', async () => {
    const { recognition, recognizerCtor } = installWebSpeechApi();
    const events = { onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };

    await startListening(events);

    expect(recognizerCtor).toHaveBeenCalledTimes(1);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe('en-US');
    expect(SpeechRecognition.start).not.toHaveBeenCalled();

    fireResult(recognition, 'North bin has grain');
    expect(events.onPartial).toHaveBeenCalledWith('North bin has grain');
  });

  it('keeps the full sentence when Chrome delivers speech in chunks', async () => {
    const { recognition } = installWebSpeechApi();
    const events = { onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };

    await startListening(events);
    fireResults(recognition, ['How much grain '], 0);
    fireResults(recognition, ['How much grain ', 'is in the north bin'], 1);

    expect(events.onPartial).toHaveBeenLastCalledWith('How much grain is in the north bin');
  });

  it('does not let a replaced session finish the next listen', async () => {
    const { recognition } = installWebSpeechApi();
    const first = { onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    const second = { onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };

    await startListening(first);
    const firstOnEnd = recognition.onend;
    await startListening(second);
    firstOnEnd?.();

    expect(first.onEnd).not.toHaveBeenCalled();
    expect(second.onEnd).not.toHaveBeenCalled();
  });

  it('truncates partial transcripts to the 500-character limit', async () => {
    const { recognition } = installWebSpeechApi();
    const events = { onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };

    await startListening(events);
    fireResult(recognition, 'a'.repeat(900));

    expect(events.onPartial).toHaveBeenCalledTimes(1);
    expect(events.onPartial.mock.calls[0][0]).toHaveLength(MAX_TRANSCRIPT_LENGTH);
  });

  it('stops the recognizer and resolves once the session ends', async () => {
    const { recognition, recognizerCtor } = installWebSpeechApi();
    await startListening({ onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });

    const pendingStop = stopListening();
    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(SpeechRecognition.stop).not.toHaveBeenCalled();
    recognition.onend?.();
    await pendingStop;

    // A follow-up session can start cleanly after teardown.
    await startListening({ onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
    expect(recognizerCtor).toHaveBeenCalledTimes(2);
  });

  it('rejects when speech recognition is missing from the browser', async () => {
    await expect(startListening({})).rejects.toThrow('speech-unavailable');
  });
});

describe('web speaking', () => {
  it('speaks through speechSynthesis and never touches the TTS plugin', () => {
    const { speechSynthesis, utterances } = installWebSpeechApi();
    const onDone = vi.fn();

    speak('  Answer text.  ', onDone);

    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(utterances).toHaveLength(1);
    expect(utterances[0].text).toBe('Answer text.');
    expect(utterances[0].lang).toBe('en-US');
    expect(utterances[0].rate).toBe(0.95);
    expect(TextToSpeech.speak).not.toHaveBeenCalled();

    utterances[0].onend?.();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cancels web speech on stop', () => {
    const { speechSynthesis } = installWebSpeechApi();
    stopSpeaking();
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
    expect(TextToSpeech.stop).not.toHaveBeenCalled();
  });
});

describe('native path', () => {
  beforeEach(() => {
    coreState.isNative = true;
  });

  it('requests permission and drives the plugin recognizer', async () => {
    const partialListeners: Array<(data: { matches: string[] }) => void> = [];
    const stateListeners: Array<(data: { status: 'started' | 'stopped' }) => void> = [];

    vi.mocked(SpeechRecognition.available).mockResolvedValue({ available: true });
    vi.mocked(SpeechRecognition.checkPermissions).mockResolvedValue({ speechRecognition: 'granted' });
    vi.mocked(SpeechRecognition.start).mockResolvedValue({});
    (SpeechRecognition.addListener as unknown as Mock).mockImplementation(
      (eventName: string, callback: unknown) => {
        if (eventName === 'partialResults') {
          partialListeners.push(callback as (data: { matches: string[] }) => void);
        } else if (eventName === 'listeningState') {
          stateListeners.push(callback as (data: { status: 'started' | 'stopped' }) => void);
        }
        return Promise.resolve({ remove: vi.fn().mockResolvedValue(undefined) });
      },
    );

    const events = { onPartial: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    await startListening(events);

    expect(SpeechRecognition.available).toHaveBeenCalledTimes(1);
    expect(SpeechRecognition.checkPermissions).toHaveBeenCalledTimes(1);
    expect(SpeechRecognition.start).toHaveBeenCalledWith({
      language: 'en-US',
      maxResults: 1,
      partialResults: true,
      popup: false,
    });
    expect(partialListeners.length).toBeGreaterThan(0);

    partialListeners[0]({ matches: ['Bin one has 500'] });
    expect(events.onPartial).toHaveBeenCalledWith('Bin one has 500');

    const pendingStop = stopListening();
    expect(SpeechRecognition.stop).toHaveBeenCalledTimes(1);
    stateListeners[0]({ status: 'stopped' });
    await pendingStop;
    expect(events.onEnd).toHaveBeenCalledTimes(1);
  });

  it('rejects when microphone permission is denied', async () => {
    vi.mocked(SpeechRecognition.available).mockResolvedValue({ available: true });
    vi.mocked(SpeechRecognition.checkPermissions).mockResolvedValue({ speechRecognition: 'denied' });
    vi.mocked(SpeechRecognition.requestPermissions).mockResolvedValue({ speechRecognition: 'denied' });

    await expect(startListening({})).rejects.toThrow('speech-permission-denied');
    expect(SpeechRecognition.start).not.toHaveBeenCalled();
  });

  it('speaks with the playback audio category on iOS', () => {
    speak('Hello');
    expect(ttsPlugin.speak).toHaveBeenCalledWith({
      text: 'Hello',
      lang: 'en-US',
      rate: 0.95,
      category: 'playback',
    });
  });

  it('stops native speech through the plugin', () => {
    stopSpeaking();
    expect(ttsPlugin.stop).toHaveBeenCalledTimes(1);
  });
});