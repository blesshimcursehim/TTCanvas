// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { VaultContext, ToastContext, useNpcs } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { NpcProvider } from "./NpcProvider";

afterEach(cleanup);

function NpcConsumer() {
  const { npcs, loading } = useNpcs();
  return <div data-testid="count">{loading ? "loading" : npcs.length}</div>;
}

describe("NpcProvider", () => {
  it("toasts an error and leaves the list empty when the whole-vault scan fails", async () => {
    const vault = {
      vaultPath: "/v",
      vaultVersion: 1,
      otherVaults: [],
      listFiles: async () => {
        throw new Error("permission denied");
      },
      readFile: async () => "",
    } as unknown as VaultContextValue;
    const showToast = vi.fn();

    render(
      <VaultContext.Provider value={vault}>
        <ToastContext.Provider value={{ showToast }}>
          <NpcProvider>
            <NpcConsumer />
          </NpcProvider>
        </ToastContext.Provider>
      </VaultContext.Provider>,
    );

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't read the NPC library"),
      "error",
    ));
  });
});
