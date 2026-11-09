const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const DESTINATIONS = [
  {
    path: '/agenda',
    phrases: [
      'speaker schedules',
      'speaker schedule',
      'speakers schedule',
      'speaker agenda',
      'schedules',
      'schedule',
      'agenda',
      'talks',
      'sessions',
    ],
  },
  {
    path: '/people',
    phrases: ['people', 'attendees', 'attendee', 'networking'],
  },
  {
    path: '/live',
    phrases: ['live floor', 'room occupancy', 'trending talks', 'live'],
  },
  {
    path: '/organizer',
    phrases: ['organizer', 'organiser', 'manage conference', 'add a talk'],
  },
  {
    path: '/onboarding',
    phrases: ['onboarding', 'create profile', 'sign up'],
  },
  {
    path: '/',
    phrases: ['choose a profile', 'profile selection', 'home page', 'home'],
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function findDestination(transcript: string): string | null {
  const normalized = transcript
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const paddedTranscript = ` ${normalized} `;
  const matches = new Set<string>();

  for (const destination of DESTINATIONS) {
    if (
      destination.phrases.some((phrase) =>
        paddedTranscript.includes(` ${phrase} `),
      )
    ) {
      matches.add(destination.path);
    }
  }

  return matches.size === 1 ? [...matches][0] : null;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Voice navigation is not configured. Set ELEVENLABS_API_KEY on the server.' },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'The recording could not be read.' }, { status: 400 });
  }

  const audio = formData.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: 'Record a voice command before submitting.' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: 'That recording is too large. Keep voice commands short and try again.' },
      { status: 413 },
    );
  }
  if (audio.type && !audio.type.startsWith('audio/')) {
    return Response.json({ error: 'The recording must be an audio file.' }, { status: 400 });
  }

  const elevenLabsForm = new FormData();
  elevenLabsForm.append('file', audio, audio.name || 'voice-command.webm');
  elevenLabsForm.append('model_id', 'scribe_v1');

  let transcription: Response;
  try {
    transcription = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: elevenLabsForm,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed.';
    return Response.json(
      { error: `Could not connect to ElevenLabs. ${detail}` },
      { status: 502 },
    );
  }

  if (!transcription.ok) {
    return Response.json(
      {
        error: `ElevenLabs transcription failed (HTTP ${transcription.status}). Check the API key and account access.`,
      },
      { status: 502 },
    );
  }

  let result: unknown;
  try {
    result = await transcription.json();
  } catch {
    return Response.json({ error: 'ElevenLabs returned an unreadable response.' }, { status: 502 });
  }

  if (!isRecord(result) || typeof result.text !== 'string' || !result.text.trim()) {
    return Response.json({ error: 'ElevenLabs could not find speech in that recording.' }, { status: 422 });
  }

  const transcript = result.text.trim();
  const route = findDestination(transcript);
  if (!route) {
    return Response.json(
      {
        transcript,
        error: `I heard “${transcript}”, but could not match it to a page. Try “Speaker Schedules”, “People”, “Live”, or “Organizer”.`,
      },
      { status: 422 },
    );
  }

  return Response.json({ transcript, route });
}
