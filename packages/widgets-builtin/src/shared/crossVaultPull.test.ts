// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, vi } from "vitest";
import { pullSingletonBundle, copyVaultAssets } from "./crossVaultPull";
import { BUNDLE_VERSION } from "./importExport";

describe("pullSingletonBundle", () => {
  it("rebuilds the export bundle from a foreign singleton and feeds it to importText", async () => {
    const foreignState = { entries: [{ id: "a", name: "Goblin" }], folders: [] };
    const readForeignSingleton = vi.fn().mockResolvedValue(foreignState);
    const importText = vi.fn();

    const pulled = await pullSingletonBundle(
      readForeignSingleton,
      "/vaults/source",
      "bestiary",
      "ttcanvas-bestiary",
      (s) => {
        const st = s as typeof foreignState;
        return st.entries.length ? { entries: st.entries, folders: st.folders } : null;
      },
      importText,
    );

    expect(pulled).toBe(true);
    // Reads the singleton key, not the bundle type.
    expect(readForeignSingleton).toHaveBeenCalledWith("/vaults/source", "bestiary");
    // The serialized bundle carries the envelope type + version around the collection.
    const bundle = JSON.parse(importText.mock.calls[0][0] as string);
    expect(bundle).toEqual({
      type: "ttcanvas-bestiary",
      version: BUNDLE_VERSION,
      entries: foreignState.entries,
      folders: [],
    });
  });

  it("returns false and never imports when the foreign vault has nothing", async () => {
    const readForeignSingleton = vi.fn().mockResolvedValue(undefined);
    const importText = vi.fn();

    const pulled = await pullSingletonBundle(
      readForeignSingleton,
      "/vaults/source",
      "bestiary",
      "ttcanvas-bestiary",
      () => null,
      importText,
    );

    expect(pulled).toBe(false);
    expect(importText).not.toHaveBeenCalled();
  });
});

describe("copyVaultAssets", () => {
  it("copies each unique asset from the source folder to the same relative path", async () => {
    const readFileBase64 = vi.fn().mockResolvedValue("YmFzZTY0");
    const writeFileBase64 = vi.fn().mockResolvedValue(undefined);

    await copyVaultAssets(
      "/vaults/source",
      ["portraits/a.jpg", "portraits/a.jpg", "portraits/b.jpg"],
      readFileBase64,
      writeFileBase64,
    );

    // Deduped: two distinct files, read from the source vault's folder...
    expect(readFileBase64).toHaveBeenCalledTimes(2);
    expect(readFileBase64).toHaveBeenCalledWith("/vaults/source/portraits", "a.jpg");
    // ...and written back to the current vault at the identical relative path.
    expect(writeFileBase64).toHaveBeenCalledWith("portraits/a.jpg", "YmFzZTY0");
  });

  it("skips a missing source asset without throwing", async () => {
    const readFileBase64 = vi
      .fn()
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce("YmFzZTY0");
    const writeFileBase64 = vi.fn().mockResolvedValue(undefined);

    await expect(
      copyVaultAssets("/vaults/source", ["portraits/missing.jpg", "portraits/there.jpg"], readFileBase64, writeFileBase64),
    ).resolves.toBeUndefined();

    // Only the readable one gets written.
    expect(writeFileBase64).toHaveBeenCalledTimes(1);
    expect(writeFileBase64).toHaveBeenCalledWith("portraits/there.jpg", "YmFzZTY0");
  });
});
