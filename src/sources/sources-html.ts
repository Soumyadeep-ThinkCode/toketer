import type { SourceState, SourceStatus } from './captured-record';

/**
 * Pure HTML rendering for the friendly "Toketer Sources" diagnostics panel.
 *
 * Like the cost panel, this is a "dumb" view: it receives already-decided
 * {@link SourceState}s and renders them with VS Code theme tokens so it looks
 * native in light and dark themes. No business logic lives here.
 */

/** Escape a string for safe insertion into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Map a status to a friendly emoji + short word. */
function statusBadge(status: SourceStatus): { icon: string; word: string; cls: string } {
  switch (status) {
    case 'tracking':
      return { icon: '✅', word: 'Tracking', cls: 'ok' };
    case 'available':
      return { icon: 'ⓘ', word: 'Ready', cls: 'info' };
    case 'not-detected':
      return { icon: '○', word: 'Not detected', cls: 'muted' };
    case 'disabled':
      return { icon: '—', word: 'Off', cls: 'muted' };
    case 'error':
      return { icon: '⚠', word: 'Attention', cls: 'warn' };
  }
}

/** Render one source row. */
function renderSource(state: SourceState): string {
  const badge = statusBadge(state.status);
  const action = state.action
    ? `<button class="action" data-command="${escapeHtml(state.action.commandId)}">${escapeHtml(
        state.action.label,
      )}</button>`
    : '';
  return `
    <div class="source">
      <div class="source-head">
        <span class="status ${badge.cls}">${badge.icon} ${escapeHtml(badge.word)}</span>
        <span class="source-name">${escapeHtml(state.label)}</span>
      </div>
      <div class="source-detail">${escapeHtml(state.detail)}</div>
      <div class="source-actions">${action}</div>
    </div>`;
}

/**
 * Render the complete HTML document for the sources panel.
 * @param states The current state of each source.
 * @param nonce A per-render nonce for the Content-Security-Policy.
 * @param cspSource The webview's `cspSource` for allowing styles.
 */
export function renderSourcesHtml(
  states: readonly SourceState[],
  nonce: string,
  cspSource: string,
): string {
  const rows = states.map(renderSource).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Toketer Sources</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px; margin: 0; font-size: 13px;
    }
    header { margin-bottom: 18px; }
    header h1 { font-size: 18px; margin: 0 0 4px; font-weight: 600; }
    header p { margin: 0; color: var(--vscode-descriptionForeground); }
    .source {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
      background: var(--vscode-editorWidget-background, rgba(127,127,127,0.06));
    }
    .source-head { display: flex; align-items: center; gap: 10px; }
    .source-name { font-weight: 600; font-size: 14px; }
    .status { font-size: 12px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
    .status.ok { color: var(--vscode-testing-iconPassed, #3fb950); }
    .status.info { color: var(--vscode-charts-blue, #3794ff); }
    .status.warn { color: var(--vscode-editorWarning-foreground, #d29922); }
    .status.muted { color: var(--vscode-descriptionForeground); }
    .source-detail { margin: 8px 0 0; color: var(--vscode-descriptionForeground); }
    .source-actions { margin-top: 10px; }
    .action {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
    }
    .action:hover { background: var(--vscode-button-hoverBackground); }
    footer { margin-top: 18px; border-top: 1px solid var(--vscode-panel-border); padding-top: 12px; }
    .privacy { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 4px 0; }
  </style>
</head>
<body>
  <header>
    <h1>Toketer Sources</h1>
    <p>Where Toketer gets your AI usage. Everything is read locally, metadata only.</p>
  </header>

  ${rows}

  <footer>
    <p class="privacy">🔒 Toketer reads only token counts, model labels, timestamps, and cost — never your code, files, or prompts.</p>
  </footer>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll('.action')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'runCommand', commandId: button.dataset.command });
      });
    }
  </script>
</body>
</html>`;
}
