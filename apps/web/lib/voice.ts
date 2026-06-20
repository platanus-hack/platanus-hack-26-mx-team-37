'use client';

// Spoken incident alert for the dashboard. Prefers ElevenLabs (premium voice) via
// the same-origin /api/voice route — where the API key stays server-side — and
// falls back to the browser's built-in speech synthesis on any failure (no key,
// offline, upstream error, blocked autoplay) so the alert always plays something.
export function speakIncident(text: string, lang: 'es' | 'en'): void {
  if (typeof window === 'undefined') return;
  void playElevenLabs(text).catch(() => speakBrowser(text, lang));
}

async function playElevenLabs(text: string): Promise<void> {
  const res = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`voice route ${res.status}`);
  const blob = await res.blob();
  if (!blob.size) throw new Error('empty audio');
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener('ended', () => URL.revokeObjectURL(url));
  await audio.play(); // rejects if autoplay is blocked → caller falls back
}

function speakBrowser(text: string, lang: 'es' | 'en'): void {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'es' ? 'es-MX' : 'en-US';
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* speech synthesis unavailable — silent */
  }
}
