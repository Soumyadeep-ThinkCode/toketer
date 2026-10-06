import * as vscode from 'vscode';
import type { AiActivityEvent } from '../model/activity';
import type { ActivityRecorder } from '../ingest/recorder';

/**
 * Builds the per-prompt summary appended under each answer. Supplied by the
 * host so this module stays free of settings/store wiring.
 *
 * @param event The recorded metadata event for this prompt.
 * @param contextMaxTokens The model's max input window, when known.
 * @returns A Markdown summary to append to the chat response.
 */
export type FooterBuilder = (
  event: AiActivityEvent,
  contextMaxTokens: number | undefined,
) => string;

/**
 * Registers the **`@toketer` chat participant** so developers get REAL-TIME,
 * per-prompt cost right inside the native chat panel on the right.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Why a participant?
 * ──────────────────────────────────────────────────────────────────────────
 *  No public API lets a third-party extension observe the *default* Copilot
 *  Chat participant's token usage. The chat participant API is the one supported
 *  way to run inside that same panel: when a user types `@toketer <prompt>`, VS Code
 *  routes the turn to us. We forward it to the model the user picked in the panel
 *  dropdown, stream the answer straight back into the panel, and record the REAL
 *  model label + REAL token counts for every prompt.
 *
 *  PRIVACY: the prompt and the model's answer are used only to (a) forward the
 *  request the user explicitly made and (b) count tokens. Neither is ever stored
 *  or transmitted by Toketer — only the token counts and model label are recorded.
 *
 *  This gracefully returns `undefined` on hosts without the chat API (e.g. some
 *  Cursor/VSCodium builds), so the rest of Toketer keeps working everywhere.
 *
 * @param recorder The recorder each prompt's metadata is written to.
 * @param buildFooter Builds the per-prompt cost summary shown under each answer.
 */
export function registerCostChatParticipant(
  recorder: ActivityRecorder,
  buildFooter: FooterBuilder,
): vscode.Disposable | undefined {
  // The chat API is not available on every VS Code-compatible host.
  if (!vscode.chat || typeof vscode.chat.createChatParticipant !== 'function') {
    return undefined;
  }

  const handler: vscode.ChatRequestHandler = async (request, _context, stream, token) => {
    const model = await resolveModel(request);
    if (!model) {
      stream.markdown(
        'Toketer: no language model is available. Sign in to GitHub Copilot (or another ' +
          'provider) to chat with `@toketer`.',
      );
      return;
    }

    try {
      // Count prompt tokens with the model's own tokenizer (accurate). The
      // prompt text is used only to count + forward — it is never stored.
      const promptTokens = await model.countTokens(request.prompt, token);

      const messages = [vscode.LanguageModelChatMessage.User(request.prompt)];
      const response = await model.sendRequest(messages, {}, token);

      let answer = '';
      for await (const fragment of response.text) {
        answer += fragment;
        stream.markdown(fragment);
      }

      const completionTokens = await model.countTokens(answer, token);
      const event = await recorder.record({
        modelId: model.family,
        promptTokens,
        completionTokens,
        isEstimate: false,
      });

      // Show the real cost of this prompt right where the developer is working.
      stream.markdown(buildFooter(event, model.maxInputTokens));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stream.markdown(`\n\n_Toketer couldn't complete that request: ${message}_`);
    }
  };

  const participant = vscode.chat.createChatParticipant('toketer.cost', handler);
  participant.iconPath = new vscode.ThemeIcon('flame');
  return participant;
}

/**
 * Use the model the user selected in the chat panel, falling back to any
 * available model when the host doesn't attach one to the request.
 */
async function resolveModel(
  request: vscode.ChatRequest,
): Promise<vscode.LanguageModelChat | undefined> {
  if (request.model) {
    return request.model;
  }
  const models = await vscode.lm.selectChatModels();
  return models[0];
}
