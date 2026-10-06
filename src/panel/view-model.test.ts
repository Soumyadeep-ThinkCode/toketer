import { describe, expect, it } from 'vitest';
import { buildPanelViewModel } from './view-model';
import type { AiActivityEvent, Totals } from '../model/activity';

function totals(partial: Partial<Totals>): Totals {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    eventCount: 0,
    ...partial,
  };
}

function event(partial: Partial<AiActivityEvent>): AiActivityEvent {
  return {
    id: 'e1',
    timestampMs: new Date(2024, 0, 1, 14, 5).getTime(),
    ideSurface: 'vscode',
    agentVendor: 'anthropic',
    modelId: 'claude-opus-4.8',
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    estimatedCostUsd: 0.02,
    isEstimate: false,
    ...partial,
  };
}

describe('buildPanelViewModel', () => {
  it('computes prompt count and average cost for today', () => {
    const vm = buildPanelViewModel({
      sessionTotals: totals({ costUsd: 0.04, totalTokens: 3000, eventCount: 2 }),
      todayTotals: totals({ costUsd: 0.04, totalTokens: 3000, eventCount: 2 }),
      todayBreakdown: [],
      recentEvents: [],
      currency: 'USD',
      usdToInrRate: 83,
    });
    expect(vm.todayPromptCount).toBe(2);
    expect(vm.avgCostLabel).toBe('$0.02'); // 0.04 / 2
  });

  it('exposes an in/out token split per recent prompt', () => {
    const vm = buildPanelViewModel({
      sessionTotals: totals({ eventCount: 1 }),
      todayTotals: totals({ eventCount: 1 }),
      todayBreakdown: [],
      recentEvents: [event({})],
      currency: 'USD',
      usdToInrRate: 83,
    });
    expect(vm.recent[0].inOutLabel).toBe('1,000 in · 500 out');
  });

  it('reports no activity when there are no events', () => {
    const vm = buildPanelViewModel({
      sessionTotals: totals({}),
      todayTotals: totals({}),
      todayBreakdown: [],
      recentEvents: [],
      currency: 'USD',
      usdToInrRate: 83,
    });
    expect(vm.hasActivity).toBe(false);
  });
});
