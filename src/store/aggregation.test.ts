import { describe, expect, it } from 'vitest';
import type { AiActivityEvent } from '../model/activity';
import { breakdownByModel, filterToday, isSameLocalDay, sumTotals } from './aggregation';

function event(partial: Partial<AiActivityEvent>): AiActivityEvent {
  return {
    id: Math.random().toString(36).slice(2),
    timestampMs: Date.now(),
    ideSurface: 'vscode',
    agentVendor: 'openai',
    modelId: 'gpt-4o',
    promptTokens: 100,
    completionTokens: 100,
    totalTokens: 200,
    estimatedCostUsd: 0.002,
    isEstimate: true,
    ...partial,
  };
}

describe('sumTotals', () => {
  it('returns zeros for an empty list', () => {
    expect(sumTotals([])).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      eventCount: 0,
    });
  });

  it('adds up tokens, cost and count', () => {
    const totals = sumTotals([
      event({ promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01 }),
      event({ promptTokens: 200, completionTokens: 50, totalTokens: 250, estimatedCostUsd: 0.02 }),
    ]);
    expect(totals.promptTokens).toBe(300);
    expect(totals.completionTokens).toBe(100);
    expect(totals.totalTokens).toBe(400);
    expect(totals.costUsd).toBeCloseTo(0.03, 10);
    expect(totals.eventCount).toBe(2);
  });
});

describe('isSameLocalDay', () => {
  it('is true for two times on the same day', () => {
    const morning = new Date(2024, 0, 10, 9, 0).getTime();
    const evening = new Date(2024, 0, 10, 21, 0).getTime();
    expect(isSameLocalDay(morning, evening)).toBe(true);
  });

  it('is false across a day boundary', () => {
    const day1 = new Date(2024, 0, 10, 23, 0).getTime();
    const day2 = new Date(2024, 0, 11, 1, 0).getTime();
    expect(isSameLocalDay(day1, day2)).toBe(false);
  });
});

describe('filterToday', () => {
  it('keeps only events from the reference day', () => {
    const now = new Date(2024, 0, 10, 12, 0).getTime();
    const yesterday = new Date(2024, 0, 9, 12, 0).getTime();
    const events = [event({ timestampMs: now }), event({ timestampMs: yesterday })];
    expect(filterToday(events, now)).toHaveLength(1);
  });
});

describe('breakdownByModel', () => {
  it('groups events by model and sorts by cost descending', () => {
    const events = [
      event({ modelId: 'gpt-4o', estimatedCostUsd: 0.01 }),
      event({ modelId: 'claude-3-opus', agentVendor: 'anthropic', estimatedCostUsd: 0.05 }),
      event({ modelId: 'gpt-4o', estimatedCostUsd: 0.02 }),
    ];
    const breakdown = breakdownByModel(events);
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].modelId).toBe('claude-3-opus');
    expect(breakdown[1].modelId).toBe('gpt-4o');
    expect(breakdown[1].totals.costUsd).toBeCloseTo(0.03, 10);
    expect(breakdown[1].totals.eventCount).toBe(2);
  });
});
