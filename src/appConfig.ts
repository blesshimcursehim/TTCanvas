// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { AIProvider } from "@ttcanvas/core";

export interface CustomCondition {
  name: string;
  color?: string;
}

export interface AIConfigPatch {
  aiProvider?: import("@ttcanvas/core").AIProvider;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string | null;
}

export type AppTheme = "dark-vellum" | "dark-amber";
export type AppAccent = "amber" | "plum" | "moss" | "ink";
export type AppDensity = "compact" | "comfortable" | "spacious";
/** "system" follows the OS's own 12h/24h preference, which is the default. */
export type AppClockFormat = "system" | "24h" | "12h";
/**
 * How large the interface is drawn. Distinct from `density`, which only changes padding and gaps
 * and so can't help someone who simply can't read 12px type at arm's length.
 */
export type AppInterfaceScale = "normal" | "large" | "larger";

/** Zoom factor per interface scale, applied to the webview itself. */
export const INTERFACE_SCALE_FACTOR: Record<AppInterfaceScale, number> = {
  normal: 1,
  large: 1.15,
  larger: 1.3,
};

export interface AppConfig {
  recentVaults: string[];
  lastBrowsePath: string | null;
  aiProvider: AIProvider;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string | null;
  playerWindowX: number | null;
  playerWindowY: number | null;
  playerWindowW: number | null;
  playerWindowH: number | null;
  customConditions: CustomCondition[];
  theme: AppTheme;
  accent: AppAccent;
  density: AppDensity;
  reduceMotion: boolean;
  clockFormat: AppClockFormat;
  interfaceScale: AppInterfaceScale;
  /** Read across a table or off a projector, so it is sized separately from the GM's screen. */
  playerTextScale: AppInterfaceScale;
  /**
   * SHA-256 hashes (hex) of mod file content the user has explicitly approved
   * to run. Mods share the main webview's DOM and IPC access, so untrusted
   * ones are never imported - see loadMods.ts.
   */
  trustedModHashes: string[];
}

// ---------------------------------------------------------------------------
// Zod schema - validated on every config load so a hand-edited or partially
// written file degrades gracefully (bad field type -> per-field default)
// instead of producing a value that crashes later application code. Mirrors
// the pattern in workspace.ts. The Rust side (`load_app_config`) already
// recovers from missing/unreadable/malformed *files*; this covers valid JSON
// with the wrong shape.
// ---------------------------------------------------------------------------

const CustomConditionSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
});

const AppConfigSchema = z.object({
  recentVaults: z.array(z.string()).catch([]),
  lastBrowsePath: z.string().nullable().catch(null),
  aiProvider: z.enum(["ollama", "openai"]).catch("ollama"),
  aiBaseUrl: z.string().catch(""),
  aiApiKey: z.string().catch(""),
  aiModel: z.string().nullable().catch(null),
  playerWindowX: z.number().nullable().catch(null),
  playerWindowY: z.number().nullable().catch(null),
  playerWindowW: z.number().nullable().catch(null),
  playerWindowH: z.number().nullable().catch(null),
  customConditions: z.array(CustomConditionSchema).catch([]),
  theme: z.enum(["dark-vellum", "dark-amber"]).catch("dark-vellum"),
  accent: z.enum(["amber", "plum", "moss", "ink"]).catch("amber"),
  density: z.enum(["compact", "comfortable", "spacious"]).catch("comfortable"),
  reduceMotion: z.boolean().catch(false),
  clockFormat: z.enum(["system", "24h", "12h"]).catch("system"),
  interfaceScale: z.enum(["normal", "large", "larger"]).catch("normal"),
  playerTextScale: z.enum(["normal", "large", "larger"]).catch("normal"),
  trustedModHashes: z.array(z.string()).catch([]),
}) satisfies z.ZodType<AppConfig>;

export interface LoadedAppConfig {
  config: AppConfig;
  /** True when the saved config couldn't be read as-is and was reset to defaults. */
  recovered: boolean;
  /** True when `recovered` is set and a copy of the unreadable file was actually saved. */
  backedUp: boolean;
}

export async function loadAppConfig(): Promise<LoadedAppConfig> {
  const raw = await invoke<Record<string, unknown>>("load_app_config");
  return {
    config: AppConfigSchema.parse(raw),
    recovered: raw.recovered === true,
    backedUp: raw.backedUp === true,
  };
}

// A single `config` object crosses the IPC boundary here (Rust's `AppConfigInput`
// mirrors this shape field-for-field) rather than one argument per field, so
// adding an `AppConfig` field doesn't also mean adding a Tauri command argument.
export function saveAppConfig(config: AppConfig): Promise<void> {
  return invoke("save_app_config", { config });
}

export function pushRecentVault(config: AppConfig, newVaultPath: string): AppConfig {
  const deduped = [newVaultPath, ...config.recentVaults.filter((v) => v !== newVaultPath)];
  return { ...config, recentVaults: deduped.slice(0, 5) };
}

export function parentDir(vaultPath: string): string {
  const parts = vaultPath.split(/[\\/]/);
  parts.pop();
  return parts.join("/") || vaultPath;
}
