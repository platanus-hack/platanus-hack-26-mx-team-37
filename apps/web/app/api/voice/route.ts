// Server-only ElevenLabs text-to-speech proxy. The dashboard POSTs incident text
// here and gets back audio/mpeg; the API key is read from the server environment
// and NEVER reaches the browser. On any miss (no key, upstream error) it returns
// a non-200 so the client falls back to the browser's speech synthesis.

const TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
// "Roger" — a premade multilingual voice available on every account. Override via env.
const DEFAULT_VOICE = 'CwhRBWXzGAHq8TQ4Fs17';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

export async function POST(req: Request): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: 'voice disabled' }, { status: 503 });

  let text = '';
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? '').slice(0, 600); // cap to protect the character quota
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!text.trim()) return Response.json({ error: 'text required' }, { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL;

  const upstream = await fetch(`${TTS_URL}/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: 'tts upstream failed' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
  });
}
