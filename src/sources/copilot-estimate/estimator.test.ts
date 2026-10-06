import { describe, expect, it } from 'vitest';
import {
  buildEstimateRecord,
  estimateTokens,
  isIgnoredPath,
  isSignificantChange,
  SIGNIFICANT_CHANGE_CHARS,
} from './estimator';

describe('isSignificantChange', () => {
  it('counts multi-character chunk edits (agent/paste)', () => {
    expect(isSignificantChange(SIGNIFICANT_CHANGE_CHARS, 0)).toBe(true);
    expect(isSignificantChange(0, 30)).toBe(true); // a deletion (remove nodemon line)
    expect(isSignificantChange(5, 0)).toBe(true); // a 5-char version replace
  });

  it('ignores single human keystrokes', () => {
    expect(isSignificantChange(1, 0)).toBe(false);
    expect(isSignificantChange(0, 1)).toBe(false);
  });
});

describe('estimateTokens', () => {
  it('adds a context baseline to the visible output estimate', () => {
    // BASE_CONTEXT_TOKENS (2000) + 400/4 (100) = 2100
    expect(estimateTokens(400)).toBe(2100);
  });

  it('returns the baseline for a tiny edit', () => {
    expect(estimateTokens(0)).toBe(2000);
  });
});

describe('isIgnoredPath', () => {
  it('ignores dependency, build, and VCS folders', () => {
    expect(isIgnoredPath('/project/node_modules/foo/index.js')).toBe(true);
    expect(isIgnoredPath('/project/dist/bundle.js')).toBe(true);
    expect(isIgnoredPath('/project/.git/HEAD')).toBe(true);
  });

  it('ignores machine-generated lock files', () => {
    expect(isIgnoredPath('/project/package-lock.json')).toBe(true);
  });

  it('allows normal source files', () => {
    expect(isIgnoredPath('/project/src/app.ts')).toBe(false);
    expect(isIgnoredPath('/project/package.json')).toBe(false);
  });

  it('handles Windows-style backslash paths', () => {
    expect(isIgnoredPath('C:\\repo\\node_modules\\x.js')).toBe(true);
  });
});

describe('buildEstimateRecord', () => {
  it('builds a metadata-only, clearly-estimated per-request record', () => {
    const record = buildEstimateRecord(800, 0.04, 1_700_000_000_000, () => 'abc');
    expect(record.key).toBe('copilot-estimate:abc');
    expect(record.modelId).toBe('copilot (estimated)');
    expect(record.promptTokens).toBe(0);
    // 2000 baseline + 800/4 (200) = 2200
    expect(record.completionTokens).toBe(2200);
    expect(record.isEstimate).toBe(true);
    expect(record.costUsdOverride).toBe(0.04);
    expect(record.timestampMs).toBe(1_700_000_000_000);
  });

  it('prices per request regardless of edit size (tiny edits still count)', () => {
    const tiny = buildEstimateRecord(5, 0.04, 1, () => 'x');
    expect(tiny.costUsdOverride).toBe(0.04);
  });
});
