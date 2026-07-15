// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { StrictMode } from "react";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { VaultContext, PartyContext } from "@ttcanvas/core";
import type { VaultContextValue, PartyContextValue } from "@ttcanvas/core";
import { RelationshipWeb } from "./RelationshipWeb";
import type { RelationshipWebState } from "./types";

beforeAll(() => {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const vault = {
  vaultPath: "/v",
  vaultVersion: 1,
  listFiles: async (ext: string) => (ext === "json" ? ["npcs/vex.json"] : []),
  readFile: async () => JSON.stringify({ name: "Vex", portrait: "portraits/vex.jpg" }),
  readFileBase64: async () => "BASE64",
} as unknown as VaultContextValue;

const party: PartyContextValue = { members: [] };

afterEach(cleanup);

describe("RelationshipWeb portraits", () => {
  // Regression: under StrictMode (which the app uses), an unmount/remount must not wedge the
  // portrait loader's mount-ref off, or portraits silently never render. Renders in <StrictMode>
  // on purpose - this is the exact condition that hid the bug from the earlier non-strict driver.
  it("renders a linked NPC's portrait as an <image> even under StrictMode", async () => {
    const seeded: RelationshipWebState = {
      nodes: [{ id: "n1", kind: "npc", label: "Vex", ref: "npcs/vex.json", x: 0, y: 0 }],
      edges: [],
      selectedId: null,
    };
    render(
      <StrictMode>
        <VaultContext.Provider value={vault}>
          <PartyContext.Provider value={party}>
            <RelationshipWeb state={seeded} onChange={() => {}} />
          </PartyContext.Provider>
        </VaultContext.Provider>
      </StrictMode>,
    );

    await waitFor(() => expect(document.querySelector("image")).not.toBeNull());
    const img = document.querySelector("image")!;
    expect(img.getAttribute("href")).toBe("data:image/jpeg;base64,BASE64");
  });

  it("falls back to initials for a free-standing node with no portrait", () => {
    const seeded: RelationshipWebState = {
      nodes: [{ id: "f1", kind: "faction", label: "Thieves Guild", ref: null, x: 0, y: 0 }],
      edges: [],
      selectedId: null,
    };
    render(
      <VaultContext.Provider value={vault}>
        <PartyContext.Provider value={party}>
          <RelationshipWeb state={seeded} onChange={() => {}} />
        </PartyContext.Provider>
      </VaultContext.Provider>,
    );
    expect(document.querySelector("image")).toBeNull();
    expect([...document.querySelectorAll('[class*="nodeInitials"]')].some((n) => n.textContent === "TG")).toBe(true);
  });
});
