# Privacy — the metadata-only guarantee

Toketer is built on one simple, permanent promise:

> **Toketer only ever handles metadata — token counts, model/vendor/surface labels,
> cost estimates, and a repository folder name. Toketer never reads, stores, logs,
> or transmits your source code, file contents, diffs, AI prompts, or AI
> responses.**

This is not a setting you can accidentally turn off. It is enforced by the shape
of the code itself.

## What Toketer records

For each AI interaction it is told about, Toketer stores a small, fixed set of
**numbers and short labels**:

- `timestampMs` — when it happened
- `ideSurface` — `vscode` / `cursor` / `unknown`
- `agentVendor` — e.g. `openai`, `anthropic` (a label)
- `modelId` — e.g. `gpt-4o` (a label)
- `promptTokens`, `completionTokens`, `totalTokens` — counts
- `estimatedCostUsd` — a number computed locally
- `isEstimate` — whether the counts are estimated
- `repoName` — the **name** of your workspace folder (e.g. `my-app`), never a path

That is the complete list. See [`src/model/activity.ts`](./src/model/activity.ts).

## What Toketer never touches

- ❌ Source code or file contents
- ❌ File paths (only the top-level folder **name** is used, as a label)
- ❌ Diffs or edits
- ❌ AI prompt text
- ❌ AI response text

There is **no field anywhere in the data model** capable of holding any of the
above. A change that added one would be a critical bug, not a feature.

## How the guarantee is enforced in code

1. **The data model has no content fields.** The `AiActivityEvent` type only has
   numbers and short labels. If free-form content can't be represented, it can't
   be stored.
2. **Ingestion is metadata-only by construction.** Events can only enter Toketer via
   the `toketer.recordAiActivity` command or the `vscode://toketer.toketer/activity` URI,
   both of which accept only counts and labels.
3. **Everything stays on your machine.** Toketer v1 makes no network calls with
   your data at all — there is no account, no backend, and no sync. The only
   outbound request is the *optional* pricing-table refresh you trigger yourself,
   which downloads prices and sends none of your data.

## Automatic sources read metadata only

Toketer can automatically capture usage from local files (e.g. **Claude Code**
session logs, or a **Copilot usage report** you import). These reads are:

- **Local only.** Files are read on your machine; sources add **no** new network
  calls.
- **Metadata only.** Parsers extract **only** token counts, model labels,
  timestamps, and (for billing-based sources) a cost number. Claude Code
  transcripts contain your prompts and the model's replies — the parser in
  [`src/sources/claude-code/parser.ts`](./src/sources/claude-code/parser.ts)
  reads **only** the numeric `usage` fields and the model label, and never
  touches the `content` of any message. The same applies to the Copilot import
  parser, which ignores everything except model, timestamp, requests, and cost.
- **Fail-safe.** If a log's format isn't recognised, the source skips it rather
  than guessing — it never dumps unknown content into Toketer.

## The live Copilot estimate reads sizes, not content

The **live Copilot estimate** detects agent turns from edit activity. It is built
to stay within the metadata-only guarantee:

- It reads **only the number of characters** inserted/removed in a change
  (`change.text.length` and `change.rangeLength`) and the **byte size** of newly
  created files — it **never** reads, stores, or transmits the changed text. See
  [`src/sources/copilot-estimate/adapter.ts`](./src/sources/copilot-estimate/adapter.ts).
- It records only a rough token figure, a per-request cost, a timestamp, and the
  label `copilot (estimated)`. No file names, paths, or contents are stored.
- Everything it produces is clearly marked as an estimate (`~`).

## Local-first and offline

Toketer is 100% local and needs no account or backend. Cost is computed on your
machine from a bundled pricing table, and nothing about your activity ever leaves
your editor. The only outbound request Toketer can make is the optional pricing
refresh you trigger with `Toketer: Refresh Pricing Table`, which only downloads
prices.

## Telemetry

Toketer ships with **no analytics or telemetry**.

---

Questions or concerns? Please open an issue — privacy is the whole point of this
project.
