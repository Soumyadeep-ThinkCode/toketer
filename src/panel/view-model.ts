import type { AiActivityEvent, ModelBreakdown, Totals } from '../model/activity';
import { formatMoney, formatTokenRange, formatTokens, type Currency } from '../currency/format';

/**
 * View models for the Toketer Cost panel. These are plain, already-formatted data
 * structures so the webview HTML stays dumb (no business logic in the browser).
 * Everything here is pure and unit-testable.
 */

/** One row in the "recent prompts" list. */
export interface RecentItemViewModel {
  readonly timeLabel: string;
  readonly modelId: string;
  readonly vendor: string;
  readonly surface: string;
  readonly tokensLabel: string;
  readonly inOutLabel: string;
  readonly costLabel: string;
  readonly isEstimate: boolean;
}

/** One bar in the per-model chart. */
export interface ModelBarViewModel {
  readonly modelId: string;
  readonly vendor: string;
  readonly costLabel: string;
  readonly tokensLabel: string;
  /** Width of the bar, 0–100, relative to the costliest model. */
  readonly percent: number;
}

/** Everything the panel needs to render, fully formatted. */
export interface PanelViewModel {
  readonly currency: Currency;
  readonly sessionCostLabel: string;
  readonly sessionTokensLabel: string;
  readonly todayCostLabel: string;
  readonly todayTokensLabel: string;
  readonly todayPromptCount: number;
  readonly avgCostLabel: string;
  readonly hasActivity: boolean;
  readonly anyEstimate: boolean;
  readonly models: readonly ModelBarViewModel[];
  readonly recent: readonly RecentItemViewModel[];
}

/** Inputs needed to build the panel view model. */
export interface PanelViewModelInput {
  readonly sessionTotals: Totals;
  readonly todayTotals: Totals;
  readonly todayBreakdown: readonly ModelBreakdown[];
  readonly recentEvents: readonly AiActivityEvent[];
  readonly currency: Currency;
  readonly usdToInrRate: number;
}

/** Add the honest "~" prefix for estimated figures. */
function withEstimate(label: string, isEstimate: boolean): string {
  return isEstimate ? `~${label}` : label;
}

/** Format an epoch-ms timestamp as a short local time, e.g. `14:05`. */
function formatClock(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));
}

/**
 * Build the fully-formatted {@link PanelViewModel} from raw totals and events.
 * @param input Totals, breakdown, recent events, and display preferences.
 */
export function buildPanelViewModel(input: PanelViewModelInput): PanelViewModel {
  const { currency, usdToInrRate } = input;
  const money = (usd: number): string => formatMoney(usd, currency, usdToInrRate);

  const maxModelCost = input.todayBreakdown.reduce(
    (max, model) => Math.max(max, model.totals.costUsd),
    0,
  );

  const models: ModelBarViewModel[] = input.todayBreakdown.map((model) => ({
    modelId: model.modelId,
    vendor: model.agentVendor,
    costLabel: model.isEstimate ? `~${money(model.totals.costUsd)}` : money(model.totals.costUsd),
    tokensLabel: model.isEstimate
      ? `${formatTokenRange(model.totals.totalTokens)} tok (guess)`
      : `${formatTokens(model.totals.totalTokens)} tok`,
    percent: maxModelCost > 0 ? Math.round((model.totals.costUsd / maxModelCost) * 100) : 0,
  }));

  const recent: RecentItemViewModel[] = input.recentEvents.map((event) => ({
    timeLabel: formatClock(event.timestampMs),
    modelId: event.modelId,
    vendor: event.agentVendor,
    surface: event.ideSurface,
    tokensLabel: event.isEstimate
      ? `${formatTokenRange(event.totalTokens)} tok (guess)`
      : `${formatTokens(event.totalTokens)} tok`,
    inOutLabel: event.isEstimate
      ? 'approx · Copilot hides real tokens'
      : `${formatTokens(event.promptTokens)} in · ${formatTokens(event.completionTokens)} out`,
    costLabel: withEstimate(money(event.estimatedCostUsd), event.isEstimate),
    isEstimate: event.isEstimate,
  }));

  const anyEstimate = input.recentEvents.some((event) => event.isEstimate);
  const sessionHasEstimate = input.sessionTotals.costUsd > 0 && anyEstimate;

  const todayCount = input.todayTotals.eventCount;
  const avgCostUsd = todayCount > 0 ? input.todayTotals.costUsd / todayCount : 0;

  return {
    currency,
    sessionCostLabel: withEstimate(money(input.sessionTotals.costUsd), sessionHasEstimate),
    sessionTokensLabel: withEstimate(
      formatTokens(input.sessionTotals.totalTokens),
      sessionHasEstimate,
    ),
    todayCostLabel: withEstimate(money(input.todayTotals.costUsd), anyEstimate),
    todayTokensLabel: withEstimate(formatTokens(input.todayTotals.totalTokens), anyEstimate),
    todayPromptCount: todayCount,
    avgCostLabel: withEstimate(money(avgCostUsd), anyEstimate),
    hasActivity: input.todayTotals.eventCount > 0 || input.sessionTotals.eventCount > 0,
    anyEstimate,
    models,
    recent,
  };
}
