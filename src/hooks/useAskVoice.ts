import { useCallback, useEffect, useRef, useState } from 'react';

import {
  canListen,
  canSpeak,
  startListening as startSpeechListening,
  stopListening as stopSpeechListening,
  speak as speakText,
  stopSpeaking as stopSpeech,
  type SpeechErrorCode,
  type SpeechEvents,
} from '@/lib/speech';

export type AskVoiceStatus = 'idle' | 'requesting' | 'listening' | 'stopping';

export interface UseAskVoiceOptions {
  /** Live transcript while listening (may be called with '' when a session starts). */
  onTranscript?: (text: string) => void;
  /** Fired when listening ends with words (`text`) or with nothing heard (`null`). */
  onEndOfSpeech?: (text: string | null) => void;
  /** Fired when the browser/OS refused or revoked microphone permission. */
  onPermissionDenied?: () => void;
}

const LISTEN_TIMEOUT_MS = 30_000;
const SPEAK_ESTIMATE_MIN_MS = 2_500;
const SPEAK_ESTIMATE_PER_CHARACTER_MS = 70;
const SPEAK_ESTIMATE_MAX_MS = 90_000;

/**
 * Drawer voice state machine for Ask the book: tap-to-start, tap-to-stop,
 * auto-send on stop, a 30-second safety cap, and spoken-answer controls.
 *
 * The hook only orchestrates listening/speaking through `@/lib/speech`. It
 * never makes Ask the book network calls — the screen's `sendQuestion` is
 * invoked through `onEndOfSpeech` with the final transcript.
 */
export function useAskVoice(options: UseAskVoiceOptions = {}) {
  const [micAvailable, setMicAvailable] = useState<boolean>(() => canListen());
  const [speakerAvailable] = useState<boolean>(() => canSpeak());
  const [status, setStatus] = useState<AskVoiceStatus>('idle');
  const [didNotCatch, setDidNotCatch] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const statusRef = useRef<AskVoiceStatus>('idle');
  const micAvailableRef = useRef<boolean>(micAvailable);
  const transcriptRef = useRef('');
  const listenIdRef = useRef(0);
  const speakIdRef = useRef(0);
  const listenTimerRef = useRef<number | null>(null);
  const speakTimerRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setStatusBoth = useCallback((next: AskVoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearListenTimer = useCallback(() => {
    if (listenTimerRef.current !== null) {
      window.clearTimeout(listenTimerRef.current);
      listenTimerRef.current = null;
    }
  }, []);

  const clearSpeakTimer = useCallback(() => {
    if (speakTimerRef.current !== null) {
      window.clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    speakIdRef.current += 1;
    clearSpeakTimer();
    stopSpeech();
    setSpeaking(false);
  }, [clearSpeakTimer]);

  const speak = useCallback(
    (text: string) => {
      const cleanText = text.trim();
      if (!cleanText) return;
      const speakId = speakIdRef.current + 1;
      speakIdRef.current = speakId;
      clearSpeakTimer();
      stopSpeech();
      speakText(cleanText, () => {
        if (speakId === speakIdRef.current) setSpeaking(false);
      });
      setSpeaking(true);
      // Native TTS has no finish event; estimate completion so the speaker
      // control can return to "read" state. The web fires the callback above.
      const estimateMs = Math.max(
        SPEAK_ESTIMATE_MIN_MS,
        Math.min(SPEAK_ESTIMATE_MAX_MS, Math.round(cleanText.length * SPEAK_ESTIMATE_PER_CHARACTER_MS)),
      );
      speakTimerRef.current = window.setTimeout(() => {
        if (speakId === speakIdRef.current) setSpeaking(false);
      }, estimateMs);
    },
    [clearSpeakTimer],
  );

  const finishListening = useCallback(async () => {
    if (statusRef.current !== 'listening') return;
    setStatusBoth('stopping');
    clearListenTimer();
    await stopSpeechListening().catch(() => {});
    const text = transcriptRef.current.trim();
    if (text) {
      optionsRef.current.onEndOfSpeech?.(text);
    } else {
      setDidNotCatch(true);
      optionsRef.current.onEndOfSpeech?.(null);
    }
    setStatusBoth('idle');
  }, [clearListenTimer, setStatusBoth]);

  const handleSessionEnd = useCallback(() => {
    // The platform closed the session (user stop, silence, or OS end). The
    // in-flight `finishListening` already owns the finish when `stopping`.
    if (statusRef.current === 'listening' || statusRef.current === 'stopping') {
      void finishListening();
    }
  }, [finishListening]);

  const handleSessionError = useCallback(
    (code: SpeechErrorCode) => {
      clearListenTimer();
      if (code === 'permission') {
        optionsRef.current.onPermissionDenied?.();
      } else if (code === 'unavailable') {
        micAvailableRef.current = false;
        setMicAvailable(false);
      }
      setStatusBoth('idle');
    },
    [clearListenTimer, setStatusBoth],
  );

  const startListening = useCallback(async () => {
    if (statusRef.current !== 'idle') return;
    if (!micAvailableRef.current) return;

    stopSpeaking();
    setDidNotCatch(false);
    transcriptRef.current = '';
    optionsRef.current.onTranscript?.('');
    const listenId = ++listenIdRef.current;
    setStatusBoth('requesting');
    clearListenTimer();

    const events: SpeechEvents = {
      onPartial: text => {
        if (statusRef.current !== 'requesting' && statusRef.current !== 'listening') return;
        transcriptRef.current = text;
        optionsRef.current.onTranscript?.(text);
      },
      onEnd: handleSessionEnd,
      onError: handleSessionError,
    };

    try {
      await startSpeechListening(events);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'speech-permission-denied') handleSessionError('permission');
      else if (message === 'speech-unavailable') handleSessionError('unavailable');
      else handleSessionError('unknown');
      return;
    }

    if (listenId !== listenIdRef.current) {
      // Cancelled (typed or drawer closed) while the session was starting —
      // tear anything that came up down silently.
      await stopSpeechListening().catch(() => {});
      return;
    }

    setStatusBoth('listening');
    listenTimerRef.current = window.setTimeout(() => {
      void finishListening();
    }, LISTEN_TIMEOUT_MS);
  }, [
    clearListenTimer,
    finishListening,
    handleSessionEnd,
    handleSessionError,
    setStatusBoth,
    stopSpeaking,
  ]);

  /** User tapped the mic while listening: finish and auto-send whatever was heard. */
  const stopListening = useCallback(() => {
    if (statusRef.current !== 'listening') return;
    void finishListening();
  }, [finishListening]);

  /** Silent stop: typed questions replace the live transcript; nothing is sent. */
  const cancelListening = useCallback(() => {
    listenIdRef.current += 1;
    clearListenTimer();
    setDidNotCatch(false);
    if (statusRef.current !== 'listening') {
      if (statusRef.current === 'requesting') setStatusBoth('idle');
      return;
    }
    setStatusBoth('idle');
    void stopSpeechListening().catch(() => {});
  }, [clearListenTimer, setStatusBoth]);

  /** Full cleanup for drawer close: stop the mic and any speech, no send. */
  const reset = useCallback(() => {
    stopSpeaking();
    listenIdRef.current += 1;
    clearListenTimer();
    setDidNotCatch(false);
    transcriptRef.current = '';
    if (statusRef.current !== 'idle') {
      setStatusBoth('idle');
      void stopSpeechListening().catch(() => {});
    }
  }, [clearListenTimer, setStatusBoth, stopSpeaking]);

  // Unmount cleanup: never leave the microphone or audio running.
  useEffect(() => {
    return () => {
      clearListenTimer();
      clearSpeakTimer();
      stopSpeech();
    };
  }, [clearListenTimer, clearSpeakTimer]);

  return {
    micAvailable,
    speakerAvailable,
    status,
    didNotCatch,
    speaking,
    startListening,
    stopListening,
    cancelListening,
    speak,
    stopSpeaking,
    reset,
  };
}