import { describe, expect, it } from 'vitest';
import { buildActivityEvent, type EventBuilderContext } from './event-builder';
import { createDefaultPricingTable } from '../pricing/pricing-table';

function context(appName = 'Visual Studio Code'): EventBuilderContext {
  return {
    pricingTable: createDefaultPricingTable(0),
    appName,
    now: () => 1_700_000_000_000,
    newId: () => 'fixed-id',
  };
}

describe('buildActivityEvent', () => {
  it('builds a complete metadata-only event with computed cost', () => {
    const event = buildActivityEvent(
      { modelId: 'gpt-4o', promptTokens: 1000, completionTokens: 1000, isEstimate: false },
      context(),
    );

    expect(event).toMatchObject({
      id: 'fixed-id',
      timestampMs: 1_700_000_000_000,
      ideSurface: 'vscode',
      agentVendor: 'openai',
      modelId: 'gpt-4o',
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000,
      isEstimate: false,
    });
    expect(event.estimatedCostUsd).toBeCloseTo(0.02, 10);
  });

  it('defaults token counts to zero and marks estimates by default', () => {
    const event = buildActivityEvent({ modelId: 'claude-3-haiku' }, context());
    expect(event.promptTokens).toBe(0);
    expect(event.completionTokens).toBe(0);
    expect(event.totalTokens).toBe(0);
    expect(event.isEstimate).toBe(true);
  });

  it('detects the Cursor surface from the app name', () => {
    const event = buildActivityEvent({ modelId: 'gpt-4o' }, context('Cursor'));
    expect(event.ideSurface).toBe('cursor');
  });

  it('respects an explicit surface override', () => {
    const event = buildActivityEvent(
      { modelId: 'gpt-4o', ideSurface: 'cursor' },
      context('Visual Studio Code'),
    );
    expect(event.ideSurface).toBe('cursor');
  });

  it('normalises the model label and infers the vendor', () => {
    const event = buildActivityEvent({ modelId: 'anthropic/claude-3-opus' }, context());
    expect(event.modelId).toBe('claude-3-opus');
    expect(event.agentVendor).toBe('anthropic');
  });

  it('sanitises invalid token counts to zero', () => {
    const event = buildActivityEvent(
      { modelId: 'gpt-4o', promptTokens: -50, completionTokens: Number.NaN },
      context(),
    );
    expect(event.promptTokens).toBe(0);
    expect(event.completionTokens).toBe(0);
  });

  it('honours an explicit timestampMs for historical records', () => {
    const event = buildActivityEvent(
      { modelId: 'gpt-4o', timestampMs: 1_600_000_000_000 },
      context(),
    );
    expect(event.timestampMs).toBe(1_600_000_000_000);
  });

  it('falls back to now() for an invalid timestampMs', () => {
    const event = buildActivityEvent({ modelId: 'gpt-4o', timestampMs: -5 }, context());
    expect(event.timestampMs).toBe(1_700_000_000_000);
  });

  it('uses an exact costUsdOverride instead of computing from tokens', () => {
    const event = buildActivityEvent(
      { modelId: 'gpt-4o', promptTokens: 1000, completionTokens: 1000, costUsdOverride: 0.99 },
      context(),
    );
    expect(event.estimatedCostUsd).toBe(0.99);
  });

  it('ignores a negative costUsdOverride and computes from tokens', () => {
    const event = buildActivityEvent(
      { modelId: 'gpt-4o', promptTokens: 1000, completionTokens: 1000, costUsdOverride: -1 },
      context(),
    );
    expect(event.estimatedCostUsd).toBeCloseTo(0.02, 10);
  });
});
