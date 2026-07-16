// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { pushRecentVault, parentDir, loadAppConfig } = await import("./appConfig");
type AppConfig = import("./appConfig").AppConfig;

const AI_DEFAULTS = { aiProvider: "ollama" as const, aiBaseUrl: "", aiApiKey: "", aiModel: null, playerWindowX: null, playerWindowY: null, playerWindowW: null, playerWindowH: null, customConditions: [] as import("./appConfig").CustomCondition[], theme: "dark-vellum" as const, accent: "amber" as const, density: "comfortable" as const, reduceMotion: false, clockFormat: "system" as const, trustedModHashes: [] as string[] };
const empty: AppConfig = { recentVaults: [], lastBrowsePath: null, ...AI_DEFAULTS };

describe("pushRecentVault", () => {
  it("adds a new vault to an empty config", () => {
    const result = pushRecentVault(empty, "/vaults/Campaign1");
    expect(result.recentVaults).toEqual(["/vaults/Campaign1"]);
  });

  it("puts the new vault first", () => {
    const config: AppConfig = { recentVaults: ["/a", "/b"], lastBrowsePath: null, ...AI_DEFAULTS };
    const result = pushRecentVault(config, "/c");
    expect(result.recentVaults[0]).toBe("/c");
  });

  it("deduplicates: re-opening an existing vault moves it to front", () => {
    const config: AppConfig = { recentVaults: ["/a", "/b", "/c"], lastBrowsePath: null, ...AI_DEFAULTS };
    const result = pushRecentVault(config, "/b");
    expect(result.recentVaults).toEqual(["/b", "/a", "/c"]);
  });

  it("caps the list at 5 entries", () => {
    const config: AppConfig = {
      recentVaults: ["/a", "/b", "/c", "/d", "/e"],
      lastBrowsePath: null,
      ...AI_DEFAULTS,
    };
    const result = pushRecentVault(config, "/f");
    expect(result.recentVaults).toHaveLength(5);
    expect(result.recentVaults[0]).toBe("/f");
    expect(result.recentVaults).not.toContain("/e");
  });

  it("does not mutate the original config", () => {
    const config: AppConfig = { recentVaults: ["/a"], lastBrowsePath: null, ...AI_DEFAULTS };
    pushRecentVault(config, "/b");
    expect(config.recentVaults).toEqual(["/a"]);
  });

  it("preserves lastBrowsePath from the original config", () => {
    const config: AppConfig = { recentVaults: [], lastBrowsePath: "/home/user", ...AI_DEFAULTS };
    const result = pushRecentVault(config, "/vaults/X");
    expect(result.lastBrowsePath).toBe("/home/user");
  });
});

describe("parentDir", () => {
  it("returns the parent of a Unix path", () => {
    expect(parentDir("/home/user/Campaigns/MyVault")).toBe("/home/user/Campaigns");
  });

  it("returns the parent of a Windows-style path", () => {
    expect(parentDir("C:\\Users\\GM\\Campaigns\\MyVault")).toBe("C:/Users/GM/Campaigns");
  });

  it("handles a single-level path gracefully", () => {
    const result = parentDir("/MyVault");
    // Should not throw; result is some string
    expect(typeof result).toBe("string");
  });

  it("strips the trailing folder name", () => {
    const result = parentDir("/a/b/c");
    expect(result).not.toMatch(/c$/);
    expect(result).toBe("/a/b");
  });
});

describe("loadAppConfig", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("passes a well-formed config through unchanged", async () => {
    invoke.mockResolvedValue({
      recentVaults: ["/vaults/A"],
      lastBrowsePath: "/vaults",
      aiProvider: "openai",
      theme: "dark-amber",
    });

    const { config, recovered } = await loadAppConfig();

    expect(config.recentVaults).toEqual(["/vaults/A"]);
    expect(config.aiProvider).toBe("openai");
    expect(config.theme).toBe("dark-amber");
    expect(recovered).toBe(false);
  });

  it("falls back to per-field defaults when a field has the wrong type", async () => {
    // A hand-edited config.json with a string where an array belongs
    // shouldn't crash - it should degrade to that one field's default.
    invoke.mockResolvedValue({ recentVaults: "not-an-array", theme: "dark-vellum" });

    const { config } = await loadAppConfig();

    expect(config.recentVaults).toEqual([]);
    expect(config.theme).toBe("dark-vellum");
  });

  it("rejects an unrecognised enum value and falls back to the default", async () => {
    invoke.mockResolvedValue({ aiProvider: "not-a-real-provider" });

    const { config } = await loadAppConfig();

    expect(config.aiProvider).toBe("ollama");
  });

  it("returns full defaults for a completely empty object", async () => {
    invoke.mockResolvedValue({});

    const { config, recovered } = await loadAppConfig();

    expect(config.recentVaults).toEqual([]);
    expect(config.trustedModHashes).toEqual([]);
    expect(recovered).toBe(false);
  });

  it("surfaces the Rust-side recovered flag without treating it as a config field", async () => {
    invoke.mockResolvedValue({ recentVaults: [], lastBrowsePath: null, recovered: true, backedUp: true });

    const { recovered, backedUp } = await loadAppConfig();

    expect(recovered).toBe(true);
    expect(backedUp).toBe(true);
  });

  it("reports backedUp as false when Rust couldn't secure a backup copy", async () => {
    invoke.mockResolvedValue({ recentVaults: [], lastBrowsePath: null, recovered: true, backedUp: false });

    const { recovered, backedUp } = await loadAppConfig();

    expect(recovered).toBe(true);
    expect(backedUp).toBe(false);
  });
});
