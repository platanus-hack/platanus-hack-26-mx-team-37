// Public types for the SDK. These mirror @specter/core's schemas so the published
// package is self-contained — consumers never have to install @specter/core. They
// are structurally identical to the core types, so values typed by core remain
// assignable here.

export type ActionType = 'payment' | 'db_write' | 'shell' | 'file' | 'refund' | 'other';
export type DestinationOrigin = 'user_prompt' | 'ingested_content' | 'tool_output' | 'unknown';
export type Decision = 'allow' | 'deny' | 'review';

export interface Action {
  type: ActionType;
  amount?: number;
  currency?: string;
  /** Payee / account / target identifier. */
  destination?: string;
  /** The merchant the action claims it is paying. */
  merchantClaimed?: string;
  /** Merchant category, when known. */
  category?: string;
  /** For shell / db_write / file actions. */
  command?: string;
  /** Whatever the agent actually passed — kept for the audit record. */
  rawInput?: unknown;
}

export interface Context {
  /** The original human instruction that started the task. */
  userPrompt: string;
  /** Adapter-declared origin of the destination. */
  destinationOrigin: DestinationOrigin;
  /** Provenance breadcrumbs, e.g. ["firecrawl:https://shop.example/item"]. */
  sourceRefs: string[];
  /** The merchant established at task start (before any ingestion), if any. */
  establishedMerchant?: string;
}

export interface SignalResult {
  id: string;
  score: number;
  verdict: string;
}

export interface DecisionResult {
  decision: Decision;
  riskScore: number;
  reason: string;
  signals: Record<string, string>;
  signalDetail: SignalResult[];
}
