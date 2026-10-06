import type { AgentVendor } from '../model/activity';

/**
 * Price of a single model, expressed in US dollars per 1,000 tokens.
 * Input (prompt) and output (completion) tokens are usually priced differently.
 */
export interface PricingEntry {
  /** Lower-case model label this entry applies to, e.g. `gpt-4o`. */
  readonly modelId: string;
  /** Vendor label, used for grouping in the UI. */
  readonly vendor: AgentVendor;
  /** US dollars charged per 1,000 input (prompt) tokens. */
  readonly inputPer1kUsd: number;
  /** US dollars charged per 1,000 output (completion) tokens. */
  readonly outputPer1kUsd: number;
}

/**
 * A complete pricing table plus the time it was produced. The whole table can
 * be refreshed from the Toketer API, but the bundled defaults below always work
 * fully offline so the free solo experience never needs a backend.
 */
export interface PricingTable {
  /** Unix epoch milliseconds when this table was created/fetched. */
  readonly updatedAtMs: number;
  /** All known model prices. */
  readonly entries: readonly PricingEntry[];
}

/**
 * Bundled, offline-first pricing. Figures are public list prices (USD per 1K
 * tokens) and are approximate — they exist so the meter shows a sensible number
 * with no network and no configuration. They can be refreshed from the Toketer API.
 *
 * Keep this list short and readable; add models as needed in PRs.
 */
export const DEFAULT_PRICING_ENTRIES: readonly PricingEntry[] = [
  // OpenAI
  { modelId: 'gpt-4o', vendor: 'openai', inputPer1kUsd: 0.005, outputPer1kUsd: 0.015 },
  { modelId: 'gpt-4o-mini', vendor: 'openai', inputPer1kUsd: 0.00015, outputPer1kUsd: 0.0006 },
  { modelId: 'gpt-4-turbo', vendor: 'openai', inputPer1kUsd: 0.01, outputPer1kUsd: 0.03 },
  { modelId: 'gpt-4', vendor: 'openai', inputPer1kUsd: 0.03, outputPer1kUsd: 0.06 },
  { modelId: 'gpt-3.5-turbo', vendor: 'openai', inputPer1kUsd: 0.0005, outputPer1kUsd: 0.0015 },
  { modelId: 'o1', vendor: 'openai', inputPer1kUsd: 0.015, outputPer1kUsd: 0.06 },
  { modelId: 'o1-mini', vendor: 'openai', inputPer1kUsd: 0.003, outputPer1kUsd: 0.012 },

  // Anthropic
  {
    modelId: 'claude-3-5-sonnet',
    vendor: 'anthropic',
    inputPer1kUsd: 0.003,
    outputPer1kUsd: 0.015,
  },
  { modelId: 'claude-3-opus', vendor: 'anthropic', inputPer1kUsd: 0.015, outputPer1kUsd: 0.075 },
  { modelId: 'claude-3-sonnet', vendor: 'anthropic', inputPer1kUsd: 0.003, outputPer1kUsd: 0.015 },
  {
    modelId: 'claude-3-haiku',
    vendor: 'anthropic',
    inputPer1kUsd: 0.00025,
    outputPer1kUsd: 0.00125,
  },

  // Google
  { modelId: 'gemini-1.5-pro', vendor: 'google', inputPer1kUsd: 0.00125, outputPer1kUsd: 0.005 },
  {
    modelId: 'gemini-1.5-flash',
    vendor: 'google',
    inputPer1kUsd: 0.000075,
    outputPer1kUsd: 0.0003,
  },
];

/**
 * Fallback price used when a model is unknown. Chosen as a modest mid-range
 * value so unknown models still produce a believable (and clearly estimated)
 * cost rather than zero.
 */
export const FALLBACK_PRICING: PricingEntry = {
  modelId: 'unknown',
  vendor: 'unknown',
  inputPer1kUsd: 0.005,
  outputPer1kUsd: 0.015,
};

/**
 * Build the default, offline pricing table bundled with the extension.
 * @param now Current time in epoch ms (injectable for deterministic tests).
 */
export function createDefaultPricingTable(now: number = Date.now()): PricingTable {
  return { updatedAtMs: now, entries: DEFAULT_PRICING_ENTRIES };
}
