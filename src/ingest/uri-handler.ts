import * as vscode from 'vscode';
import { parseActivityQuery } from './query';
import type { ActivityRecorder } from './recorder';

/**
 * Handles `vscode://toketer.toketer/activity?...` deep links so external tools (a CLI,
 * an agent, a companion extension) can push metadata-only activity into Toketer.
 *
 * The query string is parsed by {@link parseActivityQuery}; see that function
 * for the list of supported (metadata-only) parameters.
 */
export class ToketerUriHandler implements vscode.UriHandler {
  constructor(private readonly recorder: ActivityRecorder) {}

  /**
   * Handle an incoming deep link.
   * @param uri The URI VS Code routed to this extension.
   */
  async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path !== '/activity') {
      return;
    }
    const input = parseActivityQuery(uri.query);
    if (input) {
      await this.recorder.record(input);
    }
  }
}
