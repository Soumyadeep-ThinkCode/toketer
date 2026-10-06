import * as vscode from 'vscode';
import type { ActivitySink, SourceAdapter } from '../source-adapter';
import type { SourceState } from '../captured-record';
import type { KeyValueStore } from '../../store/activity-store';
import { SeenStore } from '../seen-store';
import { parseCopilotUsage } from './parser';
import { describeLastImport, getLastImport, setLastImport } from './reminder';

/** Command id that triggers an import (kept in sync with package.json). */
export const IMPORT_COMMAND_ID = 'toketer.importCopilotUsage';

/**
 * **GitHub Copilot usage import** source.
 *
 * Copilot Chat / agent-mode live token usage is not available to any third-party
 * extension, so Toketer offers the honest, EXACT alternative: a one-click import of
 * the official usage report you download from GitHub billing. Each row's exact
 * cost is recorded (Copilot is billed per request, not per token), de-duplicated
 * so re-importing is safe. The source remembers when you last imported and
 * surfaces that in the Sources panel (a separate reminder nudges you if it goes
 * stale).
 */
export class CopilotImportSource implements SourceAdapter {
  readonly id = 'copilotImport';
  readonly label = 'GitHub Copilot (import)';

  private sink: ActivitySink | undefined;
  private readonly seen: SeenStore;
  private transientDetail: string | undefined;

  /**
   * @param storage Persistence backend for dedupe + last-import tracking.
   * @param onStateChanged Called whenever the status/detail changes.
   */
  constructor(
    private readonly storage: KeyValueStore,
    private readonly onStateChanged: () => void,
  ) {
    this.seen = new SeenStore(storage, this.id);
  }

  /** Remember the sink; importing happens on demand via {@link runImport}. */
  async start(sink: ActivitySink): Promise<void> {
    this.sink = sink;
  }

  /** Current plain-language state for the diagnostics panel. */
  getState(): SourceState {
    const detail =
      this.transientDetail ?? describeLastImport(getLastImport(this.storage), Date.now());
    return {
      id: this.id,
      label: this.label,
      status: 'available',
      detail,
      action: { commandId: IMPORT_COMMAND_ID, label: 'Import Copilot usage…' },
    };
  }

  /** Nothing persistent to release. */
  dispose(): void {
    // no-op
  }

  /**
   * Prompt the user to pick a downloaded usage report, parse it, and record any
   * new rows. Safe to run repeatedly — already-imported rows are skipped.
   */
  async runImport(): Promise<void> {
    if (!this.sink) {
      return;
    }

    const picked = await vscode.window.showOpenDialog({
      title: 'Import GitHub Copilot usage report',
      openLabel: 'Import usage',
      canSelectMany: false,
      filters: { 'Usage report': ['csv', 'json'] },
    });
    if (!picked || picked.length === 0) {
      return;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(picked[0]);
      const text = new TextDecoder('utf-8').decode(bytes);
      const records = parseCopilotUsage(text);

      if (records.length === 0) {
        this.flashDetail('That file didn\u2019t look like a Copilot usage report.');
        void vscode.window.showWarningMessage(
          'Toketer: that file didn\u2019t look like a Copilot usage report. Download it from ' +
            'GitHub → Settings → Billing → Copilot → Usage.',
        );
        return;
      }

      let imported = 0;
      for (const record of records) {
        if (this.seen.has(record.key)) {
          continue;
        }
        this.seen.add(record.key);
        await this.sink.record(record);
        imported++;
      }
      await this.seen.persist();
      await setLastImport(this.storage, Date.now(), records.length);

      this.transientDetail = undefined;
      this.onStateChanged();
      void vscode.window.showInformationMessage(
        imported > 0
          ? `Toketer imported ${imported} Copilot usage record(s).`
          : 'Toketer: those Copilot records were already imported.',
      );
    } catch {
      this.flashDetail('Could not read that file.');
      void vscode.window.showErrorMessage('Toketer: could not read that usage report file.');
    }
  }

  /** Show a temporary detail line in the panel, then revert on next import. */
  private flashDetail(detail: string): void {
    this.transientDetail = detail;
    this.onStateChanged();
  }
}
