import type { RawActivityInput } from '../attribution/event-builder';

/**
 * Shared types for Toketer's automatic input sources.
 *
 * A *source* is anything that discovers AI usage on the user's machine and feeds
 * it into the existing `recordAiActivity` pipeline. Sources only ever produce
 * {@link CapturedRecord}s — token counts, model labels, timestamps, and (when a
 * source bills by cost rather than tokens) an exact cost. By construction there
 * is nowhere to put prompt text, completion text, code, or diffs.
 */

/**
 * A single usage record captured from a source, reduced to metadata only.
 *
 * This is the one shape every parser emits. It maps directly onto the existing
 * {@link RawActivityInput} the meter already understands.
 */
export interface CapturedRecord {
  /**
   * Stable, source-unique key used to avoid recording the same interaction
   * twice (e.g. a Claude Code `message.id`, or a hash of a Copilot CSV row).
   * Never contains user content.
   */
  readonly key: string;

  /** Model label, e.g. `claude-sonnet-4` or `gpt-4o`. */
  readonly modelId: string;

  /** Input (prompt) token count. Use 0 when the source does not report tokens. */
  readonly promptTokens: number;

  /** Output (completion) token count. Use 0 when the source does not report tokens. */
  readonly completionTokens: number;

  /** When the interaction actually happened, in epoch milliseconds. */
  readonly timestampMs: number;

  /** Whether these figures are an estimate rather than exact. */
  readonly isEstimate: boolean;

  /**
   * Exact cost in US dollars, when the source reports cost directly instead of
   * tokens (e.g. the GitHub Copilot usage report). When omitted, cost is
   * computed from the token counts by the existing pricing logic.
   */
  readonly costUsdOverride?: number;
}

/**
 * Convert a {@link CapturedRecord} into the exact shape the existing ingestion
 * pipeline accepts. Pure and tiny so the mapping is obvious to contributors.
 *
 * @param record The metadata-only record emitted by a source parser.
 * @returns The `RawActivityInput` to pass to `recordAiActivity`.
 */
export function toActivityInput(record: CapturedRecord): RawActivityInput {
  return {
    modelId: record.modelId,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    isEstimate: record.isEstimate,
    timestampMs: record.timestampMs,
    costUsdOverride: record.costUsdOverride,
  };
}

/** High-level state of a source, used to drive the friendly diagnostics panel. */
export type SourceStatus =
  | 'tracking' // actively watching and recording (e.g. Claude Code detected)
  | 'available' // present but needs a one-click action (e.g. Copilot import)
  | 'not-detected' // the source could not be found on this machine
  | 'disabled' // the user turned this source off in settings
  | 'error'; // something went wrong (shown as a gentle diagnostic, never a crash)

/** A plain-language snapshot of one source for the diagnostics panel. */
export interface SourceState {
  /** Stable source id, e.g. `claudeCode`. */
  readonly id: string;
  /** Friendly name shown to the user, e.g. `Claude Code`. */
  readonly label: string;
  /** Current status driving the icon/colour. */
  readonly status: SourceStatus;
  /** One short, jargon-free sentence describing what's happening. */
  readonly detail: string;
  /**
   * Optional one-click action the panel can offer (a command id + button
   * label), e.g. importing a Copilot usage report.
   */
  readonly action?: { readonly commandId: string; readonly label: string };
}
