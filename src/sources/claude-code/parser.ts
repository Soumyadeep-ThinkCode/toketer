import type { CapturedRecord } from '../captured-record';

/**
 * Pure, defensive parser for Claude Code session logs.
 *
 * Claude Code writes one JSON object per line (JSONL) into transcript files
 * under `~/.claude/projects/` (e.g. `<project>/<session>.jsonl`). Assistant
 * turns carry token usage. The shape (verified against the public format and
 * the `ccusage` tool) is:
 *
 * ```jsonc
 * {
 *   "type": "assistant",
 *   "timestamp": "2024-06-08T15:01:02.123Z",
 *   "requestId": "req_abc",
 *   "message": {
 *     "id": "msg_123",
 *     "model": "claude-sonnet-4-20250514",
 *     "usage": {
 *       "input_tokens": 1284,
 *       "output_tokens": 545,
 *       "cache_creation_input_tokens": 400,
 *       "cache_read_input_tokens": 2000,
 *       "costUSD": 0.0123           // sometimes present
 *     }
 *   }
 * }
 * ```
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  PRIVACY: this parser reads ONLY the numeric usage fields, the model label,
 *  and the timestamp. The `content` array and any other free-form fields are
 *  never read or returned. The format is NOT stable across versions, so parsing
 *  is defensive: anything that doesn't look like a usage record is skipped.
 */

/** Minimal shape we care about inside a parsed line (everything else ignored). */
interface ClaudeUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  costUSD?: unknown;
  total_cost_usd?: unknown;
}

/** Read a field as a finite, non-negative number, or `undefined`. */
function asCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Read a field as a non-empty trimmed string, or `undefined`. */
function asLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Parse an ISO timestamp into epoch ms, or `undefined` when invalid. */
function asTimestamp(value: unknown): number | undefined {
  const label = asLabel(value);
  if (!label) {
    return undefined;
  }
  const ms = Date.parse(label);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Parse a single JSONL line into a {@link CapturedRecord}, or `undefined` if the
 * line is not a usage-bearing assistant record. Never throws.
 *
 * @param line One line from a Claude Code transcript file.
 * @returns A metadata-only record, or `undefined` to skip the line.
 */
export function parseClaudeLine(line: string): CapturedRecord | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return undefined; // not valid JSON — skip defensively
  }

  const message = (entry.message ?? {}) as Record<string, unknown>;
  const usage = (message.usage ?? entry.usage) as ClaudeUsage | undefined;
  if (!usage || typeof usage !== 'object') {
    return undefined; // no usage block — nothing to measure
  }

  const inputTokens = asCount(usage.input_tokens) ?? 0;
  const outputTokens = asCount(usage.output_tokens) ?? 0;
  const cacheCreate = asCount(usage.cache_creation_input_tokens) ?? 0;
  const cacheRead = asCount(usage.cache_read_input_tokens) ?? 0;

  // Require at least some token signal so we don't record empty rows.
  if (inputTokens + outputTokens + cacheCreate + cacheRead === 0) {
    return undefined;
  }

  const modelId = asLabel(message.model) ?? asLabel(entry.model) ?? 'unknown';
  const timestampMs = asTimestamp(entry.timestamp) ?? asTimestamp(message.timestamp) ?? Date.now();

  // All input-side tokens counted together for honest token volume. When the
  // log includes a client-side cost it is used directly (cache tokens are
  // priced differently), otherwise cost is computed downstream from tokens.
  const promptTokens = inputTokens + cacheCreate + cacheRead;
  const costUsdOverride = asCount(usage.costUSD) ?? asCount(usage.total_cost_usd);

  const key =
    asLabel((message as { id?: unknown }).id) ??
    asLabel(entry.requestId) ??
    asLabel(entry.uuid) ??
    `${timestampMs}:${modelId}:${promptTokens}:${outputTokens}`;

  return {
    key,
    modelId,
    promptTokens,
    completionTokens: outputTokens,
    timestampMs,
    isEstimate: false,
    costUsdOverride,
  };
}

/**
 * Parse an entire Claude Code transcript file's contents into records.
 * @param content The full UTF-8 text of a `.jsonl` transcript.
 * @returns All usage records found, in file order. Non-usage lines are skipped.
 */
export function parseClaudeTranscript(content: string): CapturedRecord[] {
  const records: CapturedRecord[] = [];
  for (const line of content.split(/\r?\n/)) {
    const record = parseClaudeLine(line);
    if (record) {
      records.push(record);
    }
  }
  return records;
}
