// Server-only ElevenLabs Speech-to-Text (Scribe) proxy. The dashboard POSTs a
// recorded audio blob; we forward it to ElevenLabs with the server-side API key
// and return the transcript. The key NEVER reaches the browser. On any miss it
// returns a non-200 so the client can degrade gracefully.

export async function POST(req: Request): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: 'stt disabled' }, { status: 503 });

  const audio = await req.blob();
  if (!audio || audio.size === 0) return Response.json({ error: 'no audio' }, { status: 400 });
  if (audio.size > 8_000_000) return Response.json({ error: 'audio too large' }, { status: 413 });

  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('file', audio, 'speech.webm');

  const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  });
  if (!upstream.ok) return Response.json({ error: 'stt upstream failed' }, { status: 502 });

  const data = (await upstream.json()) as { text?: string };
  return Response.json({ text: (data.text ?? '').trim() });
}
