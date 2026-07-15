// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { PartyContext, ToastContext } from "@ttcanvas/core";
import type { SharedPartyMember, ToastType } from "@ttcanvas/core";
import { InitiativeTracker } from "./InitiativeTracker";
import type { Combatant, InitiativeTrackerState } from "./types";
import { emitTo } from "@tauri-apps/api/event";

// pushInitiativeOverlay ultimately goes through Tauri's emitTo - stub it, it's exercised on
// every mount/update regardless of showOnPlayer (it pushes `null` to clear the overlay).
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => cleanup());

function combatant(overrides: Partial<Combatant> & { id: string; name: string; initiative: number }): Combatant {
  return { hp: 10, maxHp: 10, ac: 10, kind: "foe", ...overrides };
}

// Wrapper provides real state management so onChange prop updates take effect on the next render,
// the same way the real WidgetSlot -> App.tsx state loop does.
function Wrapper({ initialState, party = [], showToast = () => {} }: {
  initialState: InitiativeTrackerState; party?: SharedPartyMember[]; showToast?: (message: string, type?: ToastType) => void;
}) {
  const [state, setState] = useState(initialState);
  return (
    <PartyContext.Provider value={{ members: party }}>
      <ToastContext.Provider value={{ showToast }}>
        <InitiativeTracker state={state} onChange={setState} />
      </ToastContext.Provider>
    </PartyContext.Provider>
  );
}

function renderTracker(initialState: InitiativeTrackerState, party?: SharedPartyMember[], showToast?: (message: string, type?: ToastType) => void) {
  return render(<Wrapper initialState={initialState} party={party} showToast={showToast} />);
}

describe("group initiative - active turn survives combined/separate transitions", () => {
  it("keeps a valid active turn when a combined group is flipped to separate", () => {
    const state: InitiativeTrackerState = {
      combatants: [
        combatant({ id: "d1", name: "Dragon", initiative: 20 }),
        combatant({ id: "a1", name: "Goblin 1", initiative: 15, groupId: "g1" }),
        combatant({ id: "a2", name: "Goblin 2", initiative: 15, groupId: "g1" }),
        combatant({ id: "c1", name: "Rat", initiative: 5 }),
      ],
      groups: [{ id: "g1", label: "Goblins", initiative: 15, combined: true }],
      currentId: "g1",
      round: 3,
      showOnPlayer: false,
    };
    renderTracker(state);

    fireEvent.click(screen.getByRole("button", { name: "Combined turn" }));

    // Exactly one row still carries the active-turn badge - currentId didn't go stale and
    // resolve to nothing once the group entry it pointed at stopped existing.
    expect(screen.getAllByText("NOW")).toHaveLength(1);

    // Previously: a stale currentId made currentIdx resolve to -1, and Prev's `prev < 0` check
    // mistook that for "wrapped past the start of the round", decrementing the round counter.
    fireEvent.click(screen.getByTitle("Previous turn"));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("keeps a valid active turn when a separate group's active member is recombined", () => {
    // "e1" outranks the group so that, once recombined, the group's collapsed entry sits at
    // index 1 (not 0) - landing on a genuine round-wrap boundary would mask the bug this guards.
    const state: InitiativeTrackerState = {
      combatants: [
        combatant({ id: "e1", name: "Dragon", initiative: 25 }),
        combatant({ id: "b1", name: "Goblin 1", initiative: 12, groupId: "g1" }),
        combatant({ id: "b2", name: "Goblin 2", initiative: 12, groupId: "g1" }),
      ],
      groups: [{ id: "g1", label: "Goblins", initiative: 12, combined: false }],
      currentId: "b1",
      round: 2,
      showOnPlayer: false,
    };
    renderTracker(state);

    fireEvent.click(screen.getAllByTitle(/click to combine into one turn/)[0]);

    // The group collapsed back into a GroupRow (currentId moved from the member's id to the
    // group's id).
    expect(screen.getByTitle("Ungroup")).toBeInTheDocument();

    // Previously: currentId stayed "b1", which no longer resolves to any entry once collapsed,
    // and Prev's `prev < 0` check mistook that stale lookup for a round-wrap boundary.
    fireEvent.click(screen.getByTitle("Previous turn"));
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("group initiative - selecting a combined group's members", () => {
  it("shows a selection checkbox on a combined group's member rows once select mode is on", () => {
    const state: InitiativeTrackerState = {
      combatants: [
        combatant({ id: "m1", name: "Goblin 1", initiative: 15, groupId: "g1" }),
        combatant({ id: "m2", name: "Goblin 2", initiative: 15, groupId: "g1" }),
      ],
      groups: [{ id: "g1", label: "Goblins", initiative: 15, combined: true }],
      currentId: null,
      round: 1,
      showOnPlayer: false,
    };
    renderTracker(state);

    fireEvent.click(screen.getByTitle("Select combatants to group (shared initiative)"));

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});

describe("player-window overlay - activeSourceIds falls back to the combatant's own id", () => {
  // Foes deliberately have no sourceId (keeps repeated creatures like "Goblin 1"/"Goblin 2"
  // independent - see tracking/bugs.md), so the overlay must fall back to the combatant id
  // itself, matching the id the map token was dragged in with (CombatantRow's drag handler).
  // Without the fallback, activeSourceIds stayed empty on every foe's turn and the
  // player-window spotlight never matched any token.
  it("uses the combatant's id when a foe's sourceId is unset", () => {
    const state: InitiativeTrackerState = {
      combatants: [combatant({ id: "f1", name: "Goblin 1", initiative: 15 })],
      currentId: "f1",
      round: 1,
      showOnPlayer: true,
    };
    renderTracker(state);

    const calls = vi.mocked(emitTo).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[1]).toBe("it-update");
    expect(lastCall?.[2]).toMatchObject({ activeSourceIds: ["f1"] });
  });

  it("uses the party member's own sourceId when set", () => {
    const state: InitiativeTrackerState = {
      combatants: [combatant({ id: "c1", name: "Aria", kind: "pc", sourceId: "p1", initiative: 18 })],
      currentId: "c1",
      round: 1,
      showOnPlayer: true,
    };
    renderTracker(state);

    const calls = vi.mocked(emitTo).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[2]).toMatchObject({ activeSourceIds: ["p1"] });
  });

  // A combined group's turn has no single combatant - the whole group acts together, so every
  // member's token should spotlight, not none of them.
  it("lists every member's id when a combined group's turn is active", () => {
    const state: InitiativeTrackerState = {
      combatants: [
        combatant({ id: "g1a", name: "Goblin 1", initiative: 15, groupId: "g1" }),
        combatant({ id: "g1b", name: "Goblin 2", initiative: 15, groupId: "g1" }),
      ],
      groups: [{ id: "g1", label: "Goblins", initiative: 15, combined: true }],
      currentId: "g1",
      round: 1,
      showOnPlayer: true,
    };
    renderTracker(state);

    const calls = vi.mocked(emitTo).mock.calls;
    const lastCall = calls[calls.length - 1];
    const payload = lastCall?.[2] as { activeSourceIds: string[] };
    expect(payload.activeSourceIds.sort()).toEqual(["g1a", "g1b"]);
  });
});

describe("player-window overlay - current/next contract", () => {
  // The overlay is player-facing: only the current and next turn should ever cross the wire, in
  // that order, never the full GM-facing order (a player seeing the whole queue can spoil what's
  // coming - see tracking/bugs.md).
  it("sends only [current, next] even with more combatants in the order", () => {
    const state: InitiativeTrackerState = {
      combatants: [
        combatant({ id: "a", name: "Aria", initiative: 20 }),
        combatant({ id: "b", name: "Goblin 1", initiative: 15 }),
        combatant({ id: "c", name: "Goblin 2", initiative: 10 }),
        combatant({ id: "d", name: "Rat", initiative: 5 }),
      ],
      currentId: "b",
      round: 1,
      showOnPlayer: true,
    };
    renderTracker(state);

    const calls = vi.mocked(emitTo).mock.calls;
    const lastCall = calls[calls.length - 1];
    const payload = lastCall?.[2] as { turns: { name: string; current: boolean; next: boolean }[] };
    expect(payload.turns).toEqual([
      { name: "Goblin 1", kind: "foe", current: true, next: false },
      { name: "Goblin 2", kind: "foe", current: false, next: true },
    ]);
  });

  // Wrap-around: the current turn is last in initiative order, so next wraps back to the first
  // entry. Previously the player window derived [current, next] by filtering the full,
  // initiative-sorted list, which kept the *first* combatant's row above the *last* combatant's -
  // NEXT rendered above NOW. The producer must send them in current-then-next order directly.
  it("keeps current before next when the turn order wraps past the end", () => {
    const state: InitiativeTrackerState = {
      combatants: [
        combatant({ id: "a", name: "Aria", initiative: 20 }),
        combatant({ id: "b", name: "Goblin 1", initiative: 10 }),
      ],
      currentId: "b",
      round: 2,
      showOnPlayer: true,
    };
    renderTracker(state);

    const calls = vi.mocked(emitTo).mock.calls;
    const lastCall = calls[calls.length - 1];
    const payload = lastCall?.[2] as { turns: { name: string; current: boolean; next: boolean }[] };
    expect(payload.turns.map((t) => t.name)).toEqual(["Goblin 1", "Aria"]);
    expect(payload.turns[0]).toMatchObject({ current: true, next: false });
    expect(payload.turns[1]).toMatchObject({ current: false, next: true });
  });

  it("sends a single entry when there's only one combatant (current and next are the same)", () => {
    const state: InitiativeTrackerState = {
      combatants: [combatant({ id: "a", name: "Aria", kind: "pc", initiative: 20 })],
      currentId: "a",
      round: 1,
      showOnPlayer: true,
    };
    renderTracker(state);

    const calls = vi.mocked(emitTo).mock.calls;
    const lastCall = calls[calls.length - 1];
    const payload = lastCall?.[2] as { turns: { name: string; current: boolean; next: boolean }[] };
    expect(payload.turns).toEqual([{ name: "Aria", kind: "pc", current: true, next: false }]);
  });

  it("pushes null instead of an empty card when there's no valid current turn", () => {
    const state: InitiativeTrackerState = {
      combatants: [combatant({ id: "a", name: "Aria", initiative: 20 })],
      currentId: null,
      round: 1,
      showOnPlayer: true,
    };
    renderTracker(state);

    const calls = vi.mocked(emitTo).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[2]).toBeNull();
  });
});

describe("From party - DEX-modified initiative", () => {
  it("adds a party member's DEX modifier to the default initiative when their stored value is 0", () => {
    const state: InitiativeTrackerState = {
      combatants: [],
      currentId: null,
      round: 1,
      showOnPlayer: false,
    };
    const party: SharedPartyMember[] = [{
      id: "p1", name: "Aria", hp: 20, maxHp: 20, ac: 15, initiative: 0,
      abilityScores: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 }, // dex 16 -> +3
    }];
    renderTracker(state, party);

    fireEvent.click(screen.getByRole("button", { name: /From party/ }));

    expect(screen.getByDisplayValue("13")).toBeInTheDocument(); // 10 + 3
  });
});

describe("lair-action reminder", () => {
  const wrappingState: InitiativeTrackerState = {
    combatants: [
      combatant({ id: "a1", name: "Aria", initiative: 20 }),
      combatant({ id: "b1", name: "Bugbear", initiative: 10 }),
    ],
    currentId: "b1", // last in turn order - clicking Next turn wraps to a new round
    round: 4,
    showOnPlayer: false,
  };

  it("toasts an info reminder when a round wraps and the toggle is on", () => {
    const showToast = vi.fn();
    renderTracker({ ...wrappingState, lairActionReminder: true }, undefined, showToast);

    fireEvent.click(screen.getByText("Next turn"));

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Round 5"), "info");
  });

  it("does not toast when the reminder toggle is off (default)", () => {
    const showToast = vi.fn();
    renderTracker(wrappingState, undefined, showToast);

    fireEvent.click(screen.getByText("Next turn"));

    expect(showToast).not.toHaveBeenCalled();
  });

  it("shows the reminder toggle and flips it via patch", () => {
    const state: InitiativeTrackerState = { combatants: [], currentId: null, round: 1, showOnPlayer: false };
    renderTracker(state);

    const toggle = screen.getByTitle("Remind at the start of each round (lair actions)");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(screen.getByTitle("Reminder fires each time a new round begins")).toHaveAttribute("aria-pressed", "true");
  });
});
