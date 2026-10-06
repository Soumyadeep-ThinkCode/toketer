import type { AgentVendor, IdeSurface } from '../model/activity';

/**
 * Attribution mappers: turn the messy labels editors report into the small,
 * stable set of labels Toketer groups by. These functions are pure and never touch
 * any user content — they only look at short model/app identifiers.
 */

/**
 * Infer the AI vendor from a model label.
 *
 * Matching is by substring so prefixed/suffixed labels still resolve, e.g.
 * `anthropic/claude-3-5-sonnet` and `gpt-4o-2024-08-06`.
 *
 * @param modelId A model label such as `gpt-4o` or `claude-3-opus`.
 * @returns The inferred vendor, or `unknown` when nothing matches.
 */
export function detectVendor(modelId: string): AgentVendor {
  const id = modelId.trim().toLowerCase();
  if (id.includes('gpt') || id.startsWith('o1') || id.includes('openai')) {
    return 'openai';
  }
  if (id.includes('claude') || id.includes('anthropic')) {
    return 'anthropic';
  }
  if (id.includes('gemini') || id.includes('palm') || id.includes('google')) {
    return 'google';
  }
  if (id.includes('llama') || id.includes('meta')) {
    return 'meta';
  }
  if (id.includes('mistral') || id.includes('mixtral')) {
    return 'mistral';
  }
  if (id.includes('grok') || id.includes('xai')) {
    return 'xai';
  }
  return 'unknown';
}

/**
 * Detect the editor surface from the public `vscode.env.appName` string.
 *
 * Cursor reports an app name containing "Cursor"; standard builds report
 * "Visual Studio Code" / "VSCodium". Anything else is reported as `unknown`
 * rather than guessed.
 *
 * @param appName The value of `vscode.env.appName`.
 */
export function detectSurfaceFromAppName(appName: string): IdeSurface {
  const name = appName.trim().toLowerCase();
  if (name.includes('cursor')) {
    return 'cursor';
  }
  if (name.includes('visual studio code') || name.includes('vscodium') || name.includes('code')) {
    return 'vscode';
  }
  return 'unknown';
}

/**
 * Clean up a raw model label into a concise display label.
 *
 * Strips a leading `vendor/` prefix (e.g. `anthropic/claude-3-5-sonnet` →
 * `claude-3-5-sonnet`) and trims surrounding whitespace. Returns `unknown` for
 * empty input so the UI always has something to show.
 *
 * @param raw The raw model label reported by the editor.
 */
export function normaliseModelLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 'unknown';
  }
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}
