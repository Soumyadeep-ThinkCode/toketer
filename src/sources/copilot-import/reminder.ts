import type { KeyValueStore } from '../../store/activity-store';

/**
 * Tracks when the Copilot usage report was last imported and decides when to
 * show a gentle, infrequent reminder to import again. The decision logic is pure
 * and unit-tested; only the small get/set helpers touch storage.
 */

/** globalState keys for the last successful import and the last reminder shown. */
const LAST_IMPORT_KEY = 'toketer.copilot.lastImportMs.v1';
const LAST_IMPORT_COUNT_KEY = 'toketer.copilot.lastImportCount.v1';
const LAST_REMINDER_KEY = 'toketer.copilot.lastReminderMs.v1';

/** How long after an import before we consider the data stale / remind again. */
export const IMPORT_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** A snapshot of the last import, for display and reminder decisions. */
export interface LastImport {
  readonly whenMs: number;
  readonly count: number;
}

/** Read the last-import snapshot from storage. */
export function getLastImport(storage: KeyValueStore): LastImport {
  return {
    whenMs: storage.get<number>(LAST_IMPORT_KEY, 0),
    count: storage.get<number>(LAST_IMPORT_COUNT_KEY, 0),
  };
}

/** Record that an import just happened (with how many records it covered). */
export async function setLastImport(
  storage: KeyValueStore,
  whenMs: number,
  count: number,
): Promise<void> {
  await storage.update(LAST_IMPORT_KEY, whenMs);
  await storage.update(LAST_IMPORT_COUNT_KEY, count);
}

/** Read when the reminder was last shown. */
export function getLastReminder(storage: KeyValueStore): number {
  return storage.get<number>(LAST_REMINDER_KEY, 0);
}

/** Record that the reminder was just shown. */
export async function setLastReminder(storage: KeyValueStore, whenMs: number): Promise<void> {
  await storage.update(LAST_REMINDER_KEY, whenMs);
}

/**
 * Decide whether to show a periodic "import your Copilot usage again" reminder.
 *
 * Rules (deliberately gentle, never naggy):
 *  - only remind people who have imported at least once (new users are covered
 *    by the one-time welcome notice, so we don't pester non-Copilot users),
 *  - only when that import is older than {@link IMPORT_REMINDER_INTERVAL_MS}, and
 *  - at most once per interval.
 *
 * @param lastImportMs When the user last imported (0 = never).
 * @param lastReminderMs When a reminder was last shown (0 = never).
 * @param nowMs Current time.
 */
export function shouldRemindImport(
  lastImportMs: number,
  lastReminderMs: number,
  nowMs: number,
): boolean {
  if (lastImportMs <= 0) {
    return false;
  }
  const importIsStale = nowMs - lastImportMs >= IMPORT_REMINDER_INTERVAL_MS;
  const reminderCooldownPassed = nowMs - lastReminderMs >= IMPORT_REMINDER_INTERVAL_MS;
  return importIsStale && reminderCooldownPassed;
}

/**
 * Build a short, friendly description of the last import for the Sources panel.
 * @param last The last-import snapshot.
 * @param nowMs Current time.
 */
export function describeLastImport(last: LastImport, nowMs: number): string {
  if (last.whenMs <= 0) {
    return 'Not imported yet — click to import your exact Copilot cost from GitHub billing.';
  }
  const days = Math.floor((nowMs - last.whenMs) / (24 * 60 * 60 * 1000));
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `Last imported ${when} (${last.count} records). Re-import anytime to update.`;
}
