import { describe, expect, it } from 'vitest';
import { parseCopilotUsage } from './parser';

// Fixtures contain ONLY billing metadata (model, timestamp, requests, cost).

describe('parseCopilotUsage (CSV)', () => {
  const csv = [
    'timestamp,user,model,requests,net_amount,exceeds_quota',
    '2025-07-18T13:59:44Z,alice,gpt-4o,1,0.04,false',
    '2025-07-18T14:10:00Z,alice,claude-3-5-sonnet,2,0.10,false',
  ].join('\n');

  it('parses rows into cost-based records with zero tokens', () => {
    const records = parseCopilotUsage(csv);
    expect(records).toHaveLength(2);
    expect(records[0].modelId).toBe('gpt-4o');
    expect(records[0].costUsdOverride).toBe(0.04);
    expect(records[0].promptTokens).toBe(0);
    expect(records[0].completionTokens).toBe(0);
    expect(records[0].isEstimate).toBe(false);
    expect(records[0].timestampMs).toBe(Date.parse('2025-07-18T13:59:44Z'));
  });

  it('produces stable dedupe keys', () => {
    const a = parseCopilotUsage(csv);
    const b = parseCopilotUsage(csv);
    expect(a[0].key).toBe(b[0].key);
    expect(a[0].key).not.toBe(a[1].key);
  });

  it('handles currency symbols and quoted fields', () => {
    const quoted = ['date,model,cost', '"2025-01-01","gpt-4o","$1,234.50"'].join('\n');
    const records = parseCopilotUsage(quoted);
    expect(records).toHaveLength(1);
    expect(records[0].costUsdOverride).toBe(1234.5);
  });

  it('returns empty for a CSV missing required columns', () => {
    expect(parseCopilotUsage('user,note\nalice,hello')).toHaveLength(0);
  });
});

describe('parseCopilotUsage (JSON)', () => {
  it('parses a JSON array export', () => {
    const json = JSON.stringify([
      { timestamp: '2025-01-01T00:00:00Z', model: 'gpt-4o', requests: 1, net_amount: 0.04 },
    ]);
    const records = parseCopilotUsage(json);
    expect(records).toHaveLength(1);
    expect(records[0].modelId).toBe('gpt-4o');
    expect(records[0].costUsdOverride).toBe(0.04);
  });

  it('parses a wrapped { usage: [...] } export', () => {
    const json = JSON.stringify({
      usage: [{ date: '2025-01-01', model: 'o1', cost: 0.5 }],
    });
    const records = parseCopilotUsage(json);
    expect(records).toHaveLength(1);
    expect(records[0].modelId).toBe('o1');
  });

  it('returns empty for malformed JSON', () => {
    expect(parseCopilotUsage('[not json')).toHaveLength(0);
  });
});
