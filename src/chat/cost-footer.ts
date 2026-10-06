import { formatMoney, formatTokens, type Currency } from '../currency/format';

/**
 * Builds the compact one-glance summary Toketer appends under every `@toketer` answer,
 * so a developer sees the real cost and token breakdown of *this* prompt right
 * where they're working — plus running session/today totals for context.
 *
 * Pure and fully unit-testable: it takes raw numbers + display preferences and
 * returns a Markdown string. No editor APIs here.
 */
export interface PromptFooterData {
  /** Input (prompt) tokens for this interaction. */
  readonly promptTokens: number;
  /** Output (completion) tokens for this interaction. */
  readonly completionTokens: number;
  /** This interaction's cost in US dollars. */
  readonly costUsd: number;
  /** Model label used, e.g. `claude-opus-4.8`. */
  readonly modelId: string;
  /** Whether the figures are estimated (adds a "~" and a note). */
  readonly isEstimate: boolean;
  /** The model's maximum input window, when known (for the context gauge). */
  readonly contextMaxTokens?: number;
  /** Running session cost in US dollars. */
  readonly sessionCostUsd: number;
  /** Running today cost in US dollars. */
  readonly todayCostUsd: number;
  /** Display currency. */
  readonly currency: Currency;
  /** USD→INR rate for display. */
  readonly usdToInrRate: number;
}

/** Format a share as a short percentage, e.g. `6%` or `0.4%`. */
function formatPercent(part: number, whole: number): string {
  if (whole <= 0) {
    return '0%';
  }
  const pct = (part / whole) * 100;
  const digits = pct < 10 ? 1 : 0;
  return `${pct.toFixed(digits)}%`;
}

/**
 * Render the per-prompt summary footer as Markdown.
 * @param data Token counts, cost, model, totals, and display preferences.
 * @returns A compact two-line Markdown summary.
 */
export function renderPromptFooter(data: PromptFooterData): string {
  const money = (usd: number): string => formatMoney(usd, data.currency, data.usdToInrRate);
  const tilde = data.isEstimate ? '~' : '';
  const totalTokens = data.promptTokens + data.completionTokens;

  const parts: string[] = [
    `⛽ **This prompt:** ${tilde}${money(data.costUsd)}`,
    `${formatTokens(totalTokens)} tokens (${formatTokens(data.promptTokens)} in · ${formatTokens(
      data.completionTokens,
    )} out)`,
    `\`${data.modelId}\``,
  ];

  if (data.contextMaxTokens && data.contextMaxTokens > 0) {
    parts.push(
      `context ${formatPercent(data.promptTokens, data.contextMaxTokens)} of ${formatTokens(
        data.contextMaxTokens,
      )}`,
    );
  }

  const totalsLine = `**Session** ${money(data.sessionCostUsd)} · **Today** ${money(
    data.todayCostUsd,
  )}`;
  const estimateNote = data.isEstimate ? '\n\n_~ estimated — exact tokens not reported._' : '';

  return `\n\n---\n${parts.join(' · ')}\n\n${totalsLine}${estimateNote}`;
}
