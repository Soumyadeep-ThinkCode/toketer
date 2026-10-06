import * as vscode from 'vscode';
import { readSettings } from '../config';
import type { ActivityRecorder } from '../ingest/recorder';
import type { KeyValueStore } from '../store/activity-store';
import { ClaudeCodeSource } from './claude-code/adapter';
import { CopilotEstimateSource, type EstimatedTurn } from './copilot-estimate/adapter';
import { CopilotImportSource } from './copilot-import/adapter';
import {
  getLastImport,
  getLastReminder,
  setLastReminder,
  shouldRemindImport,
} from './copilot-import/reminder';
import { SourceRegistry } from './registry';

/**
 * Build the {@link SourceRegistry} with all built-in sources wired up.
 *
 * Adding a new source for a new tool is a one-line change here: construct the
 * adapter and include it in the array. Each adapter is handed a callback to
 * notify the registry when its state changes (so the diagnostics panel updates).
 *
 * @param storage Persistence backend (globalState) for dedupe + baselines.
 * @param recorder The existing recorder every source feeds into.
 * @param onTurnEstimated Called after each estimated Copilot turn so the host can announce it.
 * @param log Diagnostic logger (sizes/counts only) surfaced in an output channel.
 * @returns A ready-to-start registry and the Copilot import source (for its command).
 */
export function createSourceRegistry(
  storage: KeyValueStore,
  recorder: ActivityRecorder,
  onTurnEstimated: (turn: EstimatedTurn) => void = () => {},
  log: (message: string) => void = () => {},
): { registry: SourceRegistry; copilotImport: CopilotImportSource } {
  // A tiny holder lets adapters notify the registry of state changes without a
  // forward `let` declaration (the registry is created after the adapters).
  const holder: { registry?: SourceRegistry } = {};
  const notify = (): void => holder.registry?.emitChange();

  const claudeCode = new ClaudeCodeSource(
    storage,
    () => {
      const s = readSettings();
      return { enabled: s.claudeCodeEnabled, logPath: s.claudeCodeLogPath };
    },
    notify,
  );
  const copilotImport = new CopilotImportSource(storage, notify);
  const copilotEstimate = new CopilotEstimateSource(
    () => {
      const s = readSettings();
      return {
        enabled: s.copilotEstimateEnabled,
        pricePerRequestUsd: s.copilotEstimatePricePerRequestUsd,
      };
    },
    notify,
    onTurnEstimated,
    log,
  );

  const registry = new SourceRegistry([claudeCode, copilotImport, copilotEstimate], recorder);
  holder.registry = registry;
  return { registry, copilotImport };
}

/** globalState key recording that the one-time welcome notice has been shown. */
const FIRST_RUN_KEY = 'toketer.firstRunNoticeShown.v1';

/**
 * Show a one-time, dismissible welcome notice explaining what's tracked and
 * offering the Copilot import. Never nags: it appears at most once.
 *
 * @param storage Persistence backend used to remember it was shown.
 * @param importCommandId Command id to run when the user clicks "Import".
 * @param openSourcesCommandId Command id to open the sources panel.
 */
export async function showFirstRunNoticeOnce(
  storage: KeyValueStore,
  importCommandId: string,
  openSourcesCommandId: string,
): Promise<void> {
  if (storage.get<boolean>(FIRST_RUN_KEY, false)) {
    return;
  }
  await storage.update(FIRST_RUN_KEY, true);

  const choice = await vscode.window.showInformationMessage(
    'Toketer is tracking your AI cost automatically — Claude Code (exact) and GitHub Copilot agent turns (live estimate, shown with “~”). Tip: type “@toketer” in chat for exact per-prompt cost.',
    'Show me',
    'Import Copilot usage',
    'Got it',
  );
  if (choice === 'Import Copilot usage') {
    await vscode.commands.executeCommand(importCommandId);
  } else if (choice === 'Show me') {
    await vscode.commands.executeCommand(openSourcesCommandId);
  }
}

/**
 * If the user has imported Copilot usage before but it's now stale, show a
 * gentle, infrequent reminder to import again. Appears at most once per week and
 * never pesters users who have never imported.
 *
 * @param storage Persistence backend for the import/reminder timestamps.
 * @param importCommandId Command id to run when the user clicks "Import".
 */
export async function maybeRemindCopilotImport(
  storage: KeyValueStore,
  importCommandId: string,
): Promise<void> {
  const now = Date.now();
  if (!shouldRemindImport(getLastImport(storage).whenMs, getLastReminder(storage), now)) {
    return;
  }
  await setLastReminder(storage, now);

  const choice = await vscode.window.showInformationMessage(
    'Toketer: it’s been a while since you imported your GitHub Copilot usage. Import again to refresh your Copilot cost.',
    'Import now',
    'Later',
  );
  if (choice === 'Import now') {
    await vscode.commands.executeCommand(importCommandId);
  }
}
