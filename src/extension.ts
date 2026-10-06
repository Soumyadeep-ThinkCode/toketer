import * as vscode from 'vscode';
import { readSettings, writeCurrency } from './config';
import { formatMoney, formatTokenRange, resolveCurrency } from './currency/format';
import { CostMeter } from './meter/status-bar';
import { CostPanel } from './panel/cost-panel';
import { PricingProvider } from './pricing/pricing-loader';
import type { PricingTable } from './pricing/pricing-table';
import { ActivityStore } from './store/activity-store';
import { ActivityRecorder } from './ingest/recorder';
import { ToketerUriHandler } from './ingest/uri-handler';
import { askAiAndRecord, disposeLmResources } from './lm/ask-ai';
import { registerCostChatParticipant } from './chat/participant';
import { renderPromptFooter } from './chat/cost-footer';
import {
  createSourceRegistry,
  showFirstRunNoticeOnce,
  maybeRemindCopilotImport,
} from './sources/setup';
import { SourcesPanel } from './sources/sources-panel';
import { IMPORT_COMMAND_ID } from './sources/copilot-import/adapter';
import type { RawActivityInput } from './attribution/event-builder';

/** globalState key used to persist a refreshed pricing table across sessions. */
const PRICING_STORAGE_KEY = 'toketer.pricingTable.v1';

/**
 * Extension entry point. Deliberately thin: it wires the single-responsibility
 * modules together and registers commands, the status bar meter, and the URI
 * handshake. All real logic lives in the focused modules it composes.
 *
 * @param context The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Core services (metadata-only throughout).
  const store = new ActivityStore(context.globalState);
  const pricing = new PricingProvider();
  const recorder = new ActivityRecorder(store, pricing);

  // Restore any previously refreshed pricing table so we start up-to-date.
  const persisted = context.globalState.get<PricingTable>(PRICING_STORAGE_KEY);
  if (persisted && persisted.entries?.length) {
    pricing.setTable(persisted);
  }

  // The live meter appears immediately — zero configuration, no login.
  const meter = new CostMeter(store, 'toketer.openPanel');
  context.subscriptions.push({ dispose: () => meter.dispose() });

  // A visible diagnostics log so the Copilot estimate is not a black box — it
  // records sizes/counts only (never paths or content).
  const diagnostics = vscode.window.createOutputChannel('Toketer Diagnostics');
  context.subscriptions.push(diagnostics);
  const diagLog = (msg: string): void =>
    diagnostics.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);

  // Automatic input sources (Claude Code logs, Copilot import + live estimate)
  // feed the SAME recorder, so the meter moves on its own with no extra wiring.
  // After each estimated Copilot turn, announce the figure in the status bar so
  // it's visible right after the agent finishes (we can't write into its reply).
  const { registry, copilotImport } = createSourceRegistry(
    context.globalState,
    recorder,
    (turn) => {
      const settings = readSettings();
      const currency = resolveCurrency(settings.currency, vscode.env.language);
      const money = formatMoney(turn.costUsd, currency, settings.usdToInrRate);
      void vscode.window.setStatusBarMessage(
        `$(flame) Toketer: Copilot agent turn ≈ ~${money} · ${formatTokenRange(turn.completionTokens)} tokens (guess)`,
        8000,
      );
    },
    diagLog,
  );
  context.subscriptions.push({ dispose: () => registry.dispose() });
  void registry.startAll();

  // The `@toketer` chat participant: real-time, per-prompt cost right in the chat
  // panel. Unavailable on hosts without the chat API — handled gracefully.
  const chatParticipant = registerCostChatParticipant(recorder, (event, contextMaxTokens) => {
    const settings = readSettings();
    return renderPromptFooter({
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      costUsd: event.estimatedCostUsd,
      modelId: event.modelId,
      isEstimate: event.isEstimate,
      contextMaxTokens,
      sessionCostUsd: store.getSessionTotals().costUsd,
      todayCostUsd: store.getTodayTotals().costUsd,
      currency: resolveCurrency(settings.currency, vscode.env.language),
      usdToInrRate: settings.usdToInrRate,
    });
  });
  if (chatParticipant) {
    context.subscriptions.push(chatParticipant);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('toketer.openPanel', () => CostPanel.show(store)),

    vscode.commands.registerCommand('toketer.openSources', () => SourcesPanel.show(registry)),

    vscode.commands.registerCommand(IMPORT_COMMAND_ID, () => copilotImport.runImport()),

    vscode.commands.registerCommand('toketer.showDiagnostics', () => diagnostics.show()),

    vscode.commands.registerCommand('toketer.toggleCurrency', () => toggleCurrency()),

    // Public ingestion API: companion tools/agents call this with metadata only.
    vscode.commands.registerCommand('toketer.recordAiActivity', (input: RawActivityInput) =>
      recorder.record(input),
    ),

    // Real AI producer: send a prompt through VS Code's Language Model API and
    // record the real model + real token counts (prompt/answer text is never stored).
    vscode.commands.registerCommand('toketer.askAi', () => askAiAndRecord(recorder)),

    vscode.commands.registerCommand('toketer.refreshPricing', () =>
      refreshPricing(pricing, context),
    ),

    vscode.commands.registerCommand('toketer.clearActivity', () => clearActivity(store)),

    vscode.window.registerUriHandler(new ToketerUriHandler(recorder)),
  );

  // One-time, dismissible welcome, then a gentle periodic reminder to re-import
  // Copilot usage if it goes stale (never nags users who don't use Copilot).
  void showFirstRunNoticeOnce(context.globalState, IMPORT_COMMAND_ID, 'toketer.openSources').then(
    () => maybeRemindCopilotImport(context.globalState, IMPORT_COMMAND_ID),
  );
}

/** Flip the display currency between INR and USD and confirm to the user. */
async function toggleCurrency(): Promise<void> {
  const settings = readSettings();
  const current = resolveCurrency(settings.currency, vscode.env.language);
  const next = current === 'INR' ? 'USD' : 'INR';
  await writeCurrency(next);
  void vscode.window.showInformationMessage(`Toketer is now showing costs in ${next}.`);
}

/** Refresh the pricing table from the Toketer API and persist it on success. */
async function refreshPricing(
  pricing: PricingProvider,
  context: vscode.ExtensionContext,
): Promise<void> {
  const settings = readSettings();
  const ok = await pricing.refreshFromRemote(settings.pricingApiBaseUrl);
  if (ok) {
    await context.globalState.update(PRICING_STORAGE_KEY, pricing.getTable());
    void vscode.window.showInformationMessage('Toketer pricing table updated.');
  } else {
    void vscode.window.showWarningMessage(
      'Toketer could not refresh pricing — using the bundled offline prices.',
    );
  }
}

/** Confirm, then clear all locally stored activity history. */
async function clearActivity(store: ActivityStore): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    'Clear all local Toketer activity history? This cannot be undone.',
    { modal: true },
    'Clear',
  );
  if (choice === 'Clear') {
    store.clear();
    void vscode.window.showInformationMessage('Toketer activity history cleared.');
  }
}

/** Extension deactivation hook. Disposables are cleaned up by VS Code. */
export function deactivate(): void {
  // Dispose the LM answer output channel; other resources are registered as
  // disposables in `activate` and cleaned up automatically by VS Code.
  disposeLmResources();
}
