import type { RawActivityInput } from '../attribution/event-builder';
import type { IdeSurface } from '../model/activity';

/**
 * Pure parsing of the activity deep-link query string. Kept free of any editor
 * imports so it can be unit-tested directly.
 *
 * Supported query parameters (all metadata, never content):
 *   - `model`      model label, e.g. `gpt-4o` (required)
 *   - `prompt`     prompt/input token count
 *   - `completion` completion/output token count
 *   - `estimate`   `1`/`true` → mark as estimated; `0`/`false` → exact
 *   - `surface`    `vscode` | `cursor` | `unknown`
 *   - `repo`       repository folder *name* (not a path)
 *
 * @param query A URI query string (with or without a leading `?`).
 * @returns The parsed input, or `undefined` when no model is supplied.
 */
export function parseActivityQuery(query: string): RawActivityInput | undefined {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);

  const model = params.get('model')?.trim();
  if (!model) {
    return undefined;
  }

  return {
    modelId: model,
    promptTokens: parseCount(params.get('prompt')),
    completionTokens: parseCount(params.get('completion')),
    isEstimate: parseEstimate(params.get('estimate')),
    ideSurface: parseSurface(params.get('surface')),
    repoName: params.get('repo')?.trim() || undefined,
  };
}

/** Parse a non-negative integer, returning `undefined` for missing/invalid values. */
function parseCount(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Interpret an `estimate` flag; defaults to `undefined` (builder decides). */
function parseEstimate(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') {
    return true;
  }
  if (v === '0' || v === 'false' || v === 'no') {
    return false;
  }
  return undefined;
}

/** Validate a surface label, ignoring anything unexpected. */
function parseSurface(value: string | null): IdeSurface | undefined {
  if (value === 'vscode' || value === 'cursor' || value === 'unknown') {
    return value;
  }
  return undefined;
}
