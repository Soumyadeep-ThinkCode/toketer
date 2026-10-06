/**
 * Currency + locale formatting.
 *
 * Toketer keeps all costs internally in US dollars (the base currency used by model
 * pricing) and converts to the user's display currency only at render time.
 * Everything here is pure so it can be unit-tested without the editor.
 */

/** Display currencies Toketer supports today. */
export type Currency = 'USD' | 'INR';

/** The value of the `toketer.currency` setting. */
export type CurrencySetting = 'auto' | Currency;

/**
 * Decide which display currency to use.
 *
 * When the setting is `auto`, we infer from the editor locale: Indian locales
 * (e.g. `hi`, `en-IN`) map to INR, everything else to USD. An explicit setting
 * always wins.
 *
 * @param setting The `toketer.currency` setting value.
 * @param locale The editor UI locale (e.g. from `vscode.env.language`).
 */
export function resolveCurrency(setting: CurrencySetting, locale: string): Currency {
  if (setting === 'USD' || setting === 'INR') {
    return setting;
  }
  const normalised = locale.toLowerCase();
  const looksIndian = normalised === 'hi' || /(^hi[-_])|([-_]in)$/.test(normalised);
  return looksIndian ? 'INR' : 'USD';
}

/**
 * Convert a US-dollar amount into the target currency.
 * @param usd Amount in US dollars.
 * @param currency Target currency.
 * @param usdToInrRate Exchange rate used for INR (ignored for USD).
 */
export function convertFromUsd(usd: number, currency: Currency, usdToInrRate: number): number {
  return currency === 'INR' ? usd * usdToInrRate : usd;
}

/**
 * Pick a sensible number of fraction digits so tiny amounts stay readable.
 * Amounts at or above 1 use 2 digits; smaller amounts use up to 4 so a
 * fraction-of-a-cent prompt does not round down to zero.
 */
function fractionDigitsFor(value: number): { min: number; max: number } {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && magnitude < 1) {
    return { min: 2, max: 4 };
  }
  return { min: 2, max: 2 };
}

/**
 * Format a US-dollar amount as a localized currency string, e.g. `$0.15` or
 * `₹12.40`.
 *
 * @param usd Amount in US dollars.
 * @param currency Target display currency.
 * @param usdToInrRate Exchange rate used when converting to INR.
 * @returns A ready-to-display string including the currency symbol.
 */
export function formatMoney(usd: number, currency: Currency, usdToInrRate: number): string {
  const value = convertFromUsd(usd, currency, usdToInrRate);
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const { min, max } = fractionDigitsFor(value);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(value);
}

/**
 * Format a token count with thousands separators, e.g. `1,250`.
 * @param tokens A token count.
 */
export function formatTokens(tokens: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(tokens)));
}

/** Compact a number using a `k` suffix for thousands, e.g. 1500 → `1.5k`. */
function compactTokens(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1000) {
    const k = Math.round(v / 100) / 10; // one decimal, e.g. 1.5
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${v}`;
}

/**
 * Format a plausible range around a token *guess*, e.g. `~1k–3k`. Used for
 * estimated sources (like Copilot) where the exact token count is unknowable, so
 * a single precise-looking number would be misleading.
 *
 * @param tokens The midpoint token guess.
 * @returns A compact, clearly-approximate range string.
 */
export function formatTokenRange(tokens: number): string {
  const mid = Math.max(1, Math.round(tokens));
  const low = Math.round(mid * 0.5);
  const high = Math.round(mid * 1.5);
  return `~${compactTokens(low)}–${compactTokens(high)}`;
}
