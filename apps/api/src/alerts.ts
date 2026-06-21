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
  /** When present, WhatsApp sends tappable Approve/Reject buttons for this incident. */
  tenantId?: string;
  incidentId?: string;
}

// Rate-limit WhatsApp so bursts (rapid demo clicks) never spam the number.
const WHATSAPP_MIN_GAP_MS = 60_000;
let lastWhatsAppAt = 0;

function kapsoConfigured(): boolean {
  return Boolean(env.kapso.apiKey && env.kapso.phoneNumberId && env.kapso.to);
}

/** Low-level Kapso send (Meta Cloud API proxy). Fire-and-forget; never awaited. */
function kapsoSend(body: Record<string, unknown>): void {
  if (!kapsoConfigured()) return;
  void fetch(`${env.kapso.apiUrl}/${env.kapso.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'X-API-Key': env.kapso.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: env.kapso.to, ...body }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}

/** Plain WhatsApp text — used for resolution confirmations from the webhook. */
export function sendWhatsAppText(text: string): void {
  kapsoSend({ type: 'text', text: { body: text } });
}

/**
 * Human-in-the-loop notification. The approval also happens IN-APP (a
 * `deny`/`review` raises an `incidents` row the dashboard surfaces over Supabase
 * Realtime with Approve / Reject, plus a spoken alert client-side).
 *
 * On top of that, optional heads-up channels fire here: email (Resend) and
 * WhatsApp (Kapso). When we can map the reply back to an incident, WhatsApp sends
 * tappable Approve/Reject buttons; the /hooks/whatsapp webhook resolves the
 * incident on tap. Both channels are fire-and-forget and never add latency.
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
    ` — Reason: ${ctx.result.reason}`;
  // eslint-disable-next-line no-console
  console.warn(line);

  // Optional email notification via Resend. Fire-and-forget.
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

  // WhatsApp — rate-limited. Interactive Approve/Reject buttons when the reply can
  // be mapped to an incident; otherwise a plain heads-up text.
  const now = Date.now();
  if (kapsoConfigured() && now - lastWhatsAppAt >= WHATSAPP_MIN_GAP_MS) {
    lastWhatsAppAt = now;
    if (ctx.tenantId && ctx.incidentId) {
      kapsoSend({
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: line.slice(0, 1024) },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: { id: `apv:${ctx.tenantId}:${ctx.incidentId}`, title: '✅ Aprobar' },
              },
              {
                type: 'reply',
                reply: { id: `rej:${ctx.tenantId}:${ctx.incidentId}`, title: '🚫 Rechazar' },
              },
            ],
          },
        },
      });
    } else {
      kapsoSend({ type: 'text', text: { body: line } });
    }
  }
}

/** Parse an inbound Kapso/Meta webhook payload for an Approve/Reject button tap. */
export function parseWhatsAppAction(
  payload: unknown,
): { action: 'approved' | 'rejected'; tenantId: string; incidentId: string } | null {
  const re = /^(apv|rej):([0-9a-fA-F-]{8,}):([0-9a-fA-F-]{8,})$/;
  const seen = new Set<unknown>();
  const stack: unknown[] = [payload];
  while (stack.length) {
    const cur = stack.pop();
    if (typeof cur === 'string') {
      const m = cur.match(re);
      if (m) {
        return {
          action: m[1] === 'apv' ? 'approved' : 'rejected',
          tenantId: m[2] as string,
          incidentId: m[3] as string,
        };
      }
    } else if (cur && typeof cur === 'object') {
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const v of Object.values(cur as Record<string, unknown>)) stack.push(v);
    }
  }
  return null;
}
