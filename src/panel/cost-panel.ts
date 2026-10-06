import * as vscode from 'vscode';
import { readSettings, writeCurrency } from '../config';
import { resolveCurrency } from '../currency/format';
import { breakdownByModel } from '../store/aggregation';
import type { ActivityStore } from '../store/activity-store';
import { renderHtml } from './html';
import { buildPanelViewModel } from './view-model';

/** Number of recent prompts shown in the panel. */
const RECENT_LIMIT = 8;

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
 * Controller for the single "Toketer Cost" webview panel.
 *
 * Owns the webview lifecycle, re-renders it whenever the store changes, and
 * handles the currency toggle message coming back from the webview.
 */
export class CostPanel {
  private static current: CostPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly store: ActivityStore,
  ) {
    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.disposables.push(this.store.onDidChange(() => this.update()));
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables,
    );
  }

  /**
   * Reveal the panel, creating it if necessary (singleton).
   * @param store The activity store to render.
   */
  static show(store: ActivityStore): void {
    if (CostPanel.current) {
      CostPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'toketerCostPanel',
      'Toketer Cost',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    CostPanel.current = new CostPanel(panel, store);
  }

  /** Handle messages posted from the webview script. */
  private async handleMessage(message: unknown): Promise<void> {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: string }).type === 'setCurrency'
    ) {
      const currency = (message as { currency?: string }).currency;
      if (currency === 'USD' || currency === 'INR') {
        await writeCurrency(currency);
        this.update();
      }
    }
  }

  /** Rebuild the view model and re-render the webview HTML. */
  private update(): void {
    const settings = readSettings();
    const currency = resolveCurrency(settings.currency, vscode.env.language);
    const vm = buildPanelViewModel({
      sessionTotals: this.store.getSessionTotals(),
      todayTotals: this.store.getTodayTotals(),
      todayBreakdown: breakdownByModel(this.store.getTodayEvents()),
      recentEvents: this.store.getRecent(RECENT_LIMIT),
      currency,
      usdToInrRate: settings.usdToInrRate,
    });
    const nonce = getNonce();
    this.panel.webview.html = renderHtml(vm, nonce, this.panel.webview.cspSource);
  }

  /** Tear down the panel and its subscriptions. */
  private dispose(): void {
    CostPanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
