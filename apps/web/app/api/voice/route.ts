// Server-only ElevenLabs text-to-speech proxy. The dashboard POSTs incident text
// here and gets back audio/mpeg; the API key is read from the server environment
// and NEVER reaches the browser. On any miss (no key, upstream error) it returns
// a non-200 so the client falls back to the browser's speech synthesis.

const TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
// Voice per language so the accent matches the UI selector:
//   es → "Jose" (es-MX, neutral Mexican)   ·   en → "River" (en-US, neutral American)
// Both overridable via env. The multilingual model lets each native voice carry its accent.
const VOICE_ES = process.env.ELEVENLABS_VOICE_ID_ES || 'RCQLic2ghPCdlcNkxN9R';
const VOICE_EN = process.env.ELEVENLABS_VOICE_ID_EN || 'SAz9YHcvj6GT2YYXdXww';
const DEFAULT_MODEL = 'eleven_multilingual_v2';

export async function POST(req: Request): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: 'voice disabled' }, { status: 503 });

  let text = '';
  let lang: 'es' | 'en' = 'es';
  try {
    const body = (await req.json()) as { text?: string; lang?: string };
    text = (body.text ?? '').slice(0, 600); // cap to protect the character quota
    if (body.lang === 'en') lang = 'en';
  } catch {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!text.trim()) return Response.json({ error: 'text required' }, { status: 400 });

  const voiceId = lang === 'en' ? VOICE_EN : VOICE_ES;
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
