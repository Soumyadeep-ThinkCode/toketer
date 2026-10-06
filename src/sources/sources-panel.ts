import * as vscode from 'vscode';
import type { SourceRegistry } from './registry';
import { renderSourcesHtml } from './sources-html';

/** Generate a random nonce for the webview Content-Security-Policy. */
function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * Controller for the single "Toketer Sources" diagnostics webview.
 *
 * Shows each input source's friendly status, re-renders when sources change, and
 * runs the one-click action a source advertises (e.g. importing Copilot usage).
 */
export class SourcesPanel {
  private static current: SourcesPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly registry: SourceRegistry,
  ) {
    this.update();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.disposables.push(this.registry.onDidChange(() => this.update()));
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables,
    );
  }

  /**
   * Reveal the panel, creating it if necessary (singleton).
   * @param registry The source registry to display.
   */
  static show(registry: SourceRegistry): void {
    if (SourcesPanel.current) {
      SourcesPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'toketerSourcesPanel',
      'Toketer Sources',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    SourcesPanel.current = new SourcesPanel(panel, registry);
  }

  /** Run the command a source button requested. */
  private async handleMessage(message: unknown): Promise<void> {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: string }).type === 'runCommand'
    ) {
      const commandId = (message as { commandId?: string }).commandId;
      if (typeof commandId === 'string' && commandId.startsWith('toketer.')) {
        await vscode.commands.executeCommand(commandId);
      }
    }
  }

  /** Re-render the webview from current source states. */
  private update(): void {
    const nonce = getNonce();
    this.panel.webview.html = renderSourcesHtml(
      this.registry.getStates(),
      nonce,
      this.panel.webview.cspSource,
    );
  }

  /** Tear down the panel and its subscriptions. */
  private dispose(): void {
    SourcesPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
