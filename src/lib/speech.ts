import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

/**
 * Voice adapter for Ask the book. Production UI never calls Capacitor plugins
 * or the raw Web Speech API directly — it goes through this module (same rule
 * as haptics and GPS in `src/lib/native.ts`).
 *
 * - Listening is either the native speech-recognition plugin (Capacitor) or
 *   the browser Web Speech API. Recording/session setup is serialized: the
 *   iOS plugin has crashed on overlapping `start()` after a failed session, so
 *   a new session never begins until the previous one has fully torn down.
 * - Only a transcript string is ever returned. No audio bytes are sent anywhere.
 * - Speaking uses the native text-to-speech plugin (iOS `playback` category so
 *   cab use is not silenced by the Ring/Silent switch) or `speechSynthesis`.
 */

export const MAX_TRANSCRIPT_LENGTH = 500;

const SPEECH_LANG = 'en-US';
const TTS_RATE = 0.95;

const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

export type SpeechErrorCode = 'permission' | 'unavailable' | 'unknown';

export interface SpeechEvents {
  onPartial?: (text: string) => void;
  onError?: (code: SpeechErrorCode) => void;
  onEnd?: () => void;
}

// Minimal Web Speech API typing — SpeechRecognition is not part of the
// standard TypeScript DOM lib.
interface WebSpeechAlternative {
  transcript: string;
}

interface WebSpeechResult {
  length: number;
  [index: number]: WebSpeechAlternative;
}

interface WebSpeechResultsList {
  length: number;
  [index: number]: WebSpeechResult;
}

interface WebSpeechResultEvent {
  resultIndex: number;
  results: WebSpeechResultsList;
}

interface WebSpeechErrorEvent {
  error: string;
}

interface WebSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: WebSpeechResultEvent) => void) | null;
  onerror: ((event: WebSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => WebSpeechRecognition;
    webkitSpeechRecognition?: new () => WebSpeechRecognition;
  }
}

function getWebRecognitionCtor(): (new () => WebSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function sliceTranscript(text: string): string {
  return text.slice(0, MAX_TRANSCRIPT_LENGTH);
}

/** True when the mic can be shown at all (platform capability only, not permission). */
export function canListen(): boolean {
  if (isNativePlatform()) return true;
  return getWebRecognitionCtor() !== null;
}

/** True when answers can be read aloud (platform capability only). */
export function canSpeak(): boolean {
  if (isNativePlatform()) return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

interface ActiveSession {
  stop: () => void | Promise<void>;
  done: Promise<void>;
  /** Drop result/error/end callbacks so a tearing-down session cannot finish a newer listen. */
  detach: () => void;
}

let activeSession: ActiveSession | null = null;
let lastTeardown: Promise<void> = Promise.resolve();

function registerRunningSession(session: ActiveSession): void {
  activeSession = session;
  lastTeardown = session.done
    .catch(() => {})
    .then(() => {
      if (activeSession === session) activeSession = null;
    });
}

function createWebSession(events: SpeechEvents): ActiveSession {
  const Ctor = getWebRecognitionCtor();
  if (!Ctor) throw new Error('speech-unavailable');
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = SPEECH_LANG;
  recognition.maxAlternatives = 1;

  let finished = false;
  let detached = false;
  let resolveDone!: () => void;
  let safetyTimer: number | null = null;
  const done = new Promise<void>(resolve => {
    resolveDone = resolve;
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    if (safetyTimer !== null) {
      window.clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    resolveDone();
  };

  recognition.onresult = (event: WebSpeechResultEvent) => {
    if (detached) return;
    // Concatenate every chunk from the start. Using resultIndex alone keeps only
    // the newest fragment, so "How much grain is in the north bin" becomes "north bin".
    let text = '';
    for (let i = 0; i < event.results.length; i++) {
      const alternative = event.results[i]?.[0];
      if (alternative) text += alternative.transcript;
    }
    if (text) events.onPartial?.(sliceTranscript(text));
  };

  recognition.onerror = (event: WebSpeechErrorEvent) => {
    if (detached) return;
    const code = mapWebErrorCode(event.error);
    if (code !== null) events.onError?.(code);
  };

  recognition.onend = () => {
    if (!detached) events.onEnd?.();
    finish();
  };

  // Must be called synchronously within the tap's user gesture.
  recognition.start();

  return {
    done,
    detach: () => {
      detached = true;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    },
    stop: () => {
      if (finished) return;
      try {
        recognition.stop();
      } catch {
        finish();
        return;
      }
      if (detached) {
        finish();
        return;
      }
      // Some browsers can be slow to fire `onend`; never leave a session
      // pending open for a follow-up start.
      safetyTimer = window.setTimeout(finish, 2000);
    },
  };
}

function mapWebErrorCode(error: string): SpeechErrorCode | null {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'permission';
  if (error === 'audio-capture') return 'unavailable';
  // 'no-speech', 'aborted', 'network', and friends are followed by `onend` and
  // are handled by the session lifecycle rather than a user-facing error.
  return null;
}

async function ensureNativePermission(): Promise<boolean> {
  try {
    const current = await SpeechRecognition.checkPermissions();
    if (current.speechRecognition === 'granted') return true;
  } catch {
    // Older plugin versions may not implement checkPermissions; fall through
    // to requestPermissions so the OS prompt is still shown.
  }
  const requested = await SpeechRecognition.requestPermissions();
  return requested.speechRecognition === 'granted';
}

async function createNativeSession(events: SpeechEvents): Promise<ActiveSession> {
  const availability = await SpeechRecognition.available();
  if (!availability?.available) throw new Error('speech-unavailable');
  const granted = await ensureNativePermission();
  if (!granted) throw new Error('speech-permission-denied');

  let finished = false;
  let detached = false;
  let resolveDone!: () => void;
  let safetyTimer: number | null = null;
  const done = new Promise<void>(resolve => {
    resolveDone = resolve;
  });

  const handles: PluginListenerHandle[] = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    if (safetyTimer !== null) {
      window.clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    void Promise.all(handles.map(handle => Promise.resolve(handle.remove()).catch(() => {})));
    resolveDone();
  };

  const partialHandle = SpeechRecognition.addListener('partialResults', data => {
    if (detached) return;
    const text = data?.matches?.[0] ?? '';
    if (text) events.onPartial?.(sliceTranscript(text));
  });
  const stateHandle = SpeechRecognition.addListener('listeningState', data => {
    if (data?.status === 'stopped') {
      if (!detached) events.onEnd?.();
      finish();
    }
  });
  handles.push(await partialHandle, await stateHandle);

  await SpeechRecognition.start({
    language: SPEECH_LANG,
    maxResults: 1,
    partialResults: true,
    popup: false,
  });

  return {
    done,
    detach: () => {
      detached = true;
      void Promise.all(handles.map(handle => Promise.resolve(handle.remove()).catch(() => {})));
    },
    stop: async () => {
      if (finished) return;
      try {
        await SpeechRecognition.stop();
      } catch {
        // Ignore — teardown proceeds regardless.
      }
      if (detached) {
        finish();
        return;
      }
      // Let a trailing partial result land before dropping the listeners.
      safetyTimer = window.setTimeout(finish, 250);
    },
  };
}

/**
 * Start listening. Returns a promise that resolves once the session is active
 * and listening. On the web the underlying `start()` call runs synchronously
 * inside the caller's user gesture; on native it resolves after permissions
 * are granted and the recognizer reports `started`.
 */
export function startListening(events: SpeechEvents): Promise<void> {
  // Crash guard: never open a session while the previous one is still up.
  // Detach first so the old session's onend cannot finish the new listen.
  if (activeSession) {
    try {
      activeSession.detach();
      activeSession.stop();
    } catch {
      // Ignore — the new session below replaces it.
    }
  }

  if (isNativePlatform()) {
    return (async () => {
      await lastTeardown;
      const session = await createNativeSession(events);
      registerRunningSession(session);
    })();
  }

  // Web Speech start() must stay inside the tap's user gesture, so do not
  // await teardown here. Detach + stop above is enough to serialize callbacks.
  try {
    const session = createWebSession(events);
    registerRunningSession(session);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

/** Stop the active session; resolves once it has fully torn down. */
export async function stopListening(): Promise<void> {
  const session = activeSession;
  if (!session) return;
  try {
    await session.stop();
  } catch {
    // Ignore — the session still finishes below.
  }
  try {
    await session.done;
  } catch {
    // Ignore — teardown is complete regardless.
  }
  if (activeSession === session) activeSession = null;
}

/** Speak text aloud. `onDone` fires on the web when the utterance finishes. */
export function speak(text: string, onDone?: () => void): void {
  const cleanText = text.trim();
  if (!cleanText) return;

  if (isNativePlatform()) {
    void TextToSpeech.speak({
      text: cleanText,
      lang: SPEECH_LANG,
      rate: TTS_RATE,
      category: 'playback',
    }).catch(() => onDone?.());
    return;
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = SPEECH_LANG;
  utterance.rate = TTS_RATE;
  utterance.onend = () => onDone?.();
  utterance.onerror = () => onDone?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** Interrupt any in-flight speech. */
export function stopSpeaking(): void {
  if (isNativePlatform()) {
    void TextToSpeech.stop().catch(() => {});
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}