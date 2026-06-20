'use client';

import { useState } from 'react';
import { useLang } from '@/lib/i18n';
import { playAlert } from '@/lib/voice';

interface AgentResult {
  protection: boolean;
  decision: string; // allow | deny | review | unprotected-paid
  reason: string;
  riskScore: number;
  via: string;
  extracted: {
    merchant: string;
    account: string;
    amount: number;
    currency: string;
    injected: boolean;
  };
  scraped: { chars: number; sourceRef: string };
}

const COPY = {
  es: {
    run: '▶ Correr agentes reales',
    running: 'corriendo… (scrape real + decisión en Fly)',
    again: '↻ Correr de nuevo',
    protectedTitle: '🛡️ Con Specter',
    unprotectedTitle: '💀 Sin Specter',
    scraped: 'scrapeó (real)',
    wants: 'el agente quiere pagar',
    to: 'a',
    via: 'decisión',
    risk: 'riesgo',
    error: 'No se pudo correr. Reintenta.',
    foot: 'Ambos agentes scrapean la MISMA página real con Firecrawl (tiene una inyección oculta). El de la izquierda pasa por Specter (API en Fly); el de la derecha no.',
    verdict: {
      deny: 'BLOQUEADO',
      review: 'EN ESPERA',
      allow: 'PERMITIDO',
      'unprotected-paid': 'DINERO PERDIDO',
    } as Record<string, string>,
    sub: {
      deny: 'frenado antes de mover dinero · $0',
      review: 'enviado a un humano para aprobar',
      allow: 'pago aprobado',
      'unprotected-paid': 'le pagó al atacante 💸',
    } as Record<string, string>,
  },
  en: {
    run: '▶ Run real agents',
    running: 'running… (real scrape + decision on Fly)',
    again: '↻ Run again',
    protectedTitle: '🛡️ With Specter',
    unprotectedTitle: '💀 Without Specter',
    scraped: 'scraped (real)',
    wants: 'the agent wants to pay',
    to: 'to',
    via: 'decision',
    risk: 'risk',
    error: 'Could not run. Try again.',
    foot: 'Both agents scrape the SAME real page with Firecrawl (it carries a hidden injection). The left one goes through Specter (API on Fly); the right one does not.',
    verdict: {
      deny: 'BLOCKED',
      review: 'HELD',
      allow: 'ALLOWED',
      'unprotected-paid': 'MONEY LOST',
    } as Record<string, string>,
    sub: {
      deny: 'stopped before any money moved · $0',
      review: 'sent to a human to approve',
      allow: 'payment approved',
      'unprotected-paid': 'paid the attacker 💸',
    } as Record<string, string>,
  },
} as const;

export function LiveAgents() {
  const { lang } = useLang();
  const t = COPY[lang];
  const [running, setRunning] = useState(false);
  const [protectedRun, setProtectedRun] = useState<AgentResult | null>(null);
  const [unprotectedRun, setUnprotectedRun] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const call = (protection: boolean) =>
        fetch('/api/agent-run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scenario: 'poisoned', protection }),
        }).then((r) =>
          r.ok ? (r.json() as Promise<AgentResult>) : Promise.reject(new Error('run')),
        );
      const [prot, unprot] = await Promise.all([call(true), call(false)]);
      setProtectedRun(prot);
      setUnprotectedRun(unprot);
      playAlert();
    } catch {
      setError(t.error);
    } finally {
      setRunning(false);
    }
  };

  const ran = protectedRun || unprotectedRun;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="btn-primary px-4 py-2.5 disabled:opacity-60"
        >
          {running ? t.running : ran ? t.again : t.run}
        </button>
        {error && <span className="text-sm text-block">{error}</span>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AgentCard
          title={t.protectedTitle}
          tone="specter"
          result={protectedRun}
          t={t}
          running={running}
        />
        <AgentCard
          title={t.unprotectedTitle}
          tone="block"
          result={unprotectedRun}
          t={t}
          running={running}
        />
      </div>

      <p className="text-xs text-ink-faint">{t.foot}</p>
    </div>
  );
}

function AgentCard({
  title,
  tone,
  result,
  t,
  running,
}: {
  title: string;
  tone: 'specter' | 'block';
  result: AgentResult | null;
  t: (typeof COPY)[keyof typeof COPY];
  running: boolean;
}) {
  const verdictColor =
    result == null
      ? 'ink-faint'
      : result.decision === 'allow'
        ? 'safe'
        : result.decision === 'review'
          ? 'review'
          : 'block';
  return (
    <div className={`panel p-5 border-${tone}/30`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{title}</span>
        {result && (
          <span
            className={`mono rounded-md border px-2 py-0.5 text-[11px] font-bold text-${verdictColor} border-${verdictColor}/30 bg-${verdictColor}/10`}
          >
            {t.verdict[result.decision] ?? result.decision.toUpperCase()}
          </span>
        )}
      </div>

      {result == null ? (
        <p className="mt-4 text-sm text-ink-faint">{running ? '…' : '—'}</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <div className="mono text-[11px] text-ink-faint">
            🌐 {t.scraped}: {result.scraped.sourceRef} · {result.scraped.chars} chars
          </div>
          <div className="text-ink-dim">
            🤖 {t.wants}{' '}
            <span className="text-ink">
              {result.extracted.currency} {result.extracted.amount}
            </span>{' '}
            {t.to} <span className="mono text-ink">{result.extracted.account}</span>
            {result.extracted.injected ? ' ⚠️' : ''}
          </div>
          <div className={`text-${verdictColor}`}>
            {t.verdict[result.decision]} — {t.sub[result.decision] ?? ''}
          </div>
          <div className="mono text-[11px] text-ink-faint">
            {t.via}: {result.via === 'api' ? 'Specter @ Fly [api]' : '—'} · {t.risk}{' '}
            {result.riskScore.toFixed(2)}
          </div>
          <div className="text-xs text-ink-dim">{result.reason}</div>
        </div>
      )}
    </div>
  );
}
