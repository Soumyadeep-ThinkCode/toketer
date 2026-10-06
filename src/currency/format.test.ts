import { describe, expect, it } from 'vitest';
import {
  convertFromUsd,
  formatMoney,
  formatTokenRange,
  formatTokens,
  resolveCurrency,
} from './format';

describe('resolveCurrency', () => {
  it('honours an explicit USD setting', () => {
    expect(resolveCurrency('USD', 'hi')).toBe('USD');
  });

  it('honours an explicit INR setting', () => {
    expect(resolveCurrency('INR', 'en-US')).toBe('INR');
  });

  it('auto-detects INR for Indian locales', () => {
    expect(resolveCurrency('auto', 'hi')).toBe('INR');
    expect(resolveCurrency('auto', 'en-IN')).toBe('INR');
  });

  it('auto-detects USD for other locales', () => {
    expect(resolveCurrency('auto', 'en-US')).toBe('USD');
    expect(resolveCurrency('auto', 'fr')).toBe('USD');
  });
});

describe('convertFromUsd', () => {
  it('returns the same value for USD', () => {
    expect(convertFromUsd(10, 'USD', 83)).toBe(10);
  });

  it('applies the exchange rate for INR', () => {
    expect(convertFromUsd(1, 'INR', 83)).toBe(83);
  });
});

describe('formatMoney', () => {
  it('formats USD with a dollar sign and two decimals', () => {
    expect(formatMoney(0.15, 'USD', 83)).toBe('$0.15');
  });

  it('formats INR with a rupee sign using the exchange rate', () => {
    // 0.15 USD * 83 = 12.45 INR.
    expect(formatMoney(0.15, 'INR', 83)).toBe('₹12.45');
  });

  it('shows extra precision for sub-unit amounts', () => {
    // 0.0005 USD should not round to $0.00.
    expect(formatMoney(0.0005, 'USD', 83)).toBe('$0.0005');
  });
});

describe('formatTokens', () => {
  it('adds thousands separators', () => {
    expect(formatTokens(1250)).toBe('1,250');
  });

  it('rounds and clamps negatives', () => {
    expect(formatTokens(-5)).toBe('0');
    expect(formatTokens(10.6)).toBe('11');
  });
});

describe('formatTokenRange', () => {
  it('shows a compact ± range around the guess', () => {
    // 2000 → low 1000 (1k), high 3000 (3k)
    expect(formatTokenRange(2000)).toBe('~1k–3k');
  });

  it('uses one decimal for non-round thousands', () => {
    // 3000 → low 1500 (1.5k), high 4500 (4.5k)
    expect(formatTokenRange(3000)).toBe('~1.5k–4.5k');
  });

  it('keeps small numbers plain', () => {
    // 100 → low 50, high 150
    expect(formatTokenRange(100)).toBe('~50–150');
  });
});
