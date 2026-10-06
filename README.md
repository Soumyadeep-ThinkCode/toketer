# Toketer — your AI fuel gauge ⛽

**See how many tokens each AI prompt used and what it cost — live, right inside your editor.**

Toketer is a tiny status-bar meter that shows your AI coding spend at a glance. No
website, no login, no setup. Install it and the meter appears immediately.

- 🟢 **Zero config** — works the instant you install it.
- 🔒 **Private by design** — metadata only. Toketer never reads or sends your code, files, or prompts.
- 🧮 **Offline-first** — costs are computed locally from a bundled pricing table.
- 🌍 **Works in VS Code _and_ Cursor** — no native modules, only public editor APIs.
- 🆓 **Free, local, and offline** — no account or backend needed.

---

## 💬 Real-time cost in the chat panel: just type `@toketer`

Most developers live in the right-side chat panel and want the cost of **every
prompt, live**. Toketer does this with a **chat participant**: type **`@toketer`** before
your prompt (it's "sticky", so you type it once and stay on Toketer).

```
@toketer explain what a closure is
```

Toketer forwards your prompt to **the model you picked in the panel's dropdown**,
streams the answer straight back into the panel, and updates the meter with the
**real model + real token counts — every prompt, in real time.**

**The honest caveat:** Toketer can only meter turns sent to `@toketer`. It **cannot** read
the *default* Copilot turn (no public API exposes another extension's AI usage to
third parties — this is a platform limit no extension can get around). So chat
with `@toketer` when you want live cost tracking. On hosts without the chat API (some
Cursor/VSCodium builds) this feature is skipped and the other sources still work.

---

## What it looks like

- **Status bar:** `⛽ Toketer: $0.15 today` (or `₹12.40 today`). Click it to open the panel.
- **Cost panel:** this session's cost, today's cost, a per-model bar chart, and your
  most recent prompts with individual token counts and costs — all in plain language.

When your editor doesn't report exact tokens, Toketer shows a clearly-labelled
estimate (a `~` prefix and an `est` badge). **Toketer never shows a fabricated
precise number.**

---

## The honest bit: where numbers come from (and their limits)

## Automatic sources — where Toketer gets your usage

Toketer captures AI usage **automatically** from the places developers actually spend
tokens, and feeds it all into the same meter. It's honest about precision: some
sources are exact, others are necessarily estimates or manual imports.

| Source | How captured | Precision | Setup |
| --- | --- | --- | --- |
| **`@toketer` chat participant** | Type `@toketer <prompt>` in the chat panel. Toketer forwards it to your selected model and records real tokens per prompt. | ✅ **Exact & real-time** | **Zero** — just type `@toketer`. |
| **Claude Code** | Reads your local Claude Code session logs (`~/.claude/projects`) and records each turn's token usage. | ✅ **Exact & automatic** | **Zero** — just works if Claude Code is installed. |
| **GitHub Copilot (live estimate)** | On by default. No public API exposes Copilot's tokens, so Toketer detects each agent **turn** from the edits it makes (reading only the *size* of each change, never content), counts it as one premium request, and announces `~cost · ~tokens` in the status bar right after the turn. | ⚠️ **Approximate, labelled `~`** | **Zero** — on by default. |
| **GitHub Copilot (import)** | One-click import of the usage report from GitHub billing for **exact** cost. Toketer remembers your last import and gently reminds you when it's stale. | ✅ **Exact** (periodic) | One click: `Toketer: Import Copilot Usage`. |
| **Your own prompts** (`Toketer: Ask AI`) | Sends a prompt through VS Code's Language Model API and records the real model + real token counts. | ✅ Exact | Run the command; pick a model. |
| **Companion tools** (`toketer.recordAiActivity`, `vscode://toketer.toketer/activity`) | A CLI/agent/extension reports metadata it already knows. | Exact **or** estimate, as declared | Integrate once. |
| **Native Cursor / Copilot chat** | ❌ No public API exposes another editor/extension's AI token usage. | Not available | — |

Why the honesty? Third-party extensions **cannot** silently observe another
extension's AI usage (e.g. Copilot Chat's or Cursor's native AI) through any
public API. So Toketer captures what it *can* read locally and clearly labels the
rest. Open **`Toketer: Sources`** any time to see each source's live status.

See [PRIVACY.md](./PRIVACY.md) for the data guarantee and
[CONTRIBUTING.md](./CONTRIBUTING.md) for the architecture.

### Two audiences, served honestly: Claude Code (exact live) vs. GitHub Copilot

Toketer covers both without faking precision it doesn't have:

- **Claude Code users get EXACT cost, automatically and live** from local session logs.
- **GitHub Copilot users get a LIVE ESTIMATE, plus EXACT import.** Copilot runs
  inside Copilot and **never exposes its token usage to any third-party
  extension** — a hard VS Code platform limit. So Toketer does two honest things:
  - **Live estimate (on by default):** it detects each agent **turn** from the
    file edits the agent makes (reading only the *size* of each change, never the
    content), counts it as **one Copilot premium request** (Copilot bills per
    request, not per token), and — right after the turn settles — announces
    `~cost · ~token range (guess)` in the **status bar** and adds a
    `~ copilot (estimated)` row to the panel. Tokens are shown as a **range
    labelled "guess"** (e.g. `~1k–3k`), never a fake precise number, because the
    agent's hidden context is invisible to us. Think of it as a gauge, not a bill.
  - **Exact import:** run **`Toketer: Import Copilot Usage`** with the report from
    **GitHub → Settings → Billing → Copilot → Usage** for the precise figures.
    Toketer remembers your last import and reminds you (at most weekly) when stale.
- **Want exact live per-prompt cost?** Type **`@toketer`** in chat — those are Toketer's
  own requests, so it meters the real tokens.

> **Why can't the estimate appear inside Copilot's reply?** Because that reply is
> rendered by Copilot, not Toketer — no extension can write into another
> participant's response. That's why the estimate shows in the status bar + panel.

### Where to get the Copilot usage report

GitHub → **Settings → Billing & licensing → Copilot → Usage → Download usage
report**. Save the CSV (or JSON), then run **`Toketer: Import Copilot Usage`** and
pick the file. Re-importing is safe — already-seen rows are skipped.

### Feeding Toketer activity

Any tool can record a metadata-only event. From another extension:

```ts
await vscode.commands.executeCommand('toketer.recordAiActivity', {
  modelId: 'gpt-4o',
  promptTokens: 1200,
  completionTokens: 800,
  isEstimate: false, // omit or set true if these are estimates
});
```

Or via a deep link from a CLI/agent (all parameters are metadata only):

```
vscode://toketer.toketer/activity?model=gpt-4o&prompt=1200&completion=800&estimate=0
```

---

## Commands

All commands are available from the Command Palette under **Toketer**:

| Command | What it does |
| --- | --- |
| `Toketer: Open Cost Panel` | Opens the cost panel (also opens on meter click). |
| `Toketer: Sources` | Shows each automatic source and its live status, with one-click actions. |
| `Toketer: Import Copilot Usage` | Imports a GitHub Copilot usage report (CSV/JSON) you downloaded from billing. |
| `Toketer: Ask AI (real tokens)` | Sends a prompt you type through VS Code's Language Model API and records the real model + real token counts. You choose which model. |
| `Toketer: Toggle Currency (₹ / $)` | Switches the display currency. |
| `Toketer: Refresh Pricing Table` | Fetches up-to-date prices from the Toketer API (optional). |
| `Toketer: Clear Local Activity History` | Deletes locally stored metadata events. |

## Does Toketer work in Cursor and other editors?

Toketer is a standard VS Code extension that uses **no native Node modules**, so it
installs and runs in **VS Code, Cursor, VSCodium, and other VS Code-based
editors**. The meter, panel, and commands work everywhere.

However, **no editor — VS Code or Cursor — exposes its *native* AI chat's token
usage to third-party extensions.** So Toketer cannot silently meter the Copilot Chat
panel or Cursor's built-in AI. It meters activity that is **reported to it**:
your own `Toketer: Ask AI` requests, or events pushed by a companion tool/agent via
the command or URI handshake above. Non-VS-Code tools cannot load a `.vsix` at
all.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `toketer.currency` | `auto` | `auto`, `USD`, or `INR`. `auto` picks ₹/$ from your locale. |
| `toketer.usdToInrRate` | `83` | Exchange rate used to display INR. |
| `toketer.sources.claudeCode.enabled` | `true` | Automatically read Claude Code local logs for exact token usage (metadata only). |
| `toketer.sources.claudeCode.logPath` | `""` | Optional override for the Claude Code `projects` logs folder. Empty = auto-detect. |
| `toketer.sources.copilotEstimate.enabled` | `true` | Show a live, clearly-labelled **estimate** of Copilot cost from agent turns (on by default). |
| `toketer.sources.copilotEstimate.pricePerRequestUsd` | `0.04` | USD price per Copilot premium request, used by the live estimate. |
| `toketer.pricing.apiBaseUrl` | `https://api.toketer.dev` | Base URL used by `Toketer: Refresh Pricing Table` (optional; Toketer works fully offline). |

---

## Development

```bash
npm install
npm run watch     # bundle with esbuild in watch mode
# then press F5 in VS Code to launch the Extension Development Host
npm test          # run the unit tests (vitest)
npm run typecheck # strict TypeScript check
npm run lint      # ESLint
npm run vsce:package # produce a .vsix
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for a plain-English tour of the code and
a list of good first issues.

## License

[MIT](./LICENSE). Toketer is open source — contributions welcome!
