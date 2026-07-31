// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemsContext, NpcContext, GazetteerContext, RollTablesContext, SessionLogContext, ToastContext, VaultContext } from "@ttcanvas/core";
import type {
  ItemsContextValue, CatalogueItemRef, ItemRef, NpcContextValue, GazetteerContextValue,
  RollTablesContextValue, RollTableOutcome, SessionLogContextValue, ToastContextValue, VaultContextValue,
  PlayerScene,
} from "@ttcanvas/core";
import { emitTo } from "@tauri-apps/api/event";
import { Merchants } from "./Merchants";
import type { Merchant, MerchantsState } from "./types";

// Casting a price list goes through Tauri's emitTo. Stubbed so the cast tests can read the payload.
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => { cleanup(); vi.mocked(emitTo).mockClear(); });

/** The scene handed to the player window by the most recent cast. */
function lastCastScene(): PlayerScene {
  const calls = vi.mocked(emitTo).mock.calls;
  return calls[calls.length - 1]?.[2] as PlayerScene;
}

// Only the export/pull controls touch the vault, and none of these tests open the settings cog.
const VAULT = { vaultPath: "/v", vaultVersion: 1, otherVaults: [] } as unknown as VaultContextValue;

const SWORD: CatalogueItemRef = { id: "i1", name: "Longsword", kind: "weapon", valueCp: 1500 };
const POTION: CatalogueItemRef = { id: "i2", name: "Healing potion", kind: "consumable", valueCp: 5000 };

function merchant(over: Partial<Merchant> = {}): Merchant {
  return {
    id: "m1", name: "Dorn's Forge", kind: "blacksmith",
    priceModifier: 1, buybackModifier: 0.5, rarities: ["common", "uncommon"],
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
  tables?: { id: string; name: string }[];
  rollOn?: (id: string) => RollTableOutcome[] | null;
  logSessionEntry?: SessionLogContextValue["logSessionEntry"];
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
  const rollTables: RollTablesContextValue = {
    tables: h.tables ?? [],
    rollOn: h.rollOn ?? (() => null),
  };
  return render(
    <VaultContext.Provider value={VAULT}>
      <ToastContext.Provider value={toast}>
        <ItemsContext.Provider value={items}>
          <RollTablesContext.Provider value={rollTables}>
            <NpcContext.Provider value={{ npcs: h.npcs ?? [], loading: false }}>
              <GazetteerContext.Provider value={{ locations: h.locations ?? [], loading: false }}>
                <SessionLogContext.Provider value={{ logSessionEntry: h.logSessionEntry ?? (() => {}) }}>
                  <Merchants state={state} onChange={h.onChange ?? (() => {})} />
                </SessionLogContext.Provider>
              </GazetteerContext.Provider>
            </NpcContext.Provider>
          </RollTablesContext.Provider>
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

describe("Merchants - reading a shelf item", () => {
  const BLADE: CatalogueItemRef = {
    ...SWORD, rarity: "rare", damage: [{ dice: "1d10+1", type: "slashing" }],
    properties: ["versatile", "heavy"], weightLb: 3,
    description: "Forged for a captain who never drew it.",
  };

  it("keeps the card shut until the name is clicked", () => {
    renderMerchants(baseState(), { catalogue: [BLADE, POTION] });
    expect(screen.queryByText(/never drew it/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Longsword" }));
    expect(screen.getByText(/never drew it/)).toBeTruthy();
  });

  it("puts the item's detail in the shop, which is the whole point", () => {
    renderMerchants(baseState(), { catalogue: [BLADE, POTION] });
    fireEvent.click(screen.getByRole("button", { name: "Longsword" }));
    expect(screen.getByText("2~11 Damage")).toBeTruthy();
    expect(screen.getByText("slashing")).toBeTruthy();
    expect(screen.getByText("versatile")).toBeTruthy();
    expect(screen.getByText("3 lb")).toBeTruthy();
  });

  it("closes again on a second click", () => {
    renderMerchants(baseState(), { catalogue: [BLADE, POTION] });
    const name = screen.getByRole("button", { name: "Longsword" });
    fireEvent.click(name);
    fireEvent.click(name);
    expect(screen.queryByText(/never drew it/)).toBeNull();
  });

  it("leaves Buy and the qty box directly clickable, so a trade is never two clicks", () => {
    const grantToParty = vi.fn();
    renderMerchants(baseState(), { catalogue: [BLADE, POTION], grantToParty });
    fireEvent.click(screen.getByText("Buy"));
    expect(grantToParty).toHaveBeenCalled();
    expect(screen.queryByText(/never drew it/)).toBeNull();
  });

  it("will not offer a card for a dangling row, since there is nothing to show", () => {
    renderMerchants(baseState({ merchants: [merchant({ stock: [{ itemId: "gone", qty: 1 }] })] }));
    expect(screen.getByRole("button", { name: /Unknown item/ }).hasAttribute("disabled")).toBe(true);
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

describe("Merchants - generation", () => {
  const RARE: CatalogueItemRef = { id: "i3", name: "Flametongue", kind: "weapon", rarity: "rare", valueCp: 100000 };
  const COMMON: CatalogueItemRef = { id: "i4", name: "Rope", kind: "gear", rarity: "common", valueCp: 100 };

  it("toggles a rarity on the merchant", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "rare" }));
    expect(onChange.mock.calls[0][0].merchants[0].rarities).toContain("rare");
  });

  it("untoggles a rarity it already had", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "uncommon" }));
    expect(onChange.mock.calls[0][0].merchants[0].rarities).not.toContain("uncommon");
  });

  it("a preset fills the whole rarity list in one click", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "Fabled" }));
    expect(onChange.mock.calls[0][0].merchants[0].rarities)
      .toEqual(["common", "uncommon", "rare", "very-rare", "legendary"]);
  });

  it("no preset grants artifacts, since those are plot objects rather than stock", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "Squalid" }));
    fireEvent.click(screen.getByRole("button", { name: "Fabled" }));
    for (const call of onChange.mock.calls) {
      expect(call[0].merchants[0].rarities).not.toContain("artifact");
    }
  });

  it("generates stock the merchant's rarities allow, merging onto the existing shelf", () => {
    const onChange = vi.fn();
    renderMerchants(
      // "general" so the kind default (gear/treasure) admits the rope.
      baseState({ merchants: [merchant({ kind: "general", rarities: ["common"], stock: [{ itemId: "i1", qty: 3 }] })] }),
      { onChange, catalogue: [SWORD, COMMON] },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const stock = onChange.mock.calls[0][0].merchants[0].stock;
    // The hand-set line survives the merge, and the rope was drawn alongside it.
    expect(stock.find((s: { itemId: string }) => s.itemId === "i1")?.qty).toBe(3);
    expect(stock.find((s: { itemId: string }) => s.itemId === "i4")).toBeTruthy();
  });

  it("follows the merchant's own kind when picking what to stock", () => {
    // A blacksmith defaults to weapons and armour, so a gear item is not eligible without an
    // override - which is what makes a generated shop feel placed rather than random.
    const showToast = vi.fn();
    renderMerchants(
      baseState({ merchants: [merchant({ kind: "blacksmith", rarities: ["common"], stock: [] })] }),
      { showToast, catalogue: [COMMON] },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Nothing left in your Items catalogue"), "info");
  });

  it("refuses to generate when no rarity is ticked, and says why", () => {
    const showToast = vi.fn();
    const onChange = vi.fn();
    renderMerchants(baseState({ merchants: [merchant({ rarities: [] })] }), { onChange, showToast });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Tick at least one rarity"), "info");
  });

  it("says so when the catalogue has nothing the merchant could stock", () => {
    const showToast = vi.fn();
    renderMerchants(
      baseState({ merchants: [merchant({ rarities: ["legendary"] })] }),
      { showToast, catalogue: [COMMON] },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Nothing left in your Items catalogue"), "info");
  });

  it("stocks matched names from a roll table", () => {
    const onChange = vi.fn();
    renderMerchants(baseState({ merchants: [merchant({ stock: [] })] }), {
      onChange,
      catalogue: [SWORD, RARE],
      tables: [{ id: "t1", name: "Smithy stock" }],
      rollOn: () => [{ text: "flametongue" }],
    });
    fireEvent.change(screen.getByLabelText("Roll table to stock from"), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));

    expect(onChange.mock.calls[0][0].merchants[0].stock).toContainEqual({ itemId: "i3", qty: 1, name: "Flametongue" });
  });

  // The unmatched report is durable rather than a toast, because it is a list the GM has to act on.
  it("lists rolled names with no catalogue match so the GM can add them", () => {
    renderMerchants(baseState(), {
      catalogue: [SWORD],
      tables: [{ id: "t1", name: "Smithy stock" }],
      rollOn: () => [{ text: "Rusty spoon" }, { text: "Longsword" }],
    });
    fireEvent.change(screen.getByLabelText("Roll table to stock from"), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));

    expect(screen.getByText("Rusty spoon")).toBeTruthy();
    expect(screen.getByText(/no matching item in your catalogue/)).toBeTruthy();
  });

  it("cannot roll before a table is picked", () => {
    renderMerchants(baseState(), { tables: [{ id: "t1", name: "Smithy stock" }] });
    expect(screen.getByRole("button", { name: "Roll" })).toBeDisabled();
  });
});

describe("Merchants - the name snapshot", () => {
  it("names a deleted item from its snapshot instead of showing it as unknown", () => {
    renderMerchants(baseState({
      merchants: [merchant({ stock: [{ itemId: "gone", qty: 1, name: "Flametongue" }] })],
    }));
    expect(screen.getByText(/Flametongue/)).toBeTruthy();
    expect(screen.getByText(/missing from Items/)).toBeTruthy();
  });

  it("prefers the live catalogue name over a stale snapshot", () => {
    renderMerchants(baseState({
      merchants: [merchant({ stock: [{ itemId: "i1", qty: 1, name: "Old name" }] })],
    }));
    expect(screen.getByText("Longsword")).toBeTruthy();
    expect(screen.queryByText("Old name")).toBeNull();
  });
});

describe("Merchants - casting the price list", () => {
  it("casts the selected merchant's shelf to the player window", () => {
    renderMerchants(baseState());
    fireEvent.click(screen.getByLabelText("Cast price list to player window"));

    const scene = lastCastScene();
    expect(scene.type).toBe("shop");
    expect(scene.shop?.name).toBe("Dorn's Forge");
    expect(scene.shop?.lines).toEqual([{ name: "Longsword", price: "15 gp", qty: 3 }]);
  });

  it("does not cast on its own until the GM turns live sync on", () => {
    renderMerchants(baseState());
    expect(emitTo).not.toHaveBeenCalled();
  });

  it("toggles live sync through onChange rather than local state, so it survives a reload", () => {
    const onChange = vi.fn();
    renderMerchants(baseState(), { onChange });
    fireEvent.click(screen.getByLabelText("Live sync price list to player window"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoCast: true }));
  });

  it("pushes the shelf without a click once live sync is on", async () => {
    vi.useFakeTimers();
    try {
      renderMerchants(baseState({ autoCast: true }));
      await vi.advanceTimersByTimeAsync(500);
      expect(lastCastScene().shop?.name).toBe("Dorn's Forge");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Merchants - the session log", () => {
  it("logs a purchase with the merchant and the price paid", () => {
    const logSessionEntry = vi.fn();
    renderMerchants(baseState(), { logSessionEntry });
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(logSessionEntry).toHaveBeenCalledWith("Bought Longsword from Dorn's Forge for 15 gp.");
  });

  it("logs a purchase the party could not afford, since it still happened", () => {
    const logSessionEntry = vi.fn();
    renderMerchants(baseState(), { logSessionEntry, purseCp: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(logSessionEntry).toHaveBeenCalledTimes(1);
  });

  it("logs a sale at the buyback price, not the asking price", () => {
    const logSessionEntry = vi.fn();
    renderMerchants(baseState(), {
      logSessionEntry,
      partyStash: [{ ...SWORD, qty: 1 }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(logSessionEntry).toHaveBeenCalledWith("Sold Longsword to Dorn's Forge for 15 ep.");
  });
});
