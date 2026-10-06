import type { CapturedRecord } from '../captured-record';

/**
 * Pure, defensive parser for a **GitHub Copilot usage report**.
 *
 * GitHub's Copilot premium-request report (Settings → Billing → Copilot → Usage
 * → Download) is billed *per request*, not per token, so it reports a **model**,
 * a **timestamp**, a **request count**, and a **cost** — but no token counts.
 * Toketer therefore records the exact cost directly and leaves tokens at zero.
 *
 * The exact columns are not guaranteed stable, so parsing is forgiving: columns
 * are matched by fuzzy header names, and both CSV and JSON exports are accepted.
 * Anything unrecognised is skipped rather than guessed.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  PRIVACY: only the model label, timestamp, request count, and cost are read.
 *  Usernames and any other columns are ignored.
 */

/** Candidate header names (lower-cased) for each field we need. */
const MODEL_HEADERS = ['model', 'model_name', 'sku_model'];
const TIMESTAMP_HEADERS = ['timestamp', 'date', 'day', 'usage_date', 'created_at'];
const COST_HEADERS = ['net_amount', 'gross_amount', 'cost', 'amount', 'applied_cost'];
const REQUEST_HEADERS = ['requests', 'requests_used', 'quantity', 'request_count'];

/** Find the first present header from a candidate list. */
function pickHeader(headers: readonly string[], candidates: readonly string[]): string | undefined {
  return headers.find((h) => candidates.includes(h));
}

/** Parse a number that may contain currency symbols/commas; else `undefined`. */
function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const cleaned = value.replace(/[^0-9.-]/g, '');
  if (cleaned.length === 0) {
    return undefined;
  }
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a timestamp/date string into epoch ms; else `undefined`. */
function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : undefined;
}

/** Split a single CSV line, respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Build a stable dedupe key for a row from its metadata fields. */
function rowKey(modelId: string, timestampMs: number, cost: number, requests: number): string {
  return `copilot:${timestampMs}:${modelId}:${cost.toFixed(6)}:${requests}`;
}

/** Turn resolved field values into a {@link CapturedRecord}, or skip. */
function buildRecord(
  modelId: string | undefined,
  timestampMs: number | undefined,
  cost: number | undefined,
  requests: number | undefined,
): CapturedRecord | undefined {
  if (!modelId || timestampMs === undefined || cost === undefined || cost < 0) {
    return undefined;
  }
  const requestCount = requests ?? 0;
  return {
    key: rowKey(modelId, timestampMs, cost, requestCount),
    modelId,
    promptTokens: 0, // Copilot billing does not expose tokens
    completionTokens: 0,
    timestampMs,
    isEstimate: false, // the cost itself is exact (from billing)
    costUsdOverride: cost,
  };
}

/** Parse a CSV export into records. */
function parseCsv(content: string): CapturedRecord[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const modelCol = pickHeader(headers, MODEL_HEADERS);
  const timeCol = pickHeader(headers, TIMESTAMP_HEADERS);
  const costCol = pickHeader(headers, COST_HEADERS);
  const reqCol = pickHeader(headers, REQUEST_HEADERS);

  // Without a model, timestamp, and cost column this isn't a report we grok.
  if (!modelCol || !timeCol || !costCol) {
    return [];
  }

  const records: CapturedRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ''));

    const record = buildRecord(
      row[modelCol]?.trim() || undefined,
      parseTimestamp(row[timeCol]),
      parseNumber(row[costCol]),
      reqCol ? parseNumber(row[reqCol]) : undefined,
    );
    if (record) {
      records.push(record);
    }
  }
  return records;
}

/** Read a field from a JSON object using the first matching candidate key. */
function pickJsonField(
  obj: Record<string, unknown>,
  candidates: readonly string[],
): string | undefined {
  for (const key of Object.keys(obj)) {
    if (candidates.includes(key.toLowerCase())) {
      const value = obj[key];
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
      }
    }
  }
  return undefined;
}

/** Parse a JSON array export into records. */
function parseJson(content: string): CapturedRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { usage?: unknown }).usage)
      ? (data as { usage: unknown[] }).usage
      : [];

  const records: CapturedRecord[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const obj = row as Record<string, unknown>;
    const record = buildRecord(
      pickJsonField(obj, MODEL_HEADERS),
      parseTimestamp(pickJsonField(obj, TIMESTAMP_HEADERS)),
      parseNumber(pickJsonField(obj, COST_HEADERS)),
      parseNumber(pickJsonField(obj, REQUEST_HEADERS)),
    );
    if (record) {
      records.push(record);
    }
  }
  return records;
}

/**
 * Parse a Copilot usage export (CSV or JSON) into metadata-only records.
 * Detects the format from the content and never throws.
 *
 * @param content The full text of the downloaded usage report.
 * @returns All usage records found; empty when the format isn't recognised.
 */
export function parseCopilotUsage(content: string): CapturedRecord[] {
  const trimmed = content.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJson(content);
  }
  return parseCsv(content);
}
