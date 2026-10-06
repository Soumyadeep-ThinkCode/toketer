import { describe, expect, it } from 'vitest';
import { describeLastImport, IMPORT_REMINDER_INTERVAL_MS, shouldRemindImport } from './reminder';

const DAY = 24 * 60 * 60 * 1000;

describe('shouldRemindImport', () => {
  it('never reminds a user who has never imported', () => {
    expect(shouldRemindImport(0, 0, Date.now())).toBe(false);
  });

  it('reminds when the last import is older than the interval', () => {
    const now = 100 * DAY;
    const lastImport = now - IMPORT_REMINDER_INTERVAL_MS - DAY;
    expect(shouldRemindImport(lastImport, 0, now)).toBe(true);
  });

  it('does not remind when the import is still recent', () => {
    const now = 100 * DAY;
    expect(shouldRemindImport(now - DAY, 0, now)).toBe(false);
  });

  it('respects the reminder cooldown', () => {
    const now = 100 * DAY;
    const lastImport = now - IMPORT_REMINDER_INTERVAL_MS - DAY;
    const recentReminder = now - DAY;
    expect(shouldRemindImport(lastImport, recentReminder, now)).toBe(false);
  });
});

describe('describeLastImport', () => {
  it('invites a first import when never imported', () => {
    expect(describeLastImport({ whenMs: 0, count: 0 }, Date.now())).toContain('Not imported yet');
  });

  it('describes a recent import in plain language', () => {
    const now = 100 * DAY;
    expect(describeLastImport({ whenMs: now, count: 12 }, now)).toContain('today');
    expect(describeLastImport({ whenMs: now - DAY, count: 12 }, now)).toContain('yesterday');
    expect(describeLastImport({ whenMs: now - 5 * DAY, count: 12 }, now)).toContain('5 days ago');
  });
});
