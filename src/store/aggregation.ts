import type { AiActivityEvent, ModelBreakdown, Totals } from '../model/activity';

/**
 * Pure aggregation helpers over lists of {@link AiActivityEvent}. No editor
 * APIs, no side effects — just folding metadata into totals and breakdowns.
 */

/** A zeroed {@link Totals} value. */
export function emptyTotals(): Totals {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    eventCount: 0,
  };
}

/**
 * Sum a list of events into a single {@link Totals}.
 * @param events The events to aggregate.
 */
export function sumTotals(events: readonly AiActivityEvent[]): Totals {
  return events.reduce<Totals>((acc, event) => {
    return {
      promptTokens: acc.promptTokens + event.promptTokens,
      completionTokens: acc.completionTokens + event.completionTokens,
      totalTokens: acc.totalTokens + event.totalTokens,
      costUsd: acc.costUsd + event.estimatedCostUsd,
      eventCount: acc.eventCount + 1,
    };
  }, emptyTotals());
}

/**
 * Whether two epoch-ms timestamps fall on the same *local* calendar day.
 * @param aMs First timestamp.
 * @param bMs Second timestamp.
 */
export function isSameLocalDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Keep only the events that happened on the same local day as `nowMs`.
 * @param events The events to filter.
 * @param nowMs The reference "now" timestamp.
 */
export function filterToday(events: readonly AiActivityEvent[], nowMs: number): AiActivityEvent[] {
  return events.filter((event) => isSameLocalDay(event.timestampMs, nowMs));
}

/**
 * Group events by model and return per-model totals, sorted by cost descending
 * so the biggest spenders appear first in the chart.
 * @param events The events to group.
 */
export function breakdownByModel(events: readonly AiActivityEvent[]): ModelBreakdown[] {
  const byModel = new Map<string, AiActivityEvent[]>();
  for (const event of events) {
    const bucket = byModel.get(event.modelId);
    if (bucket) {
      bucket.push(event);
    } else {
      byModel.set(event.modelId, [event]);
    }
  }

  const breakdowns: ModelBreakdown[] = [];
  for (const [modelId, modelEvents] of byModel) {
    breakdowns.push({
      modelId,
      agentVendor: modelEvents[0].agentVendor,
      totals: sumTotals(modelEvents),
      isEstimate: modelEvents.some((event) => event.isEstimate),
    });
  }

  return breakdowns.sort((a, b) => b.totals.costUsd - a.totals.costUsd);
}
