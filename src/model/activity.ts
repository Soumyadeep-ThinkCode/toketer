/**
 * Shared, host-independent data model for Toketer.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  PRIVACY GUARANTEE (metadata-only, forever)
 * ──────────────────────────────────────────────────────────────────────────
 *  The types in this file are deliberately designed so that there is NO field
 *  capable of holding source code, file contents, diffs, AI prompts, or AI
 *  responses. Toketer only ever records *counts* and *labels*:
 *    - token counts (numbers)
 *    - model / vendor / surface labels (short identifiers)
 *    - a cost estimate (a number)
 *    - a repository folder name (a label, never a path or contents)
 *
 *  If you ever find yourself wanting to add a field that could carry free-form
 *  user content here, STOP — that is a critical privacy bug by definition.
 */

/**
 * The editor surface the AI activity happened in. Detected from public VS Code
 * APIs (e.g. `vscode.env.appName`). Used for attribution only.
 */
export type IdeSurface = 'vscode' | 'cursor' | 'unknown';

/**
 * The AI vendor behind a model, when it can be inferred from the model label.
 * Purely a display/grouping label — never affects what data is collected.
 */
export type AgentVendor =
  'openai' | 'anthropic' | 'google' | 'meta' | 'mistral' | 'xai' | 'unknown';

/**
 * A single AI interaction, reduced to metadata only.
 *
 * Every property is a number or a short label. There is intentionally no place
 * to store prompt text, completion text, file names, or code.
 */
export interface AiActivityEvent {
  /** Stable unique id for this event (used for de-duplication and lists). */
  readonly id: string;

  /** Unix epoch milliseconds when the activity was recorded. */
  readonly timestampMs: number;

  /** Which editor the activity happened in. */
  readonly ideSurface: IdeSurface;

  /** Which AI vendor the model belongs to, if known. */
  readonly agentVendor: AgentVendor;

  /**
   * A human-readable model label such as `gpt-4o` or `claude-3-5-sonnet`.
   * This is a label only — it never contains user content.
   */
  readonly modelId: string;

  /** Number of input (prompt) tokens. */
  readonly promptTokens: number;

  /** Number of output (completion) tokens. */
  readonly completionTokens: number;

  /** Convenience total: `promptTokens + completionTokens`. */
  readonly totalTokens: number;

  /** Locally computed cost estimate in US dollars (the internal base currency). */
  readonly estimatedCostUsd: number;

  /**
   * True when the token counts are an estimate rather than exact figures
   * reported by the editor. Drives the honest "~" prefix and tooltip in the UI.
   */
  readonly isEstimate: boolean;

  /**
   * Optional repository folder *name* (not a path), e.g. `my-app`. A label used
   * to group activity by project. Never a filesystem path or file contents.
   */
  readonly repoName?: string;
}

/**
 * Aggregated token + cost totals for a set of events. Pure numbers.
 */
export interface Totals {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
  readonly eventCount: number;
}

/**
 * Per-model aggregation used to render the bar chart in the panel.
 */
export interface ModelBreakdown {
  readonly modelId: string;
  readonly agentVendor: AgentVendor;
  readonly totals: Totals;
  /** True when any event for this model is an estimate (drives `~`/range display). */
  readonly isEstimate: boolean;
}
