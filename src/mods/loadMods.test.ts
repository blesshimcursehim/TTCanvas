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

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn().mockResolvedValue(undefined),
  error: vi.fn().mockResolvedValue(undefined),
  info: vi.fn().mockResolvedValue(undefined),
}));

const { loadMods } = await import("./loadMods");

// Known SHA-256 hex digests (verified with `sha256sum`), so trust decisions
// can be asserted against a real, reproducible hash rather than a mock.
const HELLO_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const WORLD_HASH = "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7";

function mockVaultFiles(files: Record<string, string>) {
  invoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    if (cmd === "list_mod_files") return Promise.resolve(Object.keys(files));
    if (cmd === "read_vault_file") {
      const filename = String(args.relativePath).replace(/^mods\//, "");
      if (!(filename in files)) return Promise.reject(new Error("not found"));
      return Promise.resolve(files[filename]);
    }
    return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
  });
}

describe("loadMods", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("returns an untrusted mod's filename/content/hash instead of importing it", async () => {
    mockVaultFiles({ "hello.js": "hello" });

    const untrusted = await loadMods("/vault", () => false);

    expect(untrusted).toEqual([{ filename: "hello.js", content: "hello", hash: HELLO_HASH }]);
  });

  it("does not return a mod whose hash the caller trusts", async () => {
    mockVaultFiles({ "hello.js": "hello" });

    const untrusted = await loadMods("/vault", (hash) => hash === HELLO_HASH);

    expect(untrusted).toEqual([]);
  });

  it("partitions trusted and untrusted mods independently by content hash", async () => {
    mockVaultFiles({ "hello.js": "hello", "world.js": "world" });

    const untrusted = await loadMods("/vault", (hash) => hash === HELLO_HASH);

    expect(untrusted).toEqual([{ filename: "world.js", content: "world", hash: WORLD_HASH }]);
  });

  it("trust is keyed on content, not filename - renaming a trusted file still trusts it", async () => {
    mockVaultFiles({ "renamed.js": "hello" });

    const untrusted = await loadMods("/vault", (hash) => hash === HELLO_HASH);

    expect(untrusted).toEqual([]);
  });

  it("trust is keyed on content, not filename - editing a trusted file's content re-flags it", async () => {
    mockVaultFiles({ "hello.js": "hello, but edited" });

    const untrusted = await loadMods("/vault", (hash) => hash === HELLO_HASH);

    expect(untrusted).toHaveLength(1);
    expect(untrusted[0].filename).toBe("hello.js");
  });

  it("skips a mod file it fails to read without throwing or reporting it as untrusted", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "list_mod_files") return Promise.resolve(["broken.js"]);
      if (cmd === "read_vault_file") return Promise.reject(new Error("permission denied"));
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    const untrusted = await loadMods("/vault", () => false);

    expect(untrusted).toEqual([]);
  });

  it("returns an empty list for a vault with no mod files", async () => {
    mockVaultFiles({});

    const untrusted = await loadMods("/vault", () => true);

    expect(untrusted).toEqual([]);
  });
});
