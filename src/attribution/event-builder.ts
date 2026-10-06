import type { AiActivityEvent, IdeSurface } from '../model/activity';
import { computeCostUsd } from '../pricing/pricing';
import type { PricingTable } from '../pricing/pricing-table';
import { detectSurfaceFromAppName, detectVendor, normaliseModelLabel } from './mappers';

/**
 * Metadata-only input used to record an AI interaction.
 *
 * This is the one and only shape external callers push into Toketer (via the public
 * command or URI handshake). By construction it can carry *only* counts and
 * labels — there is no field for prompt text, completion text, or code.
 */
export interface RawActivityInput {
  /** Model label, e.g. `gpt-4o`. Required for attribution + pricing. */
  readonly modelId: string;

  /** Input (prompt) token count. Defaults to 0 when omitted. */
  readonly promptTokens?: number;

  /** Output (completion) token count. Defaults to 0 when omitted. */
  readonly completionTokens?: number;

  /**
   * Whether these counts are an estimate. When omitted it defaults to `true`,
   * because most editor surfaces do not report exact per-prompt tokens and we
   * would rather be honestly conservative than overstate precision.
   */
  readonly isEstimate?: boolean;

  /** Optional surface override; otherwise detected from the app name. */
  readonly ideSurface?: IdeSurface;

  /** Optional repository folder *name* (never a path or contents). */
  readonly repoName?: string;

  /**
   * Optional explicit event time in epoch milliseconds. Used by sources that
   * import *historical* metadata (e.g. a Copilot billing export or Claude Code
   * logs) so each record lands on the day it actually happened. When omitted,
   * the builder uses the current time — existing callers are unaffected.
   */
  readonly timestampMs?: number;

  /**
   * Optional exact cost in US dollars, used when a source reports cost directly
   * instead of token counts (e.g. the GitHub Copilot usage report is billed per
   * request, not per token). When provided, it is used verbatim instead of
   * computing cost from tokens. Still metadata — just a number. When omitted,
   * cost is computed locally from the token counts as before.
   */
  readonly costUsdOverride?: number;
}

/**
 * Collaborators the builder needs from the host, injected so the function stays
 * pure and unit-testable.
 */
export interface EventBuilderContext {
  /** Active pricing table used to compute cost. */
  readonly pricingTable: PricingTable;
  /** The editor app name (`vscode.env.appName`) for surface detection. */
  readonly appName: string;
  /** Returns the current time in epoch ms. */
  readonly now: () => number;
  /** Returns a unique id for a new event. */
  readonly newId: () => string;
}

/** Coerce a possibly-undefined/negative count into a safe non-negative integer. */
function safeCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

/** Return a valid epoch-ms timestamp, falling back to `fallback` when invalid. */
function safeTimestamp(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

/**
 * Build a complete {@link AiActivityEvent} from metadata-only input.
 *
 * Responsibilities:
 *  - normalise the model label and infer the vendor,
 *  - detect the editor surface (unless explicitly provided),
 *  - compute token totals and the local USD cost estimate.
 *
 * @param input Metadata-only description of the interaction.
 * @param ctx Host collaborators (pricing table, clock, id generator, app name).
 * @returns A fully-populated, metadata-only activity event.
 */
export function buildActivityEvent(
  input: RawActivityInput,
  ctx: EventBuilderContext,
): AiActivityEvent {
  const modelId = normaliseModelLabel(input.modelId);
  const promptTokens = safeCount(input.promptTokens);
  const completionTokens = safeCount(input.completionTokens);
  const totalTokens = promptTokens + completionTokens;

  // Use an exact cost when the source provides one (e.g. Copilot billing),
  // otherwise compute it locally from the token counts.
  const hasValidCostOverride =
    typeof input.costUsdOverride === 'number' &&
    Number.isFinite(input.costUsdOverride) &&
    input.costUsdOverride >= 0;
  const estimatedCostUsd = hasValidCostOverride
    ? (input.costUsdOverride as number)
    : computeCostUsd(ctx.pricingTable, modelId, promptTokens, completionTokens);

  return {
    id: ctx.newId(),
    timestampMs: safeTimestamp(input.timestampMs, ctx.now()),
    ideSurface: input.ideSurface ?? detectSurfaceFromAppName(ctx.appName),
    agentVendor: detectVendor(modelId),
    modelId,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    isEstimate: input.isEstimate ?? true,
    repoName: input.repoName,
  };
}
