# Contributing to Toketer

Thanks for your interest! Toketer is intentionally small and easy to understand.
This guide explains the architecture in plain English and how to get going.

## The one job

Toketer shows a developer, live and inside their editor, **how many tokens each AI
prompt used and what it cost** — a fuel gauge for AI coding. Everything in the
codebase serves that single goal, while never touching code or prompt content.

## Golden rules

1. **Metadata only, forever.** Never read, store, log, or transmit source code,
   file contents, diffs, prompts, or responses. See [PRIVACY.md](./PRIVACY.md).
2. **Be honest about precision.** If a number is estimated, label it (`~` / `est`).
   Never display a fabricated precise figure.
3. **Zero-config and offline-first.** The solo meter must work instantly with no
   login, no account, and no network.
4. **No native Node modules.** Toketer must also run in Cursor. Use only the public
   `vscode` API, `fetch`, webviews, and the URI handshake.
5. **Readable over clever.** Small files, single responsibility, a short JSDoc on
   every exported function, meaningful names.

## Architecture at a glance

The code is split so that **pure logic never imports `vscode`** (which makes it
unit-testable without the editor) and only a thin shell talks to the editor.

```
src/
  model/        Shared types. The privacy guarantee lives in the data shape.
  pricing/      Bundled pricing table + cost math + optional remote refresh.  (pure)
  currency/     INR/USD conversion and locale-aware formatting.               (pure)
  attribution/  Map editor labels → vendor/surface; build events.             (pure)
  store/        Aggregation helpers (pure) + the persisted ActivityStore.
  ingest/       Query parsing (pure) + recorder + URI handshake.
  meter/        The status-bar "fuel gauge".                                   (vscode)
  panel/        The webview: view-model (pure) + HTML (pure) + controller.
  sources/      Automatic input sources that feed the recorder:
                base types + registry, claude-code/ (parser is pure), 
                copilot-import/ (parser is pure), copilot-estimate/, 
                and a diagnostics panel (HTML is pure).
  config.ts     Typed reader for user settings.                               (vscode)
  extension.ts  Thin wiring: create services, register commands + handlers.   (vscode)
```

### Data flow

1. A source hands **metadata** to the `ActivityRecorder`. Sources include the
   `toketer.recordAiActivity` command, the `vscode://toketer.toketer/activity` URI, and the
   automatic adapters in `src/sources/` (Claude Code logs, Copilot import).
2. The recorder uses `attribution` to build a complete `AiActivityEvent`
   (normalise model label, detect vendor/surface) and `pricing` to compute cost.
3. The event is saved in the `ActivityStore` (in-memory + `globalState`).
4. The store notifies listeners; the **meter** and **panel** re-render. Everything
   stays local — Toketer v1 never sends your activity anywhere.

### Adding a new automatic source

Sources are deliberately easy to add:

1. Write a **pure parser** that turns a tool's log/export text into
   `CapturedRecord[]` (metadata only — token counts, model, timestamp, maybe an
   exact cost). Put it in `src/sources/<tool>/parser.ts` and unit-test it.
2. Write an **adapter** implementing `SourceAdapter` (`src/sources/<tool>/adapter.ts`)
   that detects the source, reads defensively, de-dupes via `SeenStore`, and
   feeds the `ActivitySink`. It must fail gracefully — never throw.
3. Register it in `src/sources/setup.ts`. That's it — the meter, panel, pricing,
   and the `Toketer: Sources` diagnostics view all pick it up automatically.

### Why logic is kept `vscode`-free

Modules marked *(pure)* above — including every source **parser** — never import
`vscode`, so `vitest` can test them directly in Node. When adding logic, prefer
putting the testable core in a pure module and keeping the editor-facing file thin.

## Getting started

```bash
npm install
npm run watch            # esbuild in watch mode
# press F5 to open the Extension Development Host
```

Try it without any AI tool by sending yourself a test event from the Extension
Development Host's Debug Console or another extension:

```ts
vscode.commands.executeCommand('toketer.recordAiActivity', {
  modelId: 'gpt-4o', promptTokens: 1200, completionTokens: 800, isEstimate: false,
});
```

## Checks before you push

```bash
npm run typecheck    # strict TypeScript
npm run lint         # ESLint
npm run format:check # Prettier
npm test             # vitest unit tests
npm run vsce:package # builds a .vsix (what CI publishes as an artifact)
```

CI runs all of these on every pull request (see
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Tests

Unit tests live next to the code they cover (`*.test.ts`) and focus on the pure
logic: pricing math, attribution mappers, currency/locale formatting,
aggregation, and query parsing. Please add tests when you change this logic.

## Good first issues

- Add more models to the bundled pricing table in
  [`src/pricing/pricing-table.ts`](./src/pricing/pricing-table.ts).
- Add more display currencies (e.g. EUR, GBP) to
  [`src/currency/format.ts`](./src/currency/format.ts).
- Improve vendor/surface detection in
  [`src/attribution/mappers.ts`](./src/attribution/mappers.ts).
- Add a "this week" total to the panel.
- Improve the empty-state copy or panel visuals.

## Code of conduct

Be kind and constructive. We want Toketer to be a welcoming first open-source project
for new contributors.
