'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type VoiceState = 'idle' | 'starting' | 'recording' | 'processing';

type NavigationResponse = {
  transcript?: string;
  route?: string | null;
  error?: string;
};

const BUTTON_LABELS: Record<VoiceState, string> = {
  idle: 'Speak',
  starting: 'Starting…',
  recording: 'Stop',
  processing: 'Working…',
};

const ACCESSIBLE_LABELS: Record<VoiceState, string> = {
  idle: 'Speak a page name',
  starting: 'Starting microphone',
  recording: 'Stop recording and navigate',
  processing: 'Transcribing voice command',
};

const ALLOWED_ROUTES = new Set([
  '/',
  '/agenda',
  '/people',
  '/live',
  '/organizer',
  '/onboarding',
]);

function isNavigationResponse(value: unknown): value is NavigationResponse {
  return typeof value === 'object' && value !== null;
}

function fileExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'audio';
}

export function VoiceNavigation() {
  const router = useRouter();
  const [state, setState] = useState<VoiceState>('idle');
  const [message, setMessage] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function transcribe(audio: Blob): Promise<void> {
    const formData = new FormData();
    formData.append('audio', audio, `voice-command.${fileExtension(audio.type)}`);

    try {
      const response = await fetch('/api/voice-navigation', {
        method: 'POST',
        body: formData,
      });
      const result: unknown = await response.json();

      if (!isNavigationResponse(result)) {
        throw new Error('The voice navigation service returned an unexpected response.');
      }

      if (!response.ok) {
        throw new Error(result.error ?? 'Voice navigation could not process that recording.');
      }

      if (
        typeof result.route !== 'string' ||
        !ALLOWED_ROUTES.has(result.route) ||
        typeof result.transcript !== 'string'
      ) {
        throw new Error('I could not match that request to a page. Try “Speaker Schedules”.');
      }

      setMessage('');
      router.push(result.route);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Voice navigation failed.');
    } finally {
      setState('idle');
    }
  }

  async function startRecording(): Promise<void> {
    setState('starting');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('idle');
      setMessage('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener(
        'stop',
        () => {
          if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
          const audio = new Blob(chunksRef.current, {
            type: recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm',
          });
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          if (audio.size === 0) {
            setState('idle');
            setMessage('No audio was captured. Try speaking again.');
            return;
          }
          void transcribe(audio);
        },
        { once: true },
      );

      recorder.start();
      setState('recording');
      setMessage('Listening. Select Stop when you have finished speaking.');
      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') {
          setState('processing');
          setMessage('Recording limit reached. Transcribing your request…');
          recorder.stop();
        }
      }, 15_000);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const detail = error instanceof Error ? error.message : 'Microphone access failed.';
      setState('idle');
      setMessage(`Could not start recording. Check microphone permission. ${detail}`);
    }
  }

  function stopRecording(): void {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'recording') return;

    setState('processing');
    setMessage('Transcribing your request…');
    recorder.stop();
  }

  function handleClick(): void {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'idle') {
      void startRecording();
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        className={`btn !py-1.5 !px-3 text-xs whitespace-nowrap ${
          state === 'recording' ? 'border-hot text-hot' : ''
        }`}
        onClick={handleClick}
        disabled={state === 'starting' || state === 'processing'}
        aria-label={ACCESSIBLE_LABELS[state]}
        title="Speak a page name"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-4"
        >
          <rect x="9" y="2.5" width="6" height="12" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" />
        </svg>
        <span>{BUTTON_LABELS[state]}</span>
      </button>
      {message && (
        <span
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted shadow-lg"
          role="status"
          aria-live="polite"
        >
          {message}
        </span>
      )}
    </div>
  );
}
