import * as vscode from 'vscode';
import { buildActivityEvent, type RawActivityInput } from '../attribution/event-builder';
import type { AiActivityEvent } from '../model/activity';
import type { PricingProvider } from '../pricing/pricing-loader';
import type { ActivityStore } from '../store/activity-store';

/**
 * Central entry point for recording AI activity.
 *
 * Every ingestion source (the public command, the URI handshake, and the
 * automatic sources) funnels through {@link ActivityRecorder.record}, which
 * builds a metadata-only event and stores it locally. Everything is local —
 * nothing is sent anywhere.
 */
export class ActivityRecorder {
  constructor(
    private readonly store: ActivityStore,
    private readonly pricing: PricingProvider,
  ) {}

  /**
   * Record a single AI interaction from metadata-only input.
   *
   * The repo *name* (never a path) is filled in from the active workspace folder
   * when the caller does not supply one, so events can be grouped by project.
   *
   * @param input Metadata-only description of the interaction.
   * @returns The stored, fully-built metadata event (handy for per-prompt UI).
   */
  async record(input: RawActivityInput): Promise<AiActivityEvent> {
    const event = buildActivityEvent(
      { ...input, repoName: input.repoName ?? currentRepoName() },
      {
        pricingTable: this.pricing.getTable(),
        appName: vscode.env.appName,
        now: Date.now,
        newId: () => crypto.randomUUID(),
      },
    );

    this.store.add(event);
    return event;
  }
}

/**
 * The folder *name* of the first workspace folder, used as a grouping label.
 * Returns `undefined` when no folder is open. Never returns a path.
 */
function currentRepoName(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].name : undefined;
}
