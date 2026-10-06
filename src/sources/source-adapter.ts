import type { CapturedRecord, SourceState } from './captured-record';

/**
 * The sink a source uses to push captured usage into the rest of Toketer. It hides
 * the recorder/store behind a tiny interface so sources stay decoupled and
 * easily testable.
 */
export interface ActivitySink {
  /**
   * Record one captured usage record (metadata only). Implementations convert
   * it into the existing ingestion shape and feed the meter.
   * @param record The metadata-only record to record.
   */
  record(record: CapturedRecord): Promise<void>;
}

/**
 * A single automatic input source (Claude Code logs, Copilot import, …).
 *
 * Every source follows the same lifecycle so the registry can treat them
 * uniformly and so adding a new one is trivial for contributors:
 *   1. {@link start} — detect the source and begin watching/importing.
 *   2. {@link getState} — report a friendly status for the diagnostics panel.
 *   3. {@link dispose} — release any watchers/timers.
 *
 * Sources must FAIL GRACEFULLY: if their data is missing or in an unknown
 * format they report `not-detected`/`error` and never throw out of these
 * methods.
 */
export interface SourceAdapter {
  /** Stable id, e.g. `claudeCode`. */
  readonly id: string;

  /** Friendly name shown in the diagnostics panel. */
  readonly label: string;

  /**
   * Begin operating. For passive sources this detects logs and starts watching;
   * for on-demand sources (like Copilot import) it simply reports availability.
   * @param sink Where captured records are sent.
   */
  start(sink: ActivitySink): Promise<void>;

  /** Current plain-language state for the diagnostics panel. */
  getState(): SourceState;

  /** Release watchers/timers. Safe to call more than once. */
  dispose(): void;
}
