import type { DecisionResult } from '@specter/core';
import { env } from './env.js';

export interface AlertContext {
  tenantName: string;
  agentId: string;
  amount?: number;
  currency?: string;
  destination?: string;
  merchantClaimed?: string;
  result: DecisionResult;
  notificationEmail?: string;
}

// Rate-limit WhatsApp so bursts (rapid demo clicks) never spam the number.
const WHATSAPP_MIN_GAP_MS = 60_000;
let lastWhatsAppAt = 0;

/**
 * Human-in-the-loop notification. The approval itself happens IN-APP: a
 * `deny`/`review` raises an `incidents` row (see the store) that the dashboard
 * surfaces instantly over Supabase Realtime with Approve / Reject, and a short
 * spoken alert plays client-side (ElevenLabs).
 *
 * On top of the in-app queue, optional heads-up channels fire here: email via
 * Resend and WhatsApp via Kapso. Both are fire-and-forget and must NEVER add
 * latency to `/v1/evaluate` — they're never awaited and never affect the decision.
 */
export function notifyIncident(ctx: AlertContext): void {
  if (ctx.result.decision === 'allow') return;

  const verb = ctx.result.decision === 'deny' ? 'BLOCKED' : 'HELD FOR APPROVAL';
  const amount =
    ctx.amount != null ? `${ctx.currency ?? ''} ${ctx.amount}`.trim() : 'an irreversible action';
  const dest = ctx.destination ? ` to ${ctx.destination}` : '';
  const line =
    `🛡️ Specter ${verb}: ${ctx.agentId} attempted ${amount}${dest}` +
    (ctx.merchantClaimed ? ` (claims "${ctx.merchantClaimed}")` : '') +
    ` — incident raised for in-app approval. Reason: ${ctx.result.reason}`;
  // eslint-disable-next-line no-console
  console.warn(line);

  // Optional email notification via Resend. Fire-and-forget — never awaited, so it
  // cannot add latency to /v1/evaluate. No key or recipient ⇒ the in-app approval
  // queue + voice alert remain the human-in-the-loop (this is purely a heads-up).
  if (env.resend.apiKey && ctx.notificationEmail) {
    void fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.resend.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.resend.from,
        to: ctx.notificationEmail,
        subject: `Specter ${verb}: ${ctx.agentId}`,
        text: `${line}\n\nApprove or reject this in your Specter dashboard.`,
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  }

  // Optional WhatsApp alert via Kapso (Meta Cloud API proxy). Fire-and-forget.
  // Note: a business-initiated message outside the 24h customer-service window
  // needs an approved template; a plain text delivers within an open session.
  const now = Date.now();
  if (
    env.kapso.apiKey &&
    env.kapso.phoneNumberId &&
    env.kapso.to &&
    now - lastWhatsAppAt >= WHATSAPP_MIN_GAP_MS
  ) {
    lastWhatsAppAt = now;
    void fetch(`${env.kapso.apiUrl}/${env.kapso.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'X-API-Key': env.kapso.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: env.kapso.to,
        type: 'text',
        text: { body: line },
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  }
}
