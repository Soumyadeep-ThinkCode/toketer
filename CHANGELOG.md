# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-10-06

### Added

- Live AI cost meter in the status bar (today's total; click to open the panel).
- Cost panel webview: session total, today total, per-model bar chart, recent
  prompts, and a currency toggle (₹ / $).
- **Automatic input sources** that feed the existing meter with zero/one-click setup:
  - **`@toketer` chat participant** — type `@toketer` in the chat panel for real-time,
    per-prompt token cost using the model you selected.
  - **Claude Code** auto-reader — detects local session logs and records exact
    token usage automatically (metadata only).
  - **GitHub Copilot live estimate** (on by default) — detects each agent turn
    from edit activity (size only, never content), counts it as one premium
    request, and announces `~cost · ~tokens` in the status bar + panel.
  - **GitHub Copilot import** (`Toketer: Import Copilot Usage`) — one-click import of
    the usage report from GitHub billing; records exact cost, de-duplicated, with
    a gentle periodic reminder to re-import when stale.
- **`Toketer: Sources`** diagnostics panel showing each source's live status with
  one-click actions, plus a one-time, dismissible welcome notice.
- `Toketer: Ask AI (real tokens)` — send a prompt through VS Code's Language Model
  API and record the real model + real token counts (you choose the model).
- Additive, backward-compatible ingestion fields (`timestampMs`, `costUsdOverride`)
  so historical/billing records land on the right day with exact cost.
- Metadata-only activity model with a hard privacy guarantee.
- Local-first, offline pricing table and cost math; optional remote refresh.
- Locale-aware currency formatting (USD/INR) with honest estimate labelling.
- Public ingestion API (`toketer.recordAiActivity`) and URI handshake
  (`vscode://toketer.toketer/activity`).
- Unit tests for pricing, attribution, currency, aggregation, query parsing,
  the Claude Code + Copilot parsers, and dedupe.
