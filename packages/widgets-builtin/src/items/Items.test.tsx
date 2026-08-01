// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiceContext, PartyContext, RollTablesContext, VaultContext } from "@ttcanvas/core";
import type { PartyContextValue, PartyMemberPatch, RollTablesContextValue, RollTableOutcome, VaultContextValue } from "@ttcanvas/core";
import { Items } from "./Items";
import { ItemCard } from "../shared/ItemCard";
import type { ItemsState, CatalogueItem } from "./types";

afterEach(cleanup);

// Only the export/pull controls touch the vault, and none of these tests open the settings cog.
const VAULT = { vaultPath: "/v", vaultVersion: 1, otherVaults: [] } as unknown as VaultContextValue;

const MEMBERS = [
  { id: "pc1", name: "Vex", hp: 10, maxHp: 10, ac: 14, initiative: 2, level: 3 },
  { id: "pc2", name: "Bram", hp: 8, maxHp: 12, ac: 16, initiative: 0, level: 3 },
];

function item(over: Partial<CatalogueItem> = {}): CatalogueItem {
  return { id: "i1", name: "Sunblade", kind: "weapon", holdings: [{ holderId: null, qty: 1 }], ...over };
}

function baseState(over: Partial<ItemsState> = {}): ItemsState {
  return {
    items: [item()],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    query: "", kindFilter: null, heldFilter: "all", showWeight: false, carryLimitLb: null,
    ...over,
  };
}

interface Harness {
  onChange?: (s: ItemsState) => void;
  patchMembers?: (p: PartyMemberPatch[]) => void;
  rollOn?: (id: string) => RollTableOutcome[] | null;
  tables?: { id: string; name: string }[];
  members?: PartyContextValue["members"];
}

function renderInventory(state: ItemsState, h: Harness = {}) {
  const party: PartyContextValue = {
    members: h.members ?? MEMBERS,
    patchMembers: h.patchMembers ?? (() => {}),
  };
  const rollTables: RollTablesContextValue = {
    tables: h.tables ?? [],
    rollOn: h.rollOn ?? (() => null),
  };
  return render(
    <VaultContext.Provider value={VAULT}>
      <PartyContext.Provider value={party}>
        <RollTablesContext.Provider value={rollTables}>
          <Items state={state} onChange={h.onChange ?? (() => {})} />
        </RollTablesContext.Provider>
      </PartyContext.Provider>
    </VaultContext.Provider>,
  );
}

describe("Items ledger", () => {
  it("shows the empty state before anything is added", () => {
    renderInventory(baseState({ items: [] }));
    expect(screen.getByText("No items yet. Add one to define it, then say who has some.")).toBeTruthy();
  });

  it("distinguishes an empty ledger from a filtered-out one", () => {
    renderInventory(baseState({ query: "zzz" }));
    expect(screen.getByText("No items match.")).toBeTruthy();
  });

  it("sums quantities across holders in the row", () => {
    renderInventory(baseState({ items: [item({ holdings: [{ holderId: null, qty: 2 }, { holderId: "pc1", qty: 3 }] })] }));
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("2 holders")).toBeTruthy();
  });

  it("names the single holder rather than counting them", () => {
    renderInventory(baseState({ items: [item({ holdings: [{ holderId: "pc1", qty: 1 }] })] }));
    expect(screen.getByText("Vex")).toBeTruthy();
  });

  it("filters by kind chip", () => {
    const onChange = vi.fn();
    renderInventory(baseState(), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "armour" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kindFilter: "armour" }));
  });

  // The catalogue reframe: an item is a definition first, a possession second.
  it("adds a new item as a bare definition that nobody holds", () => {
    const onChange = vi.fn();
    renderInventory(baseState({ items: [] }), { onChange });
    fireEvent.change(screen.getByPlaceholderText("Add item…"), { target: { value: "Rope" } });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onChange.mock.calls[0][0].items[0]).toMatchObject({ name: "Rope", holdings: [] });
  });

  it("hides catalogue-only items under the Held filter", () => {
    renderInventory(baseState({
      heldFilter: "held",
      items: [item({ id: "held", name: "Sunblade" }), item({ id: "defn", name: "Rope", holdings: [] })],
    }));
    expect(screen.getByText("Sunblade")).toBeTruthy();
    expect(screen.queryByText("Rope")).toBeNull();
  });

  it("hides held items under the Catalogue filter", () => {
    renderInventory(baseState({
      heldFilter: "catalogue",
      items: [item({ id: "held", name: "Sunblade" }), item({ id: "defn", name: "Rope", holdings: [] })],
    }));
    expect(screen.getByText("Rope")).toBeTruthy();
    expect(screen.queryByText("Sunblade")).toBeNull();
  });

  it("explains an empty Catalogue view rather than looking broken", () => {
    renderInventory(baseState({ heldFilter: "catalogue" }));
    expect(screen.getByText("Every item that matches is held by somebody.")).toBeTruthy();
  });

  it("keeps a row collapsed until it is clicked", () => {
    renderInventory(baseState());
    expect(screen.queryByLabelText("Add one to Vex")).toBeNull();
    fireEvent.click(screen.getByText("Sunblade"));
    expect(screen.getByLabelText("Add one to Vex")).toBeTruthy();
  });

  it("moves a copy onto a character with the stepper", () => {
    const onChange = vi.fn();
    renderInventory(baseState(), { onChange });
    fireEvent.click(screen.getByText("Sunblade"));
    fireEvent.click(screen.getByLabelText("Add one to Vex"));
    expect(onChange.mock.calls[0][0].items[0].holdings).toContainEqual({ holderId: "pc1", qty: 1 });
  });

  it("surfaces a holding pointing at a deleted PC instead of losing it", () => {
    renderInventory(baseState({ items: [item({ holdings: [{ holderId: "gone", qty: 2 }] })] }));
    fireEvent.click(screen.getByText("Sunblade"));
    expect(screen.getByText("Unassigned (2) · missing PC")).toBeTruthy();
  });
});

describe("Items coin", () => {
  it("splits the purse evenly and hands each member a delta", () => {
    const patchMembers = vi.fn();
    const onChange = vi.fn();
    renderInventory(baseState({ currency: { cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 } }), { patchMembers, onChange });
    fireEvent.click(screen.getByText("Split coin"));
    expect(patchMembers).toHaveBeenCalledWith([
      { id: "pc1", currencyDelta: { cp: 0, sp: 5, ep: 0, gp: 1, pp: 0 } },
      { id: "pc2", currencyDelta: { cp: 0, sp: 5, ep: 0, gp: 1, pp: 0 } },
    ]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    }));
  });

  it("does not pay anybody when the party is empty", () => {
    const patchMembers = vi.fn();
    renderInventory(baseState({ currency: { cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 } }), { patchMembers, members: [] });
    fireEvent.click(screen.getByText("Split coin"));
    expect(patchMembers).not.toHaveBeenCalled();
  });
});

describe("Items loot rolling", () => {
  it("disables the roll button until a table is picked", () => {
    renderInventory(baseState(), { tables: [{ id: "t1", name: "Loot" }] });
    expect(screen.getByText("Roll").closest("button")?.disabled).toBe(true);
  });

  it("adds a rolled result as a new stash item", () => {
    const onChange = vi.fn();
    renderInventory(baseState({ items: [] }), {
      onChange,
      tables: [{ id: "t1", name: "Loot" }],
      rollOn: () => [{ text: "Ruby" }],
    });
    fireEvent.change(screen.getByLabelText("Loot table"), { target: { value: "t1" } });
    fireEvent.click(screen.getByText("Roll"));
    expect(onChange.mock.calls[0][0].items[0]).toMatchObject({
      name: "Ruby", kind: "treasure", holdings: [{ holderId: null, qty: 1 }],
    });
  });

  it("folds a repeat result into the existing stash entry rather than duplicating the row", () => {
    const onChange = vi.fn();
    renderInventory(baseState({ items: [item({ name: "Ruby" })] }), {
      onChange,
      tables: [{ id: "t1", name: "Loot" }],
      rollOn: () => [{ text: "ruby" }],
    });
    fireEvent.change(screen.getByLabelText("Loot table"), { target: { value: "t1" } });
    fireEvent.click(screen.getByText("Roll"));
    const next = onChange.mock.calls[0][0].items;
    expect(next).toHaveLength(1);
    expect(next[0].holdings).toEqual([{ holderId: null, qty: 2 }]);
  });
});

describe("Items descriptions", () => {
  it("routes a wikilink click to the cross-entity channel", () => {
    const heard: string[] = [];
    const listener = (e: Event) => heard.push((e as CustomEvent<{ name: string }>).detail.name);
    window.addEventListener("ttcanvas:open-entity-link", listener);
    try {
      renderInventory(baseState({ items: [item({ description: "Forged by [[Vex]]." })] }));
      fireEvent.click(screen.getByText("Sunblade"));
      // By role, not text - "Vex" also appears as a holder row in the holdings list.
      fireEvent.click(screen.getByRole("link", { name: "Vex" }));
      expect(heard).toEqual(["Vex"]);
      // The rendered view stays put; only the Edit button opens the textarea.
      expect(screen.queryByRole("textbox", { name: /Description of/ })).toBeNull();
    } finally {
      window.removeEventListener("ttcanvas:open-entity-link", listener);
    }
  });

  it("opens and closes the editor from a real button", () => {
    renderInventory(baseState({ items: [item({ description: "Forged by [[Vex]]." })] }));
    fireEvent.click(screen.getByText("Sunblade"));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Description of Sunblade" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("textbox", { name: /Description of/ })).toBeNull();
  });

  it("leaves the rendered description alone when its body is clicked", () => {
    renderInventory(baseState({ items: [item({ description: "Forged by [[Vex]]." })] }));
    fireEvent.click(screen.getByText("Sunblade"));
    fireEvent.click(screen.getByText(/Forged by/));
    expect(screen.queryByRole("textbox", { name: /Description of/ })).toBeNull();
  });
});

describe("Items weapon and armour detail", () => {
  function openEditor(over: Partial<CatalogueItem> = {}, onChange = vi.fn()) {
    renderInventory(baseState({ items: [item(over)] }), { onChange });
    fireEvent.click(screen.getByText("Sunblade"));
    return onChange;
  }

  it("shows the block already open for an item that has detail", () => {
    openEditor({ kind: "weapon", damage: [{ dice: "1d8" }] });
    expect(screen.getByLabelText("Base damage dice")).toBeTruthy();
    expect(screen.getByLabelText("Range")).toBeTruthy();
  });

  it("keeps the block shut for an item with none, and opens it on request", () => {
    openEditor({ kind: "gear" });
    expect(screen.queryByText("+ Add damage")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Damage and defence/ }));
    expect(screen.getByText("+ Add damage")).toBeTruthy();
  });

  // The gate used to be `kind`, which meant a wand could not be given damage and a ring could not be
  // given an armour class. Both are offered on everything now (deferred item 63).
  it("offers damage and armour class on a kind that is neither weapon nor armour", () => {
    openEditor({ kind: "consumable", damage: [{ dice: "2d6", type: "acid" }] });
    expect(screen.getByLabelText("Base damage dice")).toBeTruthy();
    expect(screen.getByLabelText("Armour class")).toBeTruthy();
  });

  it("offers properties on every kind, weapon or not", () => {
    openEditor({ kind: "consumable" });
    expect(screen.getByLabelText("Properties")).toBeTruthy();
  });

  it("splits a comma-separated properties field into a list", () => {
    const onChange = openEditor();
    fireEvent.change(screen.getByLabelText("Properties"), { target: { value: "light, finesse ,, thrown" } });
    expect(onChange.mock.calls[0][0].items[0].properties).toEqual(["light", "finesse", "thrown"]);
  });

  it("clears the properties field to undefined rather than an empty list", () => {
    const onChange = openEditor({ properties: ["light"] });
    fireEvent.change(screen.getByLabelText("Properties"), { target: { value: "  " } });
    expect(onChange.mock.calls[0][0].items[0].properties).toBeUndefined();
  });

  it("headlines the damage range the card derives from the notation", () => {
    openEditor({ damage: [{ dice: "1d6-1", type: "bludgeoning" }] });
    expect(screen.getByText("0~5 Damage")).toBeTruthy();
    expect(screen.getByText("bludgeoning")).toBeTruthy();
  });

  it("shows unrollable notation as plain text rather than a dead button", () => {
    openEditor({ damage: [{ dice: "1d6 per level" }] });
    expect(screen.queryByText(/\d+~\d+ Damage/)).toBeNull();
    expect(screen.getByText("1d6 per level").tagName).toBe("SPAN");
  });

  it("keeps a weapon's damage when its kind changes, so a mis-set kind costs nothing", () => {
    const onChange = openEditor({ damage: [{ dice: "1d8" }] });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "armour" } });
    expect(onChange.mock.calls[0][0].items[0].damage).toEqual([{ dice: "1d8" }]);
  });

  it("totals every damage component into one headline", () => {
    openEditor({
      damage: [
        { dice: "1d8+8", type: "piercing" },
        { dice: "1d6", type: "thunder" },
        { dice: "1d4", type: "necrotic" },
      ],
    });
    expect(screen.getByText("11~26 Damage")).toBeTruthy();
    // The stacked components read as additions, base first.
    expect(screen.getByText("1d8+8")).toBeTruthy();
    expect(screen.getByText("+1d6")).toBeTruthy();
    expect(screen.getByText("+1d4")).toBeTruthy();
    expect(screen.getByText("necrotic")).toBeTruthy();
  });

  it("rolls every component together, since that is the number the GM needs", () => {
    const roll = vi.fn();
    render(
      <DiceContext.Provider value={{ roll }}>
        <ItemCard item={{ id: "i1", name: "Nyrulna", kind: "weapon", damage: [{ dice: "1d8+8" }, { dice: "1d6" }] }} />
      </DiceContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Roll 1d8\+8\+1d6/ }));
    expect(roll).toHaveBeenCalledWith("1d8+8+1d6", null, "Nyrulna damage");
  });

  it("adds and removes damage components", () => {
    const onChange = openEditor({ damage: [{ dice: "1d8" }] });
    fireEvent.click(screen.getByText("+ Add damage"));
    expect(onChange.mock.calls[0][0].items[0].damage).toEqual([{ dice: "1d8" }, { dice: "" }]);

    onChange.mockClear();
    fireEvent.click(screen.getByLabelText("Remove base damage"));
    // An emptied list collapses away rather than lingering as [].
    expect(onChange.mock.calls[0][0].items[0].damage).toBeUndefined();
  });

  it("prints the versatile dice beside the base without folding it into the range", () => {
    openEditor({ damage: [{ dice: "1d8" }], versatileDice: "1d10" });
    expect(screen.getByText("1~8 Damage")).toBeTruthy();
    expect(screen.getByText("(1d10)")).toBeTruthy();
  });

  it("shows an enchantment on its own line, signed", () => {
    // Rendered on its own: "Enchantment" is also the editor's field label, and this is about the card.
    render(<ItemCard item={{ id: "i1", name: "Nyrulna", kind: "weapon", damage: [{ dice: "1d8" }], enchantment: 3 }} />);
    expect(screen.getByText("Enchantment")).toBeTruthy();
    expect(screen.getByText("+3")).toBeTruthy();
    // Display only: the bonus is usually already inside the notation, so adding it again would
    // silently inflate every enchanted weapon.
    expect(screen.getByText("1~8 Damage")).toBeTruthy();
  });
});
