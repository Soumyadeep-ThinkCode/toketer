import * as vscode from 'vscode';

/**
 * Resolves where Claude Code stores its session logs. The location is NOT
 * guaranteed stable, so we return an ordered list of *candidate* directories and
 * let the adapter pick the first one that actually exists.
 *
 * Candidates (in priority order):
 *   1. an explicit user override (setting `toketer.sources.claudeCode.logPath`)
 *   2. `$CLAUDE_CONFIG_DIR/projects`
 *   3. `~/.claude/projects`            (most common)
 *   4. `~/.config/claude/projects`     (XDG-style installs)
 *
 * Home resolution uses `process.env` (USERPROFILE on Windows, HOME elsewhere)
 * rather than Node's `os` module, keeping Toketer free of native dependencies so it
 * also runs in Cursor / VSCodium.
 */

/** Return the user's home directory, or `undefined` if it can't be determined. */
function homeDir(): string | undefined {
  return process.env.USERPROFILE || process.env.HOME || undefined;
}

/**
 * Build the ordered list of candidate Claude Code `projects` directories.
 * @param overridePath Optional user-provided path (treated as a projects dir).
 * @returns Candidate directory URIs, most-preferred first.
 */
export function claudeProjectDirCandidates(overridePath: string): vscode.Uri[] {
  const candidates: vscode.Uri[] = [];

  const override = overridePath.trim();
  if (override.length > 0) {
    candidates.push(vscode.Uri.file(override));
  }

  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (configDir) {
    candidates.push(vscode.Uri.joinPath(vscode.Uri.file(configDir), 'projects'));
  }

  const home = homeDir();
  if (home) {
    const homeUri = vscode.Uri.file(home);
    candidates.push(vscode.Uri.joinPath(homeUri, '.claude', 'projects'));
    candidates.push(vscode.Uri.joinPath(homeUri, '.config', 'claude', 'projects'));
  }

  return candidates;
}

/**
 * Return the first candidate directory that exists on disk, or `undefined`.
 * @param candidates Ordered candidate directories.
 */
export async function firstExistingDir(
  candidates: readonly vscode.Uri[],
): Promise<vscode.Uri | undefined> {
  for (const dir of candidates) {
    try {
      const stat = await vscode.workspace.fs.stat(dir);
      if (stat.type & vscode.FileType.Directory) {
        return dir;
      }
    } catch {
      // Not found / not accessible — try the next candidate.
    }
  }
  return undefined;
}
