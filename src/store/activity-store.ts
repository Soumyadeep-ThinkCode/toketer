import type { AiActivityEvent } from '../model/activity';
import { filterToday, sumTotals } from './aggregation';
import type { Totals } from '../model/activity';

/**
 * Minimal key/value persistence abstraction. `vscode.Memento` (globalState)
 * satisfies this interface, but depending on the interface instead of the
 * concrete editor type keeps the store unit-testable.
 */
export interface KeyValueStore {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

/** Storage key under which the event list is persisted. */
const STORAGE_KEY = 'toketer.activityEvents.v1';

/** Maximum number of events we keep. Old events are dropped first. */
const MAX_EVENTS = 500;

/**
 * In-memory + persisted store of metadata-only activity events.
 *
 * The store is the single source of truth the meter and panel read from. It
 * notifies listeners whenever the data changes so the UI can refresh live.
 */
export class ActivityStore {
  private events: AiActivityEvent[];
  private readonly sessionStartMs: number;
  private readonly listeners = new Set<() => void>();

  /**
   * @param storage Persistence backend (e.g. `context.globalState`).
   * @param now Clock injected for deterministic tests.
   */
  constructor(
    private readonly storage: KeyValueStore,
    private readonly now: () => number = Date.now,
  ) {
    this.events = storage.get<AiActivityEvent[]>(STORAGE_KEY, []);
    this.sessionStartMs = this.now();
  }

  /**
   * Subscribe to change notifications.
   * @param listener Called after every mutation.
   * @returns A disposer that removes the listener.
   */
  onDidChange(listener: () => void): { dispose: () => void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /**
   * Append a new event, enforce the size cap, persist, and notify listeners.
   * @param event The metadata-only event to record.
   */
  add(event: AiActivityEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(this.events.length - MAX_EVENTS);
    }
    void this.storage.update(STORAGE_KEY, this.events);
    this.emitChange();
  }

  /** All stored events, oldest first. */
  getAll(): readonly AiActivityEvent[] {
    return this.events;
  }

  /**
   * The most recent events, newest first.
   * @param limit Maximum number to return.
   */
  getRecent(limit: number): AiActivityEvent[] {
    return this.events.slice(-limit).reverse();
  }

  /** Events recorded during the current editor session (this activation). */
  getSessionEvents(): AiActivityEvent[] {
    return this.events.filter((event) => event.timestampMs >= this.sessionStartMs);
  }

  /** Events recorded today (local calendar day). */
  getTodayEvents(): AiActivityEvent[] {
    return filterToday(this.events, this.now());
  }

  /** Totals for the current session. */
  getSessionTotals(): Totals {
    return sumTotals(this.getSessionEvents());
  }

  /** Totals for today. */
  getTodayTotals(): Totals {
    return sumTotals(this.getTodayEvents());
  }

  /** Remove all stored events and notify listeners. */
  clear(): void {
    this.events = [];
    void this.storage.update(STORAGE_KEY, this.events);
    this.emitChange();
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
