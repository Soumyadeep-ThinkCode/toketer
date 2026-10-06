import { describe, expect, it } from 'vitest';
import { renderPromptFooter } from './cost-footer';

const base = {
  promptTokens: 1000,
  completionTokens: 500,
  costUsd: 0.02,
  modelId: 'claude-opus-4.8',
  isEstimate: false,
  sessionCostUsd: 0.1,
  todayCostUsd: 0.5,
  currency: 'USD' as const,
  usdToInrRate: 83,
};

describe('renderPromptFooter', () => {
  it('shows this-prompt cost, token split, and totals', () => {
    const footer = renderPromptFooter(base);
    expect(footer).toContain('$0.02');
    expect(footer).toContain('1,500 tokens');
    expect(footer).toContain('1,000 in');
    expect(footer).toContain('500 out');
    expect(footer).toContain('claude-opus-4.8');
    expect(footer).toContain('**Session** $0.10');
    expect(footer).toContain('**Today** $0.50');
  });

  it('includes a context-window gauge when a max is known', () => {
    const footer = renderPromptFooter({ ...base, contextMaxTokens: 200000 });
    expect(footer).toContain('context');
    expect(footer).toContain('200,000');
  });

  it('omits the context gauge when no max is provided', () => {
    expect(renderPromptFooter(base)).not.toContain('context');
  });

  it('marks estimates with a tilde and a note', () => {
    const footer = renderPromptFooter({ ...base, isEstimate: true });
    expect(footer).toContain('~$0.02');
    expect(footer).toContain('estimated');
  });

  it('formats INR using the exchange rate', () => {
    const footer = renderPromptFooter({ ...base, currency: 'INR' });
    // 0.02 USD * 83 = 1.66 INR
    expect(footer).toContain('₹1.66');
  });
});
