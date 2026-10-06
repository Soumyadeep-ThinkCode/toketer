import type { ModelBarViewModel, PanelViewModel, RecentItemViewModel } from './view-model';

/**
 * Pure HTML rendering for the Toketer Cost panel.
 *
 * The webview is deliberately "dumb": it receives already-formatted strings and
 * only renders them. The design uses VS Code theme tokens (CSS variables) so it
 * looks native in both light and dark themes.
 */

/** Escape a string for safe insertion into HTML text/attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render a single per-model bar row. */
function renderModelBar(model: ModelBarViewModel): string {
  return `
    <div class="bar-row">
      <div class="bar-label">
        <span class="model">${escapeHtml(model.modelId)}</span>
        <span class="muted">${escapeHtml(model.vendor)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${model.percent}%"></div>
      </div>
      <div class="bar-value">
        <span class="cost">${escapeHtml(model.costLabel)}</span>
        <span class="muted">${escapeHtml(model.tokensLabel)}</span>
      </div>
    </div>`;
}

/** Render a single recent-prompt row. */
function renderRecentRow(item: RecentItemViewModel): string {
  const estimateBadge = item.isEstimate
    ? `<span class="badge" title="Estimated — Copilot doesn't report real tokens">est</span>`
    : '';
  return `
    <li class="recent-row">
      <span class="time">${escapeHtml(item.timeLabel)}</span>
      <span class="recent-model">
        <span class="recent-model-name">${escapeHtml(item.modelId)} ${estimateBadge}</span>
        <span class="muted tiny">${escapeHtml(item.inOutLabel)}</span>
      </span>
      <span class="muted surface">${escapeHtml(item.surface)}</span>
      <span class="recent-tokens muted">${escapeHtml(item.tokensLabel)}</span>
      <span class="recent-cost">${escapeHtml(item.costLabel)}</span>
    </li>`;
}

/** Friendly empty-state block shown before any AI activity is recorded. */
function renderEmptyState(): string {
  return `
    <div class="empty">
      <div class="empty-emoji">⛽</div>
      <div class="empty-title">No AI activity yet</div>
      <div class="empty-text">Start coding with your AI assistant and watch the meter move!</div>
    </div>`;
}

/**
 * Render the complete HTML document for the panel.
 *
 * @param vm The formatted view model to display.
 * @param nonce A per-render nonce used by the strict Content-Security-Policy.
 * @param cspSource The webview's `cspSource` used to allow styles.
 * @returns A full HTML document string.
 */
export function renderHtml(vm: PanelViewModel, nonce: string, cspSource: string): string {
  const inrActive = vm.currency === 'INR' ? 'active' : '';
  const usdActive = vm.currency === 'USD' ? 'active' : '';

  const modelsSection = vm.models.length
    ? vm.models.map(renderModelBar).join('')
    : `<p class="muted small">No model activity today yet.</p>`;

  const recentSection = vm.recent.length
    ? `<ul class="recent-list">${vm.recent.map(renderRecentRow).join('')}</ul>`
    : `<p class="muted small">Your most recent prompts will appear here.</p>`;

  const body = vm.hasActivity
    ? `
      <section class="stats">
        <div class="stat-card">
          <div class="stat-label">This session</div>
          <div class="stat-value">${escapeHtml(vm.sessionCostLabel)}</div>
          <div class="stat-sub muted">${escapeHtml(vm.sessionTokensLabel)} tokens</div>
        </div>
        <div class="stat-card accent">
          <div class="stat-label">Today</div>
          <div class="stat-value">${escapeHtml(vm.todayCostLabel)}</div>
          <div class="stat-sub muted">${escapeHtml(vm.todayTokensLabel)} tokens</div>
        </div>
      </section>

      <section class="mini-stats">
        <div class="mini"><span class="mini-value">${vm.todayPromptCount}</span><span class="mini-label muted">prompts today</span></div>
        <div class="mini"><span class="mini-value">${escapeHtml(vm.avgCostLabel)}</span><span class="mini-label muted">avg / prompt</span></div>
      </section>

      <section class="block">
        <h2>By model (today)</h2>
        <div class="bars">${modelsSection}</div>
      </section>

      <section class="block">
        <h2>Recent prompts</h2>
        ${recentSection}
      </section>`
    : renderEmptyState();

  const estimateNote = vm.anyEstimate
    ? `<div class="note">
        <p><strong>About the Copilot estimate (“~” / “est” / “guess”).</strong></p>
        <p>GitHub Copilot does not expose live token usage to any extension, so Toketer
        cannot measure it exactly. Copilot figures are an <strong>approximated guess</strong>:
        each agent turn is counted as one premium request, and the token range is a
        rough estimate (the real hidden context is invisible to us).</p>
        <p>For <strong>exact</strong> cost, use <strong>Claude Code</strong> (metered
        exactly and automatically) or <strong>import your Copilot usage</strong> from
        GitHub billing.</p>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Toketer Cost</title>
  <style>
    :root {
      --accent: var(--vscode-charts-blue, #3794ff);
      --radius: 10px;
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
      font-size: 13px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .brand { display: flex; align-items: baseline; gap: 10px; }
    .brand h1 { font-size: 18px; margin: 0; font-weight: 600; }
    .brand .tagline { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .muted { color: var(--vscode-descriptionForeground); }
    .small { font-size: 12px; }

    .toggle { display: inline-flex; border: 1px solid var(--vscode-panel-border); border-radius: 999px; overflow: hidden; }
    .toggle button {
      background: transparent; color: var(--vscode-foreground);
      border: none; padding: 4px 12px; cursor: pointer; font-size: 13px;
    }
    .toggle button.active { background: var(--accent); color: var(--vscode-button-foreground, #fff); }

    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
    .stat-card {
      background: var(--vscode-editorWidget-background, rgba(127,127,127,0.08));
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .stat-card.accent { border-color: var(--accent); }
    .stat-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); }
    .stat-value { font-size: 30px; font-weight: 700; margin: 6px 0 2px; }
    .stat-sub { font-size: 12px; }

    .mini-stats { display: flex; gap: 28px; margin: -8px 0 22px; padding: 0 4px; }
    .mini { display: flex; flex-direction: column; }
    .mini-value { font-size: 18px; font-weight: 600; }
    .mini-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
    .tiny { font-size: 11px; }

    .block { margin-bottom: 22px; }
    .block h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: var(--vscode-foreground); }

    .bar-row { display: grid; grid-template-columns: 150px 1fr 120px; align-items: center; gap: 12px; margin-bottom: 10px; }
    .bar-label { display: flex; flex-direction: column; }
    .bar-label .model { font-weight: 600; }
    .bar-label .muted { font-size: 11px; }
    .bar-track { background: var(--vscode-panel-border); height: 10px; border-radius: 999px; overflow: hidden; }
    .bar-fill { background: var(--accent); height: 100%; border-radius: 999px; min-width: 2px; }
    .bar-value { text-align: right; display: flex; flex-direction: column; }
    .bar-value .cost { font-weight: 600; }
    .bar-value .muted { font-size: 11px; }

    .recent-list { list-style: none; padding: 0; margin: 0; }
    .recent-row {
      display: grid; grid-template-columns: 52px 1fr 70px 90px 80px; align-items: center;
      gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border);
    }
    .recent-row:last-child { border-bottom: none; }
    .recent-row .time { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
    .recent-model { display: flex; flex-direction: column; }
    .recent-model-name { font-weight: 600; }
    .recent-tokens, .surface { text-align: right; font-size: 12px; }
    .recent-cost { text-align: right; font-weight: 600; }
    .badge {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
      padding: 1px 5px; border-radius: 4px; margin-left: 4px;
    }

    .empty { text-align: center; padding: 48px 20px; }
    .empty-emoji { font-size: 40px; }
    .empty-title { font-size: 16px; font-weight: 600; margin: 10px 0 6px; }
    .empty-text { color: var(--vscode-descriptionForeground); }

    footer { margin-top: 24px; border-top: 1px solid var(--vscode-panel-border); padding-top: 12px; }
    .note { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 4px 0; }
    .note p { margin: 4px 0; }
    .note strong { color: var(--vscode-foreground); }
    .privacy { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 4px 0; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1>Toketer</h1>
      <span class="tagline">your AI fuel gauge</span>
    </div>
    <div class="toggle" role="group" aria-label="Display currency">
      <button class="${inrActive}" data-currency="INR" title="Show costs in Indian Rupees">₹</button>
      <button class="${usdActive}" data-currency="USD" title="Show costs in US Dollars">$</button>
    </div>
  </header>

  ${body}

  <footer>
    ${estimateNote}
    <p class="privacy">🔒 Metadata only — Toketer never reads or sends your code, files, or prompts.</p>
  </footer>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll('.toggle button')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'setCurrency', currency: button.dataset.currency });
      });
    }
  </script>
</body>
</html>`;
}
