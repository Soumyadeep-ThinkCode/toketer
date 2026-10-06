import { createDefaultPricingTable, type PricingEntry, type PricingTable } from './pricing-table';

/** Shape of the JSON returned by the Toketer pricing endpoint. */
interface RemotePricingPayload {
  entries?: PricingEntry[];
}

/**
 * Holds the pricing table currently in effect and allows it to be refreshed
 * from the Toketer API. It always starts from the bundled offline defaults, so the
 * extension is fully functional with no network connection.
 */
export class PricingProvider {
  private table: PricingTable;

  /**
   * @param now Clock injected for deterministic tests.
   * @param initial Optional starting table (defaults to the bundled table).
   */
  constructor(
    private readonly now: () => number = Date.now,
    initial?: PricingTable,
  ) {
    this.table = initial ?? createDefaultPricingTable(this.now());
  }

  /** The pricing table currently in effect. */
  getTable(): PricingTable {
    return this.table;
  }

  /** Replace the active table (e.g. after loading a persisted/remote copy). */
  setTable(table: PricingTable): void {
    this.table = table;
  }

  /**
   * Fetch an updated pricing table from the Toketer API.
   *
   * Uses the global `fetch` (available in modern VS Code / Node) so there is no
   * dependency on native Node modules — important for Cursor compatibility. On
   * any failure the current table is kept and the method returns `false`.
   *
   * @param baseUrl Base URL of the Toketer API, e.g. `https://api.toketer.dev`.
   * @returns `true` if the table was refreshed, `false` otherwise.
   */
  async refreshFromRemote(baseUrl: string): Promise<boolean> {
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/pricing`;
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as RemotePricingPayload;
      if (!payload.entries || payload.entries.length === 0) {
        return false;
      }
      this.table = { updatedAtMs: this.now(), entries: payload.entries };
      return true;
    } catch {
      // Offline-first: never let a pricing refresh failure break the meter.
      return false;
    }
  }
}
