import { describe, expect, it } from 'vitest';
import { SeenStore } from './seen-store';
import type { KeyValueStore } from '../store/activity-store';

/** A tiny in-memory KeyValueStore for tests. */
function fakeStorage(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get<T>(key: string, defaultValue: T): T {
      return data.has(key) ? (data.get(key) as T) : defaultValue;
    },
    update(key: string, value: unknown): Thenable<void> {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

describe('SeenStore', () => {
  it('reports unseen keys as not present', () => {
    const store = new SeenStore(fakeStorage(), 'claudeCode');
    expect(store.has('a')).toBe(false);
  });

  it('remembers added keys', () => {
    const store = new SeenStore(fakeStorage(), 'claudeCode');
    store.add('a');
    expect(store.has('a')).toBe(true);
    expect(store.has('b')).toBe(false);
  });

  it('persists and reloads across instances', async () => {
    const storage = fakeStorage();
    const first = new SeenStore(storage, 'copilotImport');
    first.add('x');
    first.add('y');
    await first.persist();

    const second = new SeenStore(storage, 'copilotImport');
    expect(second.has('x')).toBe(true);
    expect(second.has('y')).toBe(true);
  });

  it('namespaces keys per source', async () => {
    const storage = fakeStorage();
    const claude = new SeenStore(storage, 'claudeCode');
    claude.add('shared');
    await claude.persist();

    const copilot = new SeenStore(storage, 'copilotImport');
    expect(copilot.has('shared')).toBe(false);
  });
});
