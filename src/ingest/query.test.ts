import { describe, expect, it } from 'vitest';
import { parseActivityQuery } from './query';

describe('parseActivityQuery', () => {
  it('parses a full metadata query string', () => {
    const input = parseActivityQuery(
      '?model=gpt-4o&prompt=1200&completion=800&estimate=0&surface=cursor&repo=my-app',
    );
    expect(input).toEqual({
      modelId: 'gpt-4o',
      promptTokens: 1200,
      completionTokens: 800,
      isEstimate: false,
      ideSurface: 'cursor',
      repoName: 'my-app',
    });
  });

  it('works without a leading question mark', () => {
    const input = parseActivityQuery('model=claude-3-opus');
    expect(input?.modelId).toBe('claude-3-opus');
  });

  it('returns undefined when no model is provided', () => {
    expect(parseActivityQuery('prompt=100&completion=50')).toBeUndefined();
  });

  it('ignores invalid counts and unknown surfaces', () => {
    const input = parseActivityQuery('model=gpt-4o&prompt=-5&completion=abc&surface=emacs');
    expect(input?.promptTokens).toBeUndefined();
    expect(input?.completionTokens).toBeUndefined();
    expect(input?.ideSurface).toBeUndefined();
  });

  it('interprets truthy/falsy estimate flags', () => {
    expect(parseActivityQuery('model=x&estimate=true')?.isEstimate).toBe(true);
    expect(parseActivityQuery('model=x&estimate=no')?.isEstimate).toBe(false);
    expect(parseActivityQuery('model=x')?.isEstimate).toBeUndefined();
  });
});
