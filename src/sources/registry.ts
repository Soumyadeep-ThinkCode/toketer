import type { ActivityRecorder } from '../ingest/recorder';
import { toActivityInput, type CapturedRecord, type SourceState } from './captured-record';
import type { ActivitySink, SourceAdapter } from './source-adapter';

/**
 * Owns all automatic input sources and connects them to the existing ingestion
 * pipeline. It provides each source with an {@link ActivitySink} that converts a
 * {@link CapturedRecord} into the shape `recordAiActivity` already accepts, so
 * the meter, panel, pricing, and currency logic all work unchanged.
 */
export class SourceRegistry {
  private readonly listeners = new Set<() => void>();

  /**
   * @param adapters The sources to manage.
   * @param recorder The existing recorder every source feeds into.
   */
  constructor(
    private readonly adapters: readonly SourceAdapter[],
    private readonly recorder: ActivityRecorder,
  ) {}

  /** Start every source. Failures in one source never affect the others. */
  async startAll(): Promise<void> {
    const sink: ActivitySink = {
      record: async (record: CapturedRecord) => {
        await this.recorder.record(toActivityInput(record));
      },
    };
    await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          await adapter.start(sink);
        } catch {
          // A source that fails to start is simply reported via getState().
        }
      }),
    );
    this.emitChange();
  }

  /** Current state of every source, for the diagnostics panel. */
  getStates(): SourceState[] {
    return this.adapters.map((adapter) => adapter.getState());
  }

  /** Look up a single adapter by id (used to trigger on-demand actions). */
  getAdapter(id: string): SourceAdapter | undefined {
    return this.adapters.find((adapter) => adapter.id === id);
  }

  /**
   * Subscribe to state-change notifications (any source changing status).
   * @param listener Called after a source's state changes.
   * @returns A disposer that removes the listener.
   */
  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Called by adapters (via the callback they're given) when state changes. */
  emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Dispose every source. */
  dispose(): void {
    for (const adapter of this.adapters) {
      adapter.dispose();
    }
  }
}
