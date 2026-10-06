import * as vscode from 'vscode';
import type { ActivityRecorder } from '../ingest/recorder';

/**
 * A real AI producer for Toketer, built on VS Code's official Language Model API
 * (`vscode.lm`).
 *
 * Unlike the random demo event, this sends a prompt *you* type to a real chat
 * model (e.g. GitHub Copilot's GPT-4o) and records the **real model label** and
 * **real token counts** — the prompt and the completion are each measured with
 * the model's own tokenizer via `countTokens`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  PRIVACY
 * ──────────────────────────────────────────────────────────────────────────
 *  The prompt text and the model's answer are used only to (a) show the answer
 *  back to you, the person who asked, and (b) count tokens. Neither the prompt
 *  nor the answer is ever stored or transmitted by Toketer — only the resulting
 *  token counts and the model label are recorded.
 */

/** Output channel used to show AI answers without persisting them anywhere. */
let answerChannel: vscode.OutputChannel | undefined;

/** Lazily create the shared output channel for showing answers. */
function getAnswerChannel(): vscode.OutputChannel {
  if (!answerChannel) {
    answerChannel = vscode.window.createOutputChannel('Toketer — AI Answer');
  }
  return answerChannel;
}

/**
 * Prompt the user, send the request through `vscode.lm`, record real metadata
 * into Toketer, and show the answer in an output channel.
 *
 * @param recorder The activity recorder that stores the resulting event.
 */
export async function askAiAndRecord(recorder: ActivityRecorder): Promise<void> {
  const prompt = await vscode.window.showInputBox({
    title: 'Toketer: Ask AI',
    prompt: 'Type a prompt. Toketer records the real model + token counts — never the text.',
    placeHolder: 'e.g. Explain what a closure is in one sentence',
    ignoreFocusOut: true,
  });
  if (!prompt) {
    return;
  }

  // Pick an available chat model. This requires a Language Model provider such
  // as GitHub Copilot to be installed and signed in.
  const models = await vscode.lm.selectChatModels();
  if (models.length === 0) {
    void vscode.window.showWarningMessage(
      'Toketer: No language models are available. Install and sign in to GitHub Copilot ' +
        '(or another Language Model provider) to use this feature.',
    );
    return;
  }
  const model = await pickModel(models);
  if (!model) {
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Toketer: asking ${model.name}…` },
    async (_progress, token) => {
      try {
        // Count prompt tokens with the model's own tokenizer (accurate).
        const promptTokens = await model.countTokens(prompt, token);

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const response = await model.sendRequest(messages, {}, token);

        // Accumulate the streamed answer so we can show it and count its tokens.
        // This text is local-only and never handed to Toketer's store or network.
        let answer = '';
        for await (const fragment of response.text) {
          answer += fragment;
        }
        const completionTokens = await model.countTokens(answer, token);

        // Record REAL metadata: real model label + real token counts.
        await recorder.record({
          modelId: model.family,
          promptTokens,
          completionTokens,
          isEstimate: false,
        });

        showAnswer(model.name, answer);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Toketer: the AI request failed — ${message}`);
      }
    },
  );
}

/**
 * Let the user choose which available model to send the prompt to, so the model
 * recorded by Toketer always matches their intent. When only one model is available
 * it is used directly without an extra prompt.
 *
 * @param models The models returned by `vscode.lm.selectChatModels`.
 * @returns The chosen model, or `undefined` if the user cancelled.
 */
async function pickModel(
  models: readonly vscode.LanguageModelChat[],
): Promise<vscode.LanguageModelChat | undefined> {
  if (models.length === 1) {
    return models[0];
  }
  const picked = await vscode.window.showQuickPick(
    models.map((model) => ({ label: model.name, description: model.vendor, model })),
    {
      title: 'Toketer: choose the model to ask',
      placeHolder: 'Pick the AI model to send your prompt to',
    },
  );
  return picked?.model;
}

/** Reveal the answer in a dedicated output channel (not stored by Toketer). */
function showAnswer(modelName: string, answer: string): void {
  const channel = getAnswerChannel();
  channel.clear();
  channel.appendLine(`Model: ${modelName}`);
  channel.appendLine('─'.repeat(40));
  channel.appendLine(answer.trim().length > 0 ? answer.trim() : '(empty response)');
  channel.show(true);
}

/** Dispose the output channel on deactivation. */
export function disposeLmResources(): void {
  answerChannel?.dispose();
  answerChannel = undefined;
}
