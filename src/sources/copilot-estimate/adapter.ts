import * as vscode from 'vscode';
import type { ActivitySink, SourceAdapter } from '../source-adapter';
import type { SourceState, SourceStatus } from '../captured-record';
import {
  buildEstimateRecord,
  estimateTokens,
  isIgnoredPath,
  isSignificantChange,
} from './estimator';

/**
 * How long with no edits before we treat a burst as one finished agent turn.
 *
 * GitHub bills Copilot agent mode as **one premium request per user prompt**
 * (not per tool call/step), so we want a whole prompt's rapid multi-file edits
 * to coalesce into a single request. A few seconds balances that against not
 * merging two separate prompts sent back-to-back.
 */
const TURN_SETTLE_MS = 5_000;

/** How long a file counts as "the human is editing here" after a keystroke. */
const USER_TYPING_WINDOW_MS = 12_000;

/** Nominal characters credited when we only know a file was saved (not its delta). */
const SAVE_NOMINAL_CHARS = 200;

/** Details of one estimated turn, passed to the host to announce to the user. */
export interface EstimatedTurn {
  readonly completionTokens: number;
  readonly costUsd: number;
}

/** Configuration the estimator reads (provided by the host so it stays simple). */
export interface CopilotEstimateConfig {
  readonly enabled: boolean;
  readonly pricePerRequestUsd: number;
}

/**
 * **Live GitHub Copilot estimate** source.
 *
 * It detects an agent *turn* from the file edits the agent makes, counts it as
 * one Copilot premium request, and (via {@link onTurnEstimated}) lets the host
 * announce the rough token + cost figure right after the turn finishes. It reads
 * only the *size* of each change — never content — and labels everything as an
 * estimate.
 */
export class CopilotEstimateSource implements SourceAdapter {
  readonly id = 'copilotEstimate';
  readonly label = 'GitHub Copilot (live estimate)';

  private sink: ActivitySink | undefined;
  private changeSub: vscode.Disposable | undefined;
  private saveSub: vscode.Disposable | undefined;
  private createFilesSub: vscode.Disposable | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private configSub: vscode.Disposable | undefined;
  private turnChars = 0;
  private turnTimer: ReturnType<typeof setTimeout> | undefined;
  /** Files the human was recently *typing* in (so their saves aren't counted). */
  private readonly userTyping = new Map<string, number>();

  /**
   * @param getConfig Reads the latest estimate settings on demand.
   * @param onStateChanged Called whenever the status/detail changes.
   * @param onTurnEstimated Called after each estimated turn so the host can show it.
   * @param log Diagnostic logger (sizes/counts only — never paths or content).
   */
  constructor(
    private readonly getConfig: () => CopilotEstimateConfig,
    private readonly onStateChanged: () => void,
    private readonly onTurnEstimated: (turn: EstimatedTurn) => void = () => {},
    private readonly log: (message: string) => void = () => {},
  ) {}

  /** Remember the sink and begin honouring the enabled setting (live). */
  async start(sink: ActivitySink): Promise<void> {
    this.sink = sink;
    this.applyEnabledState();
    this.configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('toketer.sources.copilotEstimate')) {
        this.applyEnabledState();
      }
    });
  }

  /** Current plain-language state for the diagnostics panel. */
  getState(): SourceState {
    const enabled = this.getConfig().enabled;
    const status: SourceStatus = enabled ? 'tracking' : 'disabled';
    const detail = enabled
      ? 'Live estimate from agent edits (approximate — Copilot tokens aren\u2019t exposed). Import for exact.'
      : 'Off. Turn on a clearly-labelled live estimate, or use import for exact figures.';
    return { id: this.id, label: this.label, status, detail };
  }

  /** Stop watching and clear timers. */
  dispose(): void {
    this.stopWatching();
    this.configSub?.dispose();
    this.configSub = undefined;
  }

  /** Start or stop the watchers to match the current setting. */
  private applyEnabledState(): void {
    if (this.getConfig().enabled) {
      if (!this.changeSub) {
        this.changeSub = vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e));
      }
      if (!this.saveSub) {
        this.saveSub = vscode.workspace.onDidSaveTextDocument((doc) => this.onDocSaved(doc));
      }
      if (!this.createFilesSub) {
        this.createFilesSub = vscode.workspace.onDidCreateFiles((e) => {
          for (const uri of e.files) {
            void this.onFileCreated(uri);
          }
        });
      }
      if (!this.fileWatcher) {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.fileWatcher.onDidCreate((uri) => void this.onFileCreated(uri));
        // Disk-level change detection catches agent edits to existing files that
        // aren't open in an editor (so no text-change/save event fires).
        this.fileWatcher.onDidChange((uri) => this.onFileChangedOnDisk(uri));
      }
      this.log('estimate: watching started (enabled).');
    } else {
      this.stopWatching();
      this.log('estimate: disabled in settings.');
    }
    this.onStateChanged();
  }

  /** Remove the watchers and clear the pending turn. */
  private stopWatching(): void {
    this.changeSub?.dispose();
    this.changeSub = undefined;
    this.saveSub?.dispose();
    this.saveSub = undefined;
    this.createFilesSub?.dispose();
    this.createFilesSub = undefined;
    this.fileWatcher?.dispose();
    this.fileWatcher = undefined;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = undefined;
    }
    this.turnChars = 0;
    this.userTyping.clear();
  }

  /**
   * Accumulate chunk edits into the current turn. We read ONLY the length of
   * each change (inserted + removed) — never the text — to keep the guarantee.
   *
   * We also note when a change is a single-character keystroke, so we can tell
   * "a file the human is typing in" apart from "a file an agent edited" when the
   * file is later saved.
   */
  private onDocChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.document.uri.scheme !== 'file' || isIgnoredPath(event.document.uri.path)) {
      return;
    }
    if (
      event.reason === vscode.TextDocumentChangeReason.Undo ||
      event.reason === vscode.TextDocumentChangeReason.Redo
    ) {
      return;
    }

    let added = 0;
    let sawKeystroke = false;
    for (const change of event.contentChanges) {
      const inserted = change.text.length; // length only — content ignored
      const removed = change.rangeLength; // count only — content ignored
      if (isSignificantChange(inserted, removed)) {
        added += inserted + removed;
      } else if (inserted <= 1 && removed <= 1) {
        sawKeystroke = true;
      }
    }
    if (sawKeystroke) {
      this.userTyping.set(event.document.uri.toString(), Date.now());
    }
    if (added > 0) {
      this.log(`estimate: edit +${added} chars (turn ${this.turnChars + added}).`);
    }
    this.addToTurn(added);
  }

  /**
   * When a file is saved that the human was NOT just typing in, treat it as an
   * agent edit to an existing file (which the change event can miss if the file
   * isn't open). Uses a nominal size — no file contents are read.
   */
  private onDocSaved(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== 'file' || isIgnoredPath(doc.uri.path)) {
      return;
    }
    const lastTyped = this.userTyping.get(doc.uri.toString());
    if (lastTyped !== undefined && Date.now() - lastTyped < USER_TYPING_WINDOW_MS) {
      return; // the human is editing this file — not an agent edit
    }
    this.log(`estimate: file saved by agent (+${SAVE_NOMINAL_CHARS} nominal).`);
    this.addToTurn(SAVE_NOMINAL_CHARS);
  }

  /**
   * Count a newly-created file (common in agent mode) using its byte *size* as a
   * proxy. We stat for size only — the file contents are never read.
   */
  private async onFileCreated(uri: vscode.Uri): Promise<void> {
    if (uri.scheme !== 'file' || isIgnoredPath(uri.path)) {
      return;
    }
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (!(stat.type & vscode.FileType.Directory) && stat.size > 0) {
        this.log(`estimate: file created (+${stat.size} bytes).`);
        this.addToTurn(stat.size);
      }
    } catch {
      // File vanished or is unreadable — skip it quietly.
    }
  }

  /**
   * A file changed on disk. When it isn't a file the human was just typing in,
   * treat it as an agent edit to an existing file (which the text-change/save
   * events can miss if the file isn't open). Uses a nominal size — no contents
   * are read.
   */
  private onFileChangedOnDisk(uri: vscode.Uri): void {
    if (uri.scheme !== 'file' || isIgnoredPath(uri.path)) {
      return;
    }
    const lastTyped = this.userTyping.get(uri.toString());
    if (lastTyped !== undefined && Date.now() - lastTyped < USER_TYPING_WINDOW_MS) {
      return; // the human is editing this file — not an agent edit
    }
    this.log(`estimate: file changed on disk (+${SAVE_NOMINAL_CHARS} nominal).`);
    this.addToTurn(SAVE_NOMINAL_CHARS);
  }

  /** Add characters to the current turn and (re)arm the settle timer. */
  private addToTurn(chars: number): void {
    if (chars <= 0) {
      return;
    }
    this.turnChars += chars;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
    }
    this.turnTimer = setTimeout(() => void this.flushTurn(), TURN_SETTLE_MS);
  }

  /** Record one estimated agent request for the settled turn and announce it. */
  private async flushTurn(): Promise<void> {
    this.turnTimer = undefined;
    const chars = this.turnChars;
    this.turnChars = 0;
    if (chars <= 0 || !this.sink) {
      return;
    }
    const price = this.getConfig().pricePerRequestUsd;
    const record = buildEstimateRecord(chars, price, Date.now(), () => crypto.randomUUID());
    await this.sink.record(record);
    this.log(`estimate: recorded 1 request (~$${price.toFixed(2)}) from ${chars} chars.`);
    this.onTurnEstimated({ completionTokens: estimateTokens(chars), costUsd: Math.max(0, price) });
  }
}
