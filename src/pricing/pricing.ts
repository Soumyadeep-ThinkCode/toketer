import { FALLBACK_PRICING, type PricingEntry, type PricingTable } from './pricing-table';

/**
 * Normalise a model label for lookup: lower-case and trimmed. This lets us match
 * `GPT-4o` and `gpt-4o` to the same entry without duplicating table rows.
 */
function normaliseModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

/**
 * Find the best pricing entry for a model label.
 *
 * Matching is intentionally forgiving because editors report model labels in
 * many shapes (`gpt-4o-2024-08-06`, `anthropic/claude-3-5-sonnet`, …):
 *   1. exact match on the normalised label, then
 *   2. the longest table entry whose id is a substring of the label.
 * If nothing matches, {@link FALLBACK_PRICING} is returned so cost is never
 * silently zero for an unknown model.
 *
 * @param table The active pricing table.
 * @param modelId The model label reported by the editor/attribution layer.
 */
export function findPricingEntry(table: PricingTable, modelId: string): PricingEntry {
  const needle = normaliseModelId(modelId);
  if (needle.length === 0) {
    return FALLBACK_PRICING;
  }

  const exact = table.entries.find((entry) => normaliseModelId(entry.modelId) === needle);
  if (exact) {
    return exact;
  }

  // Fall back to the most specific (longest) partial match.
  let best: PricingEntry | undefined;
  for (const entry of table.entries) {
    const id = normaliseModelId(entry.modelId);
    if (needle.includes(id) && (!best || id.length > best.modelId.length)) {
      best = entry;
    }
  }

  return best ?? FALLBACK_PRICING;
}

/**
 * Compute the US-dollar cost of a single interaction from its token counts.
 *
 * Cost is `(promptTokens / 1000) * inputPrice + (completionTokens / 1000) * outputPrice`.
 * Token counts are clamped to be non-negative so malformed input can never
 * produce a negative cost.
 *
 * @param table The active pricing table.
 * @param modelId The model label to price against.
 * @param promptTokens Number of input tokens (negative values treated as 0).
 * @param completionTokens Number of output tokens (negative values treated as 0).
 * @returns The estimated cost in US dollars.
 */
export function computeCostUsd(
  table: PricingTable,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const entry = findPricingEntry(table, modelId);
  const inTokens = Math.max(0, promptTokens);
  const outTokens = Math.max(0, completionTokens);
  const inputCost = (inTokens / 1000) * entry.inputPer1kUsd;
  const outputCost = (outTokens / 1000) * entry.outputPer1kUsd;
  return inputCost + outputCost;
}
