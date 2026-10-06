import { describe, expect, it } from 'vitest';
import { parseClaudeLine, parseClaudeTranscript } from './parser';

// NOTE: every sample below contains ONLY metadata (tokens, model, timestamp).
// There is deliberately no prompt/response content anywhere in these fixtures.

describe('parseClaudeLine', () => {
  it('extracts token metadata from an assistant usage line', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2024-06-08T15:01:02.123Z',
      requestId: 'req_abc',
      message: {
        id: 'msg_123',
        model: 'claude-sonnet-4-20250514',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 300,
        },
      },
    });
    const record = parseClaudeLine(line);
    expect(record).toBeDefined();
    expect(record?.key).toBe('msg_123');
    expect(record?.modelId).toBe('claude-sonnet-4-20250514');
    // prompt tokens = input + cache_creation + cache_read = 1000 + 200 + 300
    expect(record?.promptTokens).toBe(1500);
    expect(record?.completionTokens).toBe(500);
    expect(record?.isEstimate).toBe(false);
    expect(record?.timestampMs).toBe(Date.parse('2024-06-08T15:01:02.123Z'));
  });

  it('uses an explicit costUSD when present', () => {
    const line = JSON.stringify({
      message: {
        id: 'm1',
        model: 'claude-3-opus',
        usage: { input_tokens: 10, output_tokens: 5, costUSD: 0.42 },
      },
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(parseClaudeLine(line)?.costUsdOverride).toBe(0.42);
  });

  it('returns undefined for lines without a usage block', () => {
    expect(
      parseClaudeLine(JSON.stringify({ type: 'user', message: { role: 'user' } })),
    ).toBeUndefined();
  });

  it('returns undefined for zero-token usage', () => {
    const line = JSON.stringify({
      message: { id: 'm', model: 'x', usage: { input_tokens: 0, output_tokens: 0 } },
    });
    expect(parseClaudeLine(line)).toBeUndefined();
  });

  it('skips malformed JSON without throwing', () => {
    expect(parseClaudeLine('{not json')).toBeUndefined();
    expect(parseClaudeLine('')).toBeUndefined();
  });

  it('falls back to a composite key when no id is present', () => {
    const line = JSON.stringify({
      timestamp: '2024-01-01T00:00:00Z',
      message: { model: 'gpt', usage: { input_tokens: 7, output_tokens: 3 } },
    });
    const record = parseClaudeLine(line);
    expect(record?.key).toContain('gpt');
  });
});

describe('parseClaudeTranscript', () => {
  it('parses multiple lines and skips non-usage ones', () => {
    const content = [
      JSON.stringify({ type: 'user', message: {} }),
      JSON.stringify({
        message: {
          id: 'a',
          model: 'claude-3-haiku',
          usage: { input_tokens: 10, output_tokens: 20 },
        },
        timestamp: '2024-01-01T00:00:00Z',
      }),
      '',
      JSON.stringify({
        message: { id: 'b', model: 'claude-3-haiku', usage: { input_tokens: 5, output_tokens: 5 } },
        timestamp: '2024-01-01T00:01:00Z',
      }),
    ].join('\n');

    const records = parseClaudeTranscript(content);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.key)).toEqual(['a', 'b']);
  });
});
