import { describe, expect, it } from 'vitest';
import { computeCostUsd, findPricingEntry } from './pricing';
import { createDefaultPricingTable, FALLBACK_PRICING } from './pricing-table';

const table = createDefaultPricingTable(0);

describe('findPricingEntry', () => {
  it('matches an exact model id case-insensitively', () => {
    expect(findPricingEntry(table, 'GPT-4o').modelId).toBe('gpt-4o');
  });

  it('matches a dated/suffixed label via longest substring', () => {
    expect(findPricingEntry(table, 'gpt-4o-2024-08-06').modelId).toBe('gpt-4o');
  });

  it('prefers the most specific partial match', () => {
    // "gpt-4o-mini" contains both "gpt-4" and "gpt-4o-mini"; the longer wins.
    expect(findPricingEntry(table, 'gpt-4o-mini').modelId).toBe('gpt-4o-mini');
  });

  it('strips a vendor prefix via substring matching', () => {
    expect(findPricingEntry(table, 'anthropic/claude-3-5-sonnet').modelId).toBe(
      'claude-3-5-sonnet',
    );
  });

  it('falls back for unknown models', () => {
    expect(findPricingEntry(table, 'totally-made-up')).toBe(FALLBACK_PRICING);
  });

  it('falls back for empty input', () => {
    expect(findPricingEntry(table, '   ')).toBe(FALLBACK_PRICING);
  });
});

describe('computeCostUsd', () => {
  it('computes input + output cost from the per-1k prices', () => {
    // gpt-4o: 0.005 in, 0.015 out. 1000 in + 1000 out = 0.005 + 0.015 = 0.02.
    expect(computeCostUsd(table, 'gpt-4o', 1000, 1000)).toBeCloseTo(0.02, 10);
  });

  it('scales linearly with token counts', () => {
    expect(computeCostUsd(table, 'gpt-4o', 500, 0)).toBeCloseTo(0.0025, 10);
    expect(computeCostUsd(table, 'gpt-4o', 0, 2000)).toBeCloseTo(0.03, 10);
  });

  it('clamps negative token counts to zero', () => {
    expect(computeCostUsd(table, 'gpt-4o', -100, -100)).toBe(0);
  });

  it('uses the fallback price for unknown models', () => {
    const expected =
      (1000 / 1000) * FALLBACK_PRICING.inputPer1kUsd +
      (1000 / 1000) * FALLBACK_PRICING.outputPer1kUsd;
    expect(computeCostUsd(table, 'mystery', 1000, 1000)).toBeCloseTo(expected, 10);
  });
});
