import * as vscode from 'vscode';
import type { ActivitySink, SourceAdapter } from '../source-adapter';
import type { SourceState, SourceStatus } from '../captured-record';
import type { KeyValueStore } from '../../store/activity-store';
import { SeenStore } from '../seen-store';
import { parseClaudeTranscript } from './parser';
import { claudeProjectDirCandidates, firstExistingDir } from './locations';

/** How often to re-scan the logs for new usage (milliseconds). */
const POLL_INTERVAL_MS = 8_000;

/** Maximum directory depth to walk under the projects folder. */
const MAX_DEPTH = 4;

/** globalState key for the baseline time (only usage after this is recorded). */
const BASELINE_KEY = 'toketer.sources.claudeCode.baselineMs.v1';

/** Configuration the adapter reads (provided by the host so it stays testable). */
export interface ClaudeCodeConfig {
  readonly enabled: boolean;
  readonly logPath: string;
}

/**
 * Automatic, zero-config source for **Claude Code**.
 *
 * It finds Claude Code's local transcript logs, watches them, and feeds each new
 * assistant turn's *token metadata* into Toketer — exactly and automatically. If the
 * logs aren't present it stays completely silent (status `not-detected`).
 *
 * Everything here is local and metadata-only: it reads just the numeric usage
 * fields via {@link parseClaudeTranscript} and never touches message content.
 */
export class ClaudeCodeSource implements SourceAdapter {
  readonly id = 'claudeCode';
  readonly label = 'Claude Code';

  private status: SourceStatus = 'not-detected';
  private detail = 'Not detected on this machine.';

  private projectsDir: vscode.Uri | undefined;
  private sink: ActivitySink | undefined;
  private readonly seen: SeenStore;
  private readonly fileMtimes = new Map<string, number>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private scanning = false;

  /**
   * @param storage Persistence backend for dedupe + baseline (globalState).
   * @param getConfig Reads the latest Claude Code settings on demand.
   * @param onStateChanged Called whenever the status/detail changes.
   */
  constructor(
    private readonly storage: KeyValueStore,
    private readonly getConfig: () => ClaudeCodeConfig,
    private readonly onStateChanged: () => void,
  ) {
    this.seen = new SeenStore(storage, this.id);
  }

  /** Begin detecting and watching logs (no-op beyond status when disabled). */
  async start(sink: ActivitySink): Promise<void> {
    this.sink = sink;

    if (!this.getConfig().enabled) {
      this.setState('disabled', 'Turned off in settings.');
      return;
    }

    this.projectsDir = await firstExistingDir(claudeProjectDirCandidates(this.getConfig().logPath));
    if (!this.projectsDir) {
      this.setState('not-detected', 'Not detected — start a Claude Code session and it appears.');
      return;
    }

    // Only record usage that happens from first detection onward, so installing
    // Toketer never dumps a big backlog of old sessions into "today".
    if (this.storage.get<number>(BASELINE_KEY, 0) === 0) {
      await this.storage.update(BASELINE_KEY, Date.now());
    }

    this.setState('tracking', 'Tracking your Claude Code usage automatically.');
    this.startWatching();
    await this.scan();
  }

  /** Current plain-language state for the diagnostics panel. */
  getState(): SourceState {
    return { id: this.id, label: this.label, status: this.status, detail: this.detail };
  }

  /** Stop watching and release timers. */
  dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.watcher?.dispose();
    this.watcher = undefined;
  }

  /** Set up the poll loop plus a best-effort file watcher for immediacy. */
  private startWatching(): void {
    this.pollTimer = setInterval(() => void this.scan(), POLL_INTERVAL_MS);

    // A watcher gives near-instant updates where supported; polling is the
    // reliable fallback, so any watcher failure is harmless.
    try {
      if (this.projectsDir) {
        const pattern = new vscode.RelativePattern(this.projectsDir, '**/*.jsonl');
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const trigger = (): void => void this.scan();
        this.watcher.onDidCreate(trigger);
        this.watcher.onDidChange(trigger);
      }
    } catch {
      // Watching outside the workspace isn't supported everywhere — rely on poll.
    }
  }

  /** Scan all transcript files and feed any new usage records. Never throws. */
  private async scan(): Promise<void> {
    if (!this.projectsDir || !this.sink || this.scanning) {
      return;
    }
    this.scanning = true;
    try {
      const baselineMs = this.storage.get<number>(BASELINE_KEY, 0);
      const files = await this.collectJsonlFiles(this.projectsDir, 0);
      let recordedAny = false;

      for (const file of files) {
        recordedAny = (await this.scanFile(file, baselineMs)) || recordedAny;
      }

      if (recordedAny) {
        await this.seen.persist();
      }
      if (this.status === 'error') {
        this.setState('tracking', 'Tracking your Claude Code usage automatically.');
      }
    } catch {
      this.setState('error', "Couldn't read Claude Code logs just now — will retry.");
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Read one file (if it changed) and feed new, post-baseline records.
   * @returns Whether any new record was recorded.
   */
  private async scanFile(file: vscode.Uri, baselineMs: number): Promise<boolean> {
    const stat = await vscode.workspace.fs.stat(file);
    const lastMtime = this.fileMtimes.get(file.toString());
    if (lastMtime !== undefined && stat.mtime <= lastMtime) {
      return false; // unchanged since last scan — skip the read entirely
    }
    this.fileMtimes.set(file.toString(), stat.mtime);

    const bytes = await vscode.workspace.fs.readFile(file);
    const text = new TextDecoder('utf-8').decode(bytes);
    const records = parseClaudeTranscript(text);

    let recordedAny = false;
    for (const record of records) {
      if (record.timestampMs < baselineMs || this.seen.has(record.key)) {
        continue;
      }
      this.seen.add(record.key);
      await this.sink?.record(record);
      recordedAny = true;
    }
    return recordedAny;
  }

  /** Recursively collect `.jsonl` files under a directory, depth-limited. */
  private async collectJsonlFiles(dir: vscode.Uri, depth: number): Promise<vscode.Uri[]> {
    if (depth > MAX_DEPTH) {
      return [];
    }
    const found: vscode.Uri[] = [];
    const entries = await vscode.workspace.fs.readDirectory(dir);
    for (const [name, type] of entries) {
      const child = vscode.Uri.joinPath(dir, name);
      if (type & vscode.FileType.Directory) {
        found.push(...(await this.collectJsonlFiles(child, depth + 1)));
      } else if (name.endsWith('.jsonl')) {
        found.push(child);
      }
    }
    return found;
  }

  /** Update status + detail and notify listeners. */
  private setState(status: SourceStatus, detail: string): void {
    this.status = status;
    this.detail = detail;
    this.onStateChanged();
  }
}
