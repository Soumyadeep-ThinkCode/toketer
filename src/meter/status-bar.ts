import * as vscode from 'vscode';
import { readSettings } from '../config';
import { formatMoney, formatTokens, resolveCurrency } from '../currency/format';
import type { ActivityStore } from '../store/activity-store';

/**
 * The live "fuel gauge" shown in the status bar.
 *
 * It renders today's total AI cost and refreshes automatically whenever the
 * {@link ActivityStore} changes. Clicking it opens the Toketer Cost panel.
 */
export class CostMeter {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private lastEventId: string | undefined;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * @param store The activity store to read totals from.
   * @param openPanelCommandId Command id invoked when the meter is clicked.
   */
  constructor(
    private readonly store: ActivityStore,
    openPanelCommandId: string,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = openPanelCommandId;
    this.item.name = 'Toketer AI Cost Meter';

    this.lastEventId = this.store.getRecent(1)[0]?.id;

    // Refresh when activity changes or when the user edits settings (currency).
    this.disposables.push(this.store.onDidChange(() => this.onChange()));
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('toketer')) {
          this.render();
        }
      }),
    );

    this.render();
    this.item.show();
  }

  /**
   * On a store change, briefly flash the cost of a *new* event (so agent-mode
   * activity is visible right in the status bar), then settle back to the total.
   */
  private onChange(): void {
    const latest = this.store.getRecent(1)[0];
    if (latest && latest.id !== this.lastEventId) {
      this.lastEventId = latest.id;
      this.flash(latest.estimatedCostUsd, latest.totalTokens, latest.isEstimate);
    } else {
      this.render();
    }
  }

  /** Show a short-lived "+cost" pulse for the latest recorded interaction. */
  private flash(costUsd: number, totalTokens: number, isEstimate: boolean): void {
    const settings = readSettings();
    const currency = resolveCurrency(settings.currency, vscode.env.language);
    const prefix = isEstimate ? '~' : '';
    const money = formatMoney(costUsd, currency, settings.usdToInrRate);

    this.item.text = `$(flame) Toketer +${prefix}${money}`;
    this.item.tooltip = new vscode.MarkdownString(
      `Just now: **+${prefix}${money}** · ${formatTokens(totalTokens)} tokens`,
    );

    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
    }
    this.flashTimer = setTimeout(() => this.render(), 4000);
  }

  /** Re-draw the status bar text and tooltip from current data. */
  private render(): void {
    const settings = readSettings();
    const currency = resolveCurrency(settings.currency, vscode.env.language);

    const today = this.store.getTodayTotals();
    const todayEvents = this.store.getTodayEvents();
    const hasEstimate = todayEvents.some((event) => event.isEstimate);
    const prefix = hasEstimate ? '~' : '';
    const money = formatMoney(today.costUsd, currency, settings.usdToInrRate);

    this.item.text = `$(flame) Toketer: ${prefix}${money} today`;
    this.item.tooltip = this.buildTooltip(prefix, money);
  }

  /** Build the rich hover tooltip shown over the meter. */
  private buildTooltip(prefix: string, todayMoney: string): vscode.MarkdownString {
    const settings = readSettings();
    const currency = resolveCurrency(settings.currency, vscode.env.language);
    const session = this.store.getSessionTotals();
    const today = this.store.getTodayTotals();
    const sessionMoney = formatMoney(session.costUsd, currency, settings.usdToInrRate);

    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**Toketer — AI Cost Meter**\n\n`);
    md.appendMarkdown(
      `Today: **${prefix}${todayMoney}** · ${formatTokens(today.totalTokens)} tokens\n\n`,
    );
    md.appendMarkdown(
      `This session: ${sessionMoney} · ${formatTokens(session.totalTokens)} tokens\n\n`,
    );
    if (prefix === '~') {
      md.appendMarkdown(`_~ means estimated — your editor doesn't report exact tokens._\n\n`);
    }
    md.appendMarkdown(`Click to open the Toketer Cost panel.`);
    return md;
  }

  /** Dispose the status bar item and all subscriptions. */
  dispose(): void {
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = undefined;
    }
    this.item.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
