// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { invoke } from "@tauri-apps/api/core";
import { registerModWidget, clearModWidgets } from "../registry";
import type { WidgetDefinition } from "../registry";
import { logWarn } from "../diagnostics/log";

interface ModExports {
  definition: Omit<WidgetDefinition, "component">;
  default: WidgetDefinition["component"];
}

export interface ScannedMod {
  filename: string;
  content: string;
  /** SHA-256 hex digest of `content`, used as the trust key. */
  hash: string;
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Imports and registers one already-trusted mod file. Never throws - a broken mod is skipped with a warning. */
export async function importMod(filename: string, content: string): Promise<void> {
  let blobUrl: string | null = null;
  try {
    const blob = new Blob([content], { type: "application/javascript" });
    blobUrl = URL.createObjectURL(blob);
    const mod: ModExports = await import(/* @vite-ignore */ blobUrl);
    if (mod.definition && mod.default) {
      registerModWidget({ ...mod.definition, component: mod.default }, filename);
    } else {
      logWarn(`Mod "${filename}" missing required exports (definition, default)`);
    }
  } catch (err) {
    logWarn(`Failed to load mod "${filename}": ${String(err)}`);
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Scans every mod file in the vault, importing and registering only the ones
 * `isTrusted` approves. Mods run in the main webview with the same DOM and
 * Tauri IPC access as TTCanvas itself, so an unrecognised mod is never
 * imported automatically - it comes back in the returned list instead, for
 * the caller to prompt the user about before adding its hash to the trust
 * list and loading it (see `importMod`).
 */
export async function loadMods(
  vaultPath: string,
  isTrusted: (hash: string) => boolean,
): Promise<ScannedMod[]> {
  clearModWidgets();

  const files = await invoke<string[]>("list_mod_files", { vaultPath });
  const untrusted: ScannedMod[] = [];

  for (const filename of files) {
    let content: string;
    try {
      content = await invoke<string>("read_vault_file", {
        vaultPath,
        relativePath: `mods/${filename}`,
      });
    } catch (err) {
      logWarn(`Failed to read mod "${filename}": ${String(err)}`);
      continue;
    }
    const hash = await sha256Hex(content);
    if (isTrusted(hash)) {
      await importMod(filename, content);
    } else {
      untrusted.push({ filename, content, hash });
    }
  }

  return untrusted;
}
