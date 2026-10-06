import { describe, expect, it } from 'vitest';
import { detectSurfaceFromAppName, detectVendor, normaliseModelLabel } from './mappers';

describe('detectVendor', () => {
  it('maps OpenAI models', () => {
    expect(detectVendor('gpt-4o')).toBe('openai');
    expect(detectVendor('o1-mini')).toBe('openai');
  });

  it('maps Anthropic models', () => {
    expect(detectVendor('claude-3-5-sonnet')).toBe('anthropic');
  });

  it('maps Google, Meta, Mistral and xAI models', () => {
    expect(detectVendor('gemini-1.5-pro')).toBe('google');
    expect(detectVendor('llama-3-70b')).toBe('meta');
    expect(detectVendor('mistral-large')).toBe('mistral');
    expect(detectVendor('grok-2')).toBe('xai');
  });

  it('returns unknown for unrecognised labels', () => {
    expect(detectVendor('some-local-model')).toBe('unknown');
  });
});

describe('detectSurfaceFromAppName', () => {
  it('detects Cursor', () => {
    expect(detectSurfaceFromAppName('Cursor')).toBe('cursor');
  });

  it('detects VS Code and VSCodium', () => {
    expect(detectSurfaceFromAppName('Visual Studio Code')).toBe('vscode');
    expect(detectSurfaceFromAppName('VSCodium')).toBe('vscode');
  });

  it('returns unknown for anything else', () => {
    expect(detectSurfaceFromAppName('Some Editor')).toBe('unknown');
  });
});

describe('normaliseModelLabel', () => {
  it('strips a vendor prefix', () => {
    expect(normaliseModelLabel('anthropic/claude-3-opus')).toBe('claude-3-opus');
  });

  it('trims whitespace', () => {
    expect(normaliseModelLabel('  gpt-4o  ')).toBe('gpt-4o');
  });

  it('returns unknown for empty input', () => {
    expect(normaliseModelLabel('   ')).toBe('unknown');
  });
});
