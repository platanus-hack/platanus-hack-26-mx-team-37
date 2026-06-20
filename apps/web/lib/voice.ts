'use client';

// Spoken alerts + sound for the dashboard / live demo. Text-to-speech prefers
// ElevenLabs (premium voice) via the same-origin /api/voice route — where the
// API key stays server-side — and falls back to the browser's built-in speech
// synthesis on any failure (no key, offline, upstream error, blocked autoplay).

/** Speak arbitrary text aloud. ElevenLabs first, browser speech-synthesis fallback. */
export function speak(text: string, lang: 'es' | 'en' = 'es'): void {
  if (typeof window === 'undefined' || !text.trim()) return;
  void playElevenLabs(text, lang).catch(() => speakBrowser(text, lang));
}

/** Spoken incident alert (kept for existing callers). */
export function speakIncident(text: string, lang: 'es' | 'en'): void {
  speak(text, lang);
}

/**
 * Short alert sound when a payment is blocked (ElevenLabs-generated, served
 * statically). Best-effort — browsers block autoplay until a user gesture, so it
 * plays once the user has interacted with the page.
 */
export function playAlert(): void {
  if (typeof window === 'undefined') return;
  try {
    const a = new Audio('/sounds/blocked.mp3');
    a.volume = 0.5;
    void a.play().catch(() => {});
  } catch {
    /* audio unavailable — silent */
  }
}

async function playElevenLabs(text: string, lang: 'es' | 'en'): Promise<void> {
  const res = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, lang }),
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
