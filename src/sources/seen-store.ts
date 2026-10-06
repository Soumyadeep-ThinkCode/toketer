import type { KeyValueStore } from '../store/activity-store';

/** Maximum number of record keys remembered per source (bounds growth). */
const MAX_KEYS = 20_000;

/**
 * Remembers which source records have already been ingested, so re-scanning a
 * log file or re-importing a report never double-counts.
 *
 * Keys are short, opaque identifiers (e.g. a Claude Code `message.id` or a hash
 * of a CSV row) — never user content. The set is persisted via the injected
 * {@link KeyValueStore} (VS Code `globalState` in production) and bounded so it
 * cannot grow without limit.
 */
export class SeenStore {
  private readonly seen: Set<string>;
  private readonly storageKey: string;

  /**
   * @param storage Persistence backend (e.g. `context.globalState`).
   * @param sourceId Source id used to namespace this store's key.
   */
  constructor(
    private readonly storage: KeyValueStore,
    sourceId: string,
  ) {
    this.storageKey = `toketer.sources.seen.${sourceId}.v1`;
    this.seen = new Set(storage.get<string[]>(this.storageKey, []));
  }

  /**
   * Whether a record key has already been ingested.
   * @param key The record key to check.
   */
  has(key: string): boolean {
    return this.seen.has(key);
  }

  /**
   * Mark a record key as ingested. Does not persist on its own — call
   * {@link persist} after a batch to write once.
   * @param key The record key to remember.
   */
  add(key: string): void {
    this.seen.add(key);
  }

  /** Persist the current set, trimming the oldest keys past the size cap. */
  async persist(): Promise<void> {
    let keys = Array.from(this.seen);
    if (keys.length > MAX_KEYS) {
      keys = keys.slice(keys.length - MAX_KEYS);
      this.seen.clear();
      for (const key of keys) {
        this.seen.add(key);
      }
    }
    await this.storage.update(this.storageKey, keys);
  }
}
