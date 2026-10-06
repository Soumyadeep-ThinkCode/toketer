import type { CapturedRecord } from '../captured-record';

/**
 * Pure estimation helpers for the **live GitHub Copilot estimate**.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  Honest by design
 * ──────────────────────────────────────────────────────────────────────────
 *  No public API exposes Copilot Chat / agent-mode token usage to a third-party
 *  extension. So Toketer estimates: it detects an agent *turn* from the edits the
 *  agent makes (reading only the *size* of each change, never the text), counts
 *  it as one Copilot premium request (Copilot bills per request, not per token),
 *  and shows a rough token figure from the visible edit size. Everything is
 *  clearly labelled as an estimate (`~`), because the agent's hidden context is
 *  invisible to us and this is a floor, not a bill.
 */

/**
 * Minimum characters in a *single* change for it to count as an AI/chunk edit
 * rather than a human keystroke. Humans type one character per change event;
 * agents (and pastes) apply multi-character chunks, so a small value cleanly
 * separates the two.
 */
export const SIGNIFICANT_CHANGE_CHARS = 2;

/** Rough characters-per-token ratio for the visible output portion. */
export const CHARS_PER_TOKEN = 4;

/**
 * Typical hidden-context tokens a Copilot agent request carries (system prompt,
 * open files, conversation, tool definitions). This is invisible to us, so we
 * add a modest, honest baseline to the visible-output estimate. It keeps the
 * figure in a believable range (a few thousand tokens per request) rather than
 * the wildly-low "edit size only" count — and it's always shown as a guess.
 */
export const BASE_CONTEXT_TOKENS = 2000;

/**
 * Path fragments that are never developer-authored by a prompt (dependencies,
 * build output, VCS, caches). Changes under these are ignored so, for example,
 * an agent running `npm install` doesn't trigger an estimate from `node_modules`.
 */
const IGNORED_SEGMENTS = [
  '/node_modules/',
  '/.git/',
  '/dist/',
  '/out/',
  '/build/',
  '/.next/',
  '/.turbo/',
  '/coverage/',
  '/.venv/',
  '/__pycache__/',
  '/.cache/',
];

/** Machine-generated file names (lock files) that should be ignored. */
const IGNORED_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

/**
 * Whether a path should be ignored by the estimator (dependencies, build output,
 * VCS, caches, lock files). Accepts `/`- or `\`-separated paths.
 * @param path A filesystem path or URI path.
 */
export function isIgnoredPath(path: string): boolean {
  const p = path.replace(/\\/g, '/').toLowerCase();
  if (IGNORED_SEGMENTS.some((seg) => p.includes(seg))) {
    return true;
  }
  const base = p.slice(p.lastIndexOf('/') + 1);
  return IGNORED_FILES.includes(base);
}

/**
 * Whether a single change is a chunk edit (agent/paste) rather than a keystroke.
 * @param insertedChars Characters inserted by the change.
 * @param removedChars Characters removed by the change.
 */
export function isSignificantChange(insertedChars: number, removedChars: number): boolean {
  return insertedChars >= SIGNIFICANT_CHANGE_CHARS || removedChars >= SIGNIFICANT_CHANGE_CHARS;
}

/**
 * A rough **total** token guess for one agent request: a typical hidden-context
 * baseline plus the visible output derived from the edit size. This is an
 * approximation (the real context is invisible), always surfaced as a guess.
 * @param changedChars Characters touched in the turn (the visible output).
 */
export function estimateTokens(changedChars: number): number {
  const visibleOutput = Math.ceil(Math.max(0, changedChars) / CHARS_PER_TOKEN);
  return BASE_CONTEXT_TOKENS + visibleOutput;
}

/**
 * Build the metadata-only {@link CapturedRecord} for one estimated Copilot agent
 * turn (= one premium request). The model is unknown (we can't read Copilot's
 * selection), so it is labelled honestly and the cost is carried as an override.
 *
 * @param changedChars Total characters touched across the turn (for the token figure).
 * @param pricePerRequestUsd Flat price for one Copilot premium request.
 * @param timestampMs When the turn happened.
 * @param newId Generates a unique dedupe key.
 */
export function buildEstimateRecord(
  changedChars: number,
  pricePerRequestUsd: number,
  timestampMs: number,
  newId: () => string,
): CapturedRecord {
  return {
    key: `copilot-estimate:${newId()}`,
    modelId: 'copilot (estimated)',
    promptTokens: 0, // the agent's context is invisible to us
    completionTokens: estimateTokens(changedChars),
    timestampMs,
    isEstimate: true,
    costUsdOverride: Math.max(0, pricePerRequestUsd),
  };
}
