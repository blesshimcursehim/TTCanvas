// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemsContext, NpcContext, GazetteerContext, ToastContext, VaultContext } from "@ttcanvas/core";
import type {
  ItemsContextValue, CatalogueItemRef, ItemRef, NpcContextValue,
  GazetteerContextValue, ToastContextValue, VaultContextValue,
} from "@ttcanvas/core";
import { Merchants } from "./Merchants";
import type { Merchant, MerchantsState } from "./types";

afterEach(cleanup);

// Only the export/pull controls touch the vault, and none of these tests open the settings cog.
const VAULT = { vaultPath: "/v", vaultVersion: 1, otherVaults: [] } as unknown as VaultContextValue;

const SWORD: CatalogueItemRef = { id: "i1", name: "Longsword", kind: "weapon", valueCp: 1500 };
const POTION: CatalogueItemRef = { id: "i2", name: "Healing potion", kind: "consumable", valueCp: 5000 };

function merchant(over: Partial<Merchant> = {}): Merchant {
  return {
    id: "m1", name: "Dorn's Forge", kind: "blacksmith",
    priceModifier: 1, buybackModifier: 0.5,
    stock: [{ itemId: "i1", qty: 3 }],
    ...over,
  };
}

function baseState(over: Partial<MerchantsState> = {}): MerchantsState {
  return { merchants: [merchant()], selectedId: "m1", query: "", kindFilter: null, ...over };
}

interface Harness {
  onChange?: (s: MerchantsState) => void;
  grantToParty?: ItemsContextValue["grantToParty"];
  takeFromParty?: ItemsContextValue["takeFromParty"];
  catalogue?: CatalogueItemRef[];
  partyStash?: ItemRef[];
  purseCp?: number;
  showToast?: ToastContextValue["showToast"];
  npcs?: NpcContextValue["npcs"];
  locations?: GazetteerContextValue["locations"];
}

function renderMerchants(state: MerchantsState, h: Harness = {}) {
  const items: ItemsContextValue = {
    itemsFor: () => [],
    catalogue: h.catalogue ?? [SWORD, POTION],
    partyStash: h.partyStash ?? [],
    // Generous by default so affordability only bites in the test that asks for it.
    purseCp: h.purseCp ?? 1_000_000,
    grantToParty: h.grantToParty ?? (() => {}),
    takeFromParty: h.takeFromParty ?? (() => {}),
  };
  const toast: ToastContextValue = { showToast: h.showToast ?? (() => {}) } as ToastContextValue;
  return render(
    <VaultContext.Provider value={VAULT}>
      <ToastContext.Provider value={toast}>
        <ItemsContext.Provider value={items}>
          <NpcContext.Provider value={{ npcs: h.npcs ?? [], loading: false }}>
            <GazetteerContext.Provider value={{ locations: h.locations ?? [], loading: false }}>
              <Merchants state={state} onChange={h.onChange ?? (() => {})} />
            </GazetteerContext.Provider>
          </NpcContext.Provider>
        </ItemsContext.Provider>
      </ToastContext.Provider>
    </VaultContext.Provider>,
  );
}

describe("Merchants - list and selection", () => {
  it("shows a teaching empty state before anything exists", () => {
    renderMerchants(baseState({ merchants: [], selectedId: null }));
    expect(screen.getByText("No merchants yet. Add one, then stock it from your Items catalogue.")).toBeTruthy();
  });

  it("adds a merchant and selects it", () => {
    const onChange = vi.fn();
    renderMerchants(baseState({ merchants: [], selectedId: null }), { onChange });
    fireEvent.click(screen.getByTitle("New merchant"));
    const next = onChange.mock.calls[0][0] as MerchantsState;
    expect(next.merchants).toHaveLength(1);
    expect(next.selectedId).toBe(next.merchants[0].id);
  });

  it("filters by kind chip", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "apothecary" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kindFilter: "apothecary" }));
  });

  it("prompts to pick a merchant when none is selected", () => {
    renderMerchants(baseState({ selectedId: null }));
    expect(screen.getByText("Pick a merchant to see their shelves.")).toBeTruthy();
  });
});

describe("Merchants - stock", () => {
  it("stocks an item from the catalogue by reference", () => {
    const onChange = vi.fn();
    renderMerchants(baseState({ merchants: [merchant({ stock: [] })] }), { onChange });
    fireEvent.change(screen.getByLabelText("Add item to stock"), { target: { value: "i2" } });
    expect(onChange.mock.calls[0][0].merchants[0].stock).toEqual([{ itemId: "i2", qty: 1 }]);
  });

  it("does not offer an item it already stocks", () => {
    renderMerchants(baseState());
    const picker = screen.getByLabelText("Add item to stock") as HTMLSelectElement;
    const values = [...picker.options].map((o) => o.value);
    expect(values).not.toContain("i1");
    expect(values).toContain("i2");
  });

  it("shows a dangling reference as unknown rather than hiding or crashing it", () => {
    renderMerchants(baseState({ merchants: [merchant({ stock: [{ itemId: "gone", qty: 1 }] })] }));
    expect(screen.getByText("Unknown item")).toBeTruthy();
  });

  it("prices from the catalogue, scaled by the merchant's markup", () => {
    renderMerchants(baseState({ merchants: [merchant({ priceModifier: 2 })] }));
    // 1500cp at ×2 is 3000cp, which formatCoin renders as the largest exact coin: 3 pp.
    expect(screen.getByText("3 pp")).toBeTruthy();
  });
});

describe("Merchants - buying", () => {
  it("grants the item to the party at the asking price and decrements stock", () => {
    const grantToParty = vi.fn();
    const onChange = vi.fn();
    renderMerchants(baseState(), { grantToParty, onChange });
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));

    expect(grantToParty).toHaveBeenCalledWith("i1", 1, 1500);
    expect(onChange.mock.calls[0][0].merchants[0].stock[0].qty).toBe(2);
  });

  it("leaves unlimited stock unlimited", () => {
    const onChange = vi.fn();
    renderMerchants(baseState({ merchants: [merchant({ stock: [{ itemId: "i1", qty: null }] })] }), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    // The grant still happens; the shelf just never runs down, so no state write for the qty.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cannot buy a sold-out line", () => {
    renderMerchants(baseState({ merchants: [merchant({ stock: [{ itemId: "i1", qty: 0 }] })] }));
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
  });

  // The "warn, don't block" decision, made executable. TTCanvas is not a rules engine: the GM
  // overrules the ledger, so an unaffordable purchase must still complete.
  it("warns but still completes a purchase the party cannot afford", () => {
    const grantToParty = vi.fn();
    const showToast = vi.fn();
    renderMerchants(baseState(), { grantToParty, showToast, purseCp: 100 });

    expect(screen.getByRole("button", { name: "Buy" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));

    expect(grantToParty).toHaveBeenCalledWith("i1", 1, 1500);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("more than the party had"), "info");
  });

  it("flags an unaffordable line before it is clicked", () => {
    renderMerchants(baseState(), { purseCp: 100 });
    expect(screen.getByText("short")).toBeTruthy();
  });
});

describe("Merchants - selling", () => {
  const HELD: ItemRef = { ...POTION, qty: 2 };

  it("takes the item from the party and pays the buyback rate", () => {
    const takeFromParty = vi.fn();
    renderMerchants(baseState(), { takeFromParty, partyStash: [HELD] });
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    // 5000cp at the default ×0.5.
    expect(takeFromParty).toHaveBeenCalledWith("i2", 1, 2500);
  });

  it("adds a newly-bought item to the merchant's own shelf", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange, partyStash: [HELD] });
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(onChange.mock.calls[0][0].merchants[0].stock).toContainEqual({ itemId: "i2", qty: 1 });
  });

  it("says so when the party stash is empty", () => {
    renderMerchants(baseState(), { partyStash: [] });
    expect(screen.getByText("The party stash is empty.")).toBeTruthy();
  });
});

describe("Merchants - entity links", () => {
  const NPCS = [{ filename: "npcs/dorn.json", id: "n1", name: "Dorn" }];
  const PLACES = [{ filename: "locations/keel.json", id: "l1", name: "The Gilded Keel", kind: "landmark" as const, links: [] }];

  it("caches the linked NPC's name alongside the reference", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange, npcs: NPCS });
    fireEvent.change(screen.getByLabelText("Linked NPC"), { target: { value: "npcs/dorn.json" } });
    expect(onChange.mock.calls[0][0].merchants[0]).toMatchObject({ ownerRef: "npcs/dorn.json", owner: "Dorn" });
  });

  it("opens the linked place through the app's own location channel", () => {
    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-location", spy);
    renderMerchants(
      baseState({ merchants: [merchant({ locationRef: "locations/keel.json", location: "The Gilded Keel" })] }),
      { locations: PLACES },
    );
    fireEvent.click(screen.getByRole("button", { name: "Open The Gilded Keel" }));
    window.removeEventListener("ttcanvas:open-location", spy);

    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ filename: "locations/keel.json" });
  });

  it("routes a description wikilink to the cross-entity channel", () => {
    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-entity-link", spy);
    renderMerchants(baseState({ merchants: [merchant({ description: "Runs with [[Vex]]." })] }));
    fireEvent.click(screen.getByText("Vex"));
    window.removeEventListener("ttcanvas:open-entity-link", spy);

    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ name: "Vex" });
  });
});
