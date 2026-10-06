import * as vscode from 'vscode';
import type { CurrencySetting } from './currency/format';

/** Strongly-typed snapshot of Toketer's user settings. */
export interface ToketerSettings {
  readonly currency: CurrencySetting;
  readonly usdToInrRate: number;
  readonly pricingApiBaseUrl: string;
  readonly claudeCodeEnabled: boolean;
  readonly claudeCodeLogPath: string;
  readonly copilotEstimateEnabled: boolean;
  readonly copilotEstimatePricePerRequestUsd: number;
}

/** Root section used by all Toketer settings in `package.json`. */
const SECTION = 'toketer';

/**
 * Read the current Toketer settings from the VS Code configuration.
 * @returns A typed, validated snapshot of the user's settings.
 */
export function readSettings(): ToketerSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  const rate = config.get<number>('usdToInrRate', 83);
  return {
    currency: config.get<CurrencySetting>('currency', 'auto'),
    usdToInrRate: rate > 0 ? rate : 83,
    pricingApiBaseUrl: config.get<string>('pricing.apiBaseUrl', 'https://api.toketer.dev'),
    claudeCodeEnabled: config.get<boolean>('sources.claudeCode.enabled', true),
    claudeCodeLogPath: config.get<string>('sources.claudeCode.logPath', ''),
    copilotEstimateEnabled: config.get<boolean>('sources.copilotEstimate.enabled', true),
    copilotEstimatePricePerRequestUsd: config.get<number>(
      'sources.copilotEstimate.pricePerRequestUsd',
      0.04,
    ),
  };
}

/**
 * Persist the chosen display currency (used by the currency toggle).
 * @param currency The currency setting to store at the global level.
 */
export async function writeCurrency(currency: CurrencySetting): Promise<void> {
  await vscode.workspace
    .getConfiguration(SECTION)
    .update('currency', currency, vscode.ConfigurationTarget.Global);
}
