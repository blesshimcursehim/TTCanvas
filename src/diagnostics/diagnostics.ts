// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { redact } from "@ttcanvas/core";

/** Open the OS file manager focused on the rotating log file. */
export async function revealLogFile(): Promise<void> {
  const path = await invoke<string>("log_file_path");
  await revealItemInDir(path);
}

/** Last N lines of the log file, for the in-app viewer. */
export function readLogTail(lines = 500): Promise<string> {
  return invoke<string>("read_log_tail", { lines });
}

/** Truncate the log file. */
export function clearLog(): Promise<void> {
  return invoke("clear_log");
}

export interface DiagnosticsMeta {
  version: string;
  /**
   * The schema version the open workspace file itself claims, or null when the field was absent
   * or non-numeric. Deliberately the on-disk value, not the supported one: a read-only workspace
   * is read-only *because* those two differ, so reporting only the supported one says nothing.
   */
  workspaceVersion: number | null;
  /** The schema version this build supports. */
  supportedWorkspaceVersion: number;
  /**
   * True when the open workspace was written by a newer build, so this one renders it but refuses
   * to save over it. Worth reporting: it is exactly the state behind "my changes don't persist".
   */
  workspaceReadOnly: boolean;
  aiProvider: string;
  enabledWidgets: string[];
  disabledWidgets: string[];
  mods: string[];
}

/**
 * Assemble a redacted diagnostics report (metadata + recent log) and let the
 * user save it to a file of their choosing. Nothing is sent anywhere - the
 * user shares the file manually. Returns true if a file was written.
 */
export async function exportDiagnostics(meta: DiagnosticsMeta, secrets: string[] = []): Promise<boolean> {
  const tail = await readLogTail(1000);
  const header = [
    "TTCanvas diagnostics report",
    `Generated: ${new Date().toISOString()}`,
    `App version: ${meta.version}`,
    `Workspace schema: file ${meta.workspaceVersion === null ? "unversioned" : `v${meta.workspaceVersion}`}`
      + `, supported v${meta.supportedWorkspaceVersion}`
      + (meta.workspaceReadOnly ? " (open READ-ONLY - written by a newer build)" : ""),
    `Platform: ${navigator.userAgent}`,
    `AI provider: ${meta.aiProvider}`,
    `Enabled widgets: ${meta.enabledWidgets.join(", ") || "(none)"}`,
    `Disabled widgets: ${meta.disabledWidgets.join(", ") || "(none)"}`,
    `Mods: ${meta.mods.join(", ") || "(none)"}`,
  ].join("\n");

  // Final redaction sweep over the whole report - covers Rust-origin log lines
  // (e.g. panics with absolute paths) that did not pass through the JS logger.
  const content = redact(`${header}\n\n=== RECENT LOG ===\n${tail || "(log is empty)"}\n`, secrets);

  return invoke<boolean>("save_text_file", {
    content,
    defaultName: "ttcanvas-diagnostics.txt",
  });
}
