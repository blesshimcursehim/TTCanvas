// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  parseStickyNoteState,
  parsePartyTrackerState,
  parseInitiativeTrackerState,
  parseSessionNotesState,
  parseDiceRollerState,
  parseSoundBoardState,
  parseBestiaryState,
  parseSessionRecorderState,
  parseMapDisplayState,
  parseTimeTrackerState,
  parseRulesReferenceState,
  parseRuleCardsState,
  parseSessionClockState,
  parseXpTrackerState,
  parseRollTablesState,
  parseEncounterBuilderState,
  parseCardDecksState,
  parseProgressClocksState,
  parseHandoutGalleryState,
  parseRelationshipWebState,
  parseCampaignTimelineState,
} from "./stateSchemas";

describe("parseStickyNoteState", () => {
  it("passes valid state through", () => {
    expect(parseStickyNoteState({ content: "hello" })).toEqual({ content: "hello" });
  });
  it("defaults missing content to empty string", () => {
    expect((parseStickyNoteState({}) as { content: string }).content).toBe("");
  });
  it("defaults non-string content", () => {
    expect((parseStickyNoteState({ content: 42 }) as { content: string }).content).toBe("");
  });
  it("returns default for null", () => {
    expect(parseStickyNoteState(null)).toEqual({ content: "" });
  });
  it("passes a valid color through", () => {
    const result = parseStickyNoteState({ content: "hi", color: "rose" }) as { color?: string };
    expect(result.color).toBe("rose");
  });
  it("drops an invalid color instead of keeping legacy notes stuck", () => {
    const result = parseStickyNoteState({ content: "hi", color: "chartreuse" }) as { color?: string };
    expect(result.color).toBeUndefined();
  });
  it("leaves color undefined for legacy notes with no color field", () => {
    const result = parseStickyNoteState({ content: "hi" }) as { color?: string };
    expect(result.color).toBeUndefined();
  });
});

describe("parsePartyTrackerState", () => {
  const validMember = {
    id: "m1", name: "Aria", race: "Elf", cls: "Ranger", level: 5,
    sp: 0, maxSp: 0, pp: 14, gp: 10, notes: "", inspiration: false,
    ac: 15, hp: 30, maxHp: 38, initiative: 3,
  };

  it("passes valid state through", () => {
    const result = parsePartyTrackerState({ members: [validMember], compact: false }) as { members: typeof validMember[]; compact: boolean };
    expect(result.members).toHaveLength(1);
    expect(result.members[0].name).toBe("Aria");
    expect(result.compact).toBe(false);
  });

  it("defaults missing members to empty array", () => {
    const result = parsePartyTrackerState({ compact: true }) as { members: unknown[] };
    expect(result.members).toEqual([]);
  });

  it("drops members missing required id", () => {
    const bad = { name: "Bob", race: "", cls: "", level: 1, sp: 0, maxSp: 0, pp: 10, gp: 0, notes: "", inspiration: false, ac: 10, hp: 0, maxHp: 0, initiative: 0 };
    const result = parsePartyTrackerState({ members: [validMember, bad], compact: false }) as { members: unknown[] };
    expect(result.members).toHaveLength(1);
  });

  it("corrects non-number hp to 0", () => {
    const corrupt = { ...validMember, hp: "lots" };
    const result = parsePartyTrackerState({ members: [corrupt], compact: false }) as { members: { hp: number }[] };
    expect(result.members[0].hp).toBe(0);
  });

  it("corrects a non-number dex inside abilityScores to the +0 baseline (10), instead of letting it flow through as NaN", () => {
    const corrupt = { ...validMember, abilityScores: { str: 10, dex: "bad", con: 10, int: 10, wis: 10, cha: 10 } };
    const result = parsePartyTrackerState({ members: [corrupt], compact: false }) as { members: { abilityScores?: { dex: number } }[] };
    expect(result.members[0].abilityScores?.dex).toBe(10);
  });

  it("corrects a garbage abilityScores value entirely to the default block", () => {
    const corrupt = { ...validMember, abilityScores: "garbage" };
    const result = parsePartyTrackerState({ members: [corrupt], compact: false }) as { members: { abilityScores?: { dex: number } }[] };
    expect(result.members[0].abilityScores?.dex).toBe(10);
  });

  it("leaves abilityScores undefined when the member never had any set", () => {
    const result = parsePartyTrackerState({ members: [validMember], compact: false }) as { members: { abilityScores?: unknown }[] };
    expect(result.members[0].abilityScores).toBeUndefined();
  });

  it("preserves extra fields via passthrough", () => {
    const withExtra = { ...validMember, portraitPath: "portraits/m1.jpg" };
    const result = parsePartyTrackerState({ members: [withExtra], compact: false }) as { members: { portraitPath?: string }[] };
    expect(result.members[0].portraitPath).toBe("portraits/m1.jpg");
  });

  it("returns default for completely invalid state", () => {
    const result = parsePartyTrackerState("corrupt") as { members: unknown[]; compact: boolean };
    expect(result.members).toEqual([]);
    expect(result.compact).toBe(false);
  });
});

describe("parseInitiativeTrackerState", () => {
  it("passes valid state through", () => {
    const state = { combatants: [{ id: "c1", name: "Goblin", initiative: 12, hp: 7, maxHp: 7, ac: 13, kind: "foe" }], currentId: "c1", round: 2 };
    const result = parseInitiativeTrackerState(state) as typeof state;
    expect(result.round).toBe(2);
    expect(result.combatants[0].name).toBe("Goblin");
  });

  it("defaults missing round to 1", () => {
    const result = parseInitiativeTrackerState({ combatants: [], currentId: null }) as { round: number };
    expect(result.round).toBe(1);
  });

  it("drops combatants missing id", () => {
    const good = { id: "c1", name: "Goblin", initiative: 5, hp: 7, maxHp: 7, ac: 13, kind: "foe" };
    const bad = { name: "Orc", initiative: 3, hp: 15, maxHp: 15, ac: 14, kind: "foe" };
    const result = parseInitiativeTrackerState({ combatants: [good, bad], currentId: null, round: 1 }) as { combatants: unknown[] };
    expect(result.combatants).toHaveLength(1);
  });

  it("corrects invalid kind to 'foe'", () => {
    const c = { id: "c1", name: "X", initiative: 0, hp: 1, maxHp: 1, ac: 10, kind: "villain" };
    const result = parseInitiativeTrackerState({ combatants: [c], currentId: null, round: 1 }) as { combatants: { kind: string }[] };
    expect(result.combatants[0].kind).toBe("foe");
  });

  it("preserves sourceId/portraitPath via passthrough", () => {
    const c = { id: "c1", name: "G", initiative: 5, hp: 7, maxHp: 7, ac: 13, kind: "pc", sourceId: "party-1", portraitPath: "portraits/party-1.jpg" };
    const result = parseInitiativeTrackerState({ combatants: [c], currentId: null, round: 1 }) as { combatants: { sourceId?: string; portraitPath?: string }[] };
    expect(result.combatants[0].sourceId).toBe("party-1");
    expect(result.combatants[0].portraitPath).toBe("portraits/party-1.jpg");
  });

  it("defaults missing autoAdvanceTime/roundSeconds (pre-F7 saves)", () => {
    const result = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1, showOnPlayer: false }) as { autoAdvanceTime: boolean; roundSeconds: number };
    expect(result.autoAdvanceTime).toBe(false);
    expect(result.roundSeconds).toBe(6);
  });

  it("defaults missing/malformed lairActionReminder to false", () => {
    const missing = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1 }) as { lairActionReminder: boolean };
    expect(missing.lairActionReminder).toBe(false);
    const malformed = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1, lairActionReminder: "yes" }) as { lairActionReminder: boolean };
    expect(malformed.lairActionReminder).toBe(false);
  });

  it("corrects non-positive roundSeconds to 6 and keeps valid values", () => {
    const bad = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1, showOnPlayer: false, autoAdvanceTime: true, roundSeconds: 0 }) as { autoAdvanceTime: boolean; roundSeconds: number };
    expect(bad.roundSeconds).toBe(6);
    expect(bad.autoAdvanceTime).toBe(true);
    const ok = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1, showOnPlayer: false, autoAdvanceTime: true, roundSeconds: 10 }) as { roundSeconds: number };
    expect(ok.roundSeconds).toBe(10);
  });
});

describe("parseSessionNotesState", () => {
  it("passes valid state through", () => {
    const s = { notesFolder: "/vault/notes", selectedFile: "session1.md" };
    expect(parseSessionNotesState(s)).toEqual(s);
  });
  it("defaults both fields for null input", () => {
    expect(parseSessionNotesState(null)).toEqual({ notesFolder: null, selectedFile: null });
  });
  it("defaults non-string notesFolder to null", () => {
    const result = parseSessionNotesState({ notesFolder: 123, selectedFile: null }) as { notesFolder: string | null };
    expect(result.notesFolder).toBeNull();
  });
});

describe("parseDiceRollerState", () => {
  it("passes valid state through", () => {
    const macro = { id: "m1", label: "Longsword +7", expr: "1d20+7" };
    const entry = { id: "r1", label: "Longsword +7", expr: "1d20+7", total: 18, breakdown: "(11)+7", altTotal: null, adv: null, crit: false, fumble: false, at: 1 };
    const s = { macros: [macro], history: [entry], input: "2d6+3", adv: null, query: "", castId: null };
    const result = parseDiceRollerState(s) as typeof s;
    expect(result.macros).toHaveLength(1);
    expect(result.history).toHaveLength(1);
    expect(result.input).toBe("2d6+3");
  });
  it("drops history entries missing id", () => {
    const bad = { label: "d20", total: 5, breakdown: "(5)" };
    const result = parseDiceRollerState({ history: [bad] }) as { history: unknown[] };
    expect(result.history).toHaveLength(0);
  });
  it("discards the legacy v0.13 shape and returns fresh defaults", () => {
    // Old customExpr/advantage keys carry no new field, so migration lands on the empty default.
    const legacy = { history: [{ id: "x", rolls: [5], modifier: 0 }], customExpr: "2d6", advantage: "advantage" };
    expect(parseDiceRollerState(legacy)).toEqual({ macros: [], history: [], input: "", adv: null, query: "", castId: null });
  });
  it("returns default for null", () => {
    expect(parseDiceRollerState(null)).toEqual({ macros: [], history: [], input: "", adv: null, query: "", castId: null });
  });
});

describe("parseSoundBoardState", () => {
  it("passes valid outer shape through", () => {
    const s = { scenes: [{ id: "s1", name: "Scene 1", pads: [] }], activeSceneId: "s1" };
    const result = parseSoundBoardState(s) as typeof s;
    expect(result.scenes).toHaveLength(1);
    expect(result.activeSceneId).toBe("s1");
  });
  it("passes a non-array scenes field through untouched too - SoundBoard's migration treats it like legacy state", () => {
    const s = { scenes: "corrupt", activeSceneId: "" };
    expect(parseSoundBoardState(s)).toEqual(s);
  });
  it("returns default for null", () => {
    expect(parseSoundBoardState(null)).toEqual({ scenes: [], activeSceneId: "" });
  });
  it("passes legacy pre-scenes state through untouched for SoundBoard's own migration to upgrade", () => {
    const legacy = { pads: [{ id: "p1", label: "Rain", audioPath: "rain.mp3", loop: true, volume: 0.8 }] };
    expect(parseSoundBoardState(legacy)).toEqual(legacy);
  });
});

describe("parseBestiaryState", () => {
  it("drops entries missing id", () => {
    const good = { id: "e1", name: "Goblin", creatureType: "humanoid", tags: [], cr: "1/4", hp: 7, ac: 13, notes: "", folderId: null };
    const bad = { name: "Orc", creatureType: "humanoid", tags: [], cr: "1/2", hp: 15, ac: 14, notes: "", folderId: null };
    const result = parseBestiaryState({ entries: [good, bad], folders: [] }) as { entries: unknown[] };
    expect(result.entries).toHaveLength(1);
  });
  it("returns default for null", () => {
    expect(parseBestiaryState(null)).toEqual({ entries: [], folders: [] });
  });
  it("preserves the one-shot openRequestId so a [[creature:...]] open survives the render-path re-parse", () => {
    const result = parseBestiaryState({ entries: [], folders: [], openRequestId: "g1" }) as { openRequestId?: string };
    expect(result.openRequestId).toBe("g1");
  });
  it("corrects a non-number dex inside abilityScores to the +0 baseline (10), instead of letting it flow through as NaN", () => {
    const corrupt = {
      id: "e1", name: "Goblin", creatureType: "humanoid", tags: [], cr: "1/4", hp: 7, ac: 13, notes: "", folderId: null,
      abilityScores: { str: 10, dex: "bad", con: 10, int: 10, wis: 10, cha: 10 },
    };
    const result = parseBestiaryState({ entries: [corrupt], folders: [] }) as { entries: { abilityScores?: { dex: number } }[] };
    expect(result.entries[0].abilityScores?.dex).toBe(10);
  });
});

describe("parseSessionRecorderState", () => {
  it("drops entries missing id", () => {
    const good = { id: "e1", text: "The party arrived", wallTime: 1000 };
    const bad = { text: "They left", wallTime: 2000 };
    const result = parseSessionRecorderState({ entries: [good, bad], exportFolder: null }) as { entries: unknown[] };
    expect(result.entries).toHaveLength(1);
  });
  it("defaults non-string exportFolder to null", () => {
    const result = parseSessionRecorderState({ entries: [], exportFolder: 42 }) as { exportFolder: string | null };
    expect(result.exportFolder).toBeNull();
  });
});

describe("parseMapDisplayState", () => {
  it("passes valid outer shape through", () => {
    const s = { mapsFolder: "/maps", scenes: [{ id: "s1" }], activeSceneId: "s1" };
    const result = parseMapDisplayState(s) as typeof s;
    expect(result.mapsFolder).toBe("/maps");
    expect(result.scenes).toHaveLength(1);
  });
  it("defaults non-array scenes to empty array", () => {
    const result = parseMapDisplayState({ mapsFolder: null, scenes: "corrupt", activeSceneId: "" }) as { scenes: unknown[] };
    expect(result.scenes).toEqual([]);
  });
  it("returns default for null", () => {
    const result = parseMapDisplayState(null) as { mapsFolder: null; scenes: unknown[] };
    expect(result.mapsFolder).toBeNull();
    expect(result.scenes).toEqual([]);
  });
  it("preserves the one-shot locateRequest so a 'pin this place' click survives the render-path re-parse", () => {
    const s = { mapsFolder: null, scenes: [], activeSceneId: "", locateRequest: { id: "r1", locationRef: "locations/x.json", label: "Citadel" } };
    const result = parseMapDisplayState(s) as typeof s;
    expect(result.locateRequest).toEqual({ id: "r1", locationRef: "locations/x.json", label: "Citadel" });
  });
  it("falls back to undefined for a garbage locateRequest shape", () => {
    const result = parseMapDisplayState({ mapsFolder: null, scenes: [], activeSceneId: "", locateRequest: { id: "r1" } }) as { locateRequest?: unknown };
    expect(result.locateRequest).toBeUndefined();
  });
});

describe("parseRulesReferenceState", () => {
  it("passes valid state through", () => {
    const s = { rulesFolder: "/vault/rules", selectedFile: "spells.md" };
    expect(parseRulesReferenceState(s)).toEqual(s);
  });
  it("defaults both fields for null input", () => {
    expect(parseRulesReferenceState(null)).toEqual({ rulesFolder: null, selectedFile: null });
  });
  it("defaults non-string rulesFolder to null", () => {
    const result = parseRulesReferenceState({ rulesFolder: 42, selectedFile: null }) as { rulesFolder: string | null };
    expect(result.rulesFolder).toBeNull();
  });
  it("defaults non-string selectedFile to null", () => {
    const result = parseRulesReferenceState({ rulesFolder: "/vault/rules", selectedFile: true }) as { selectedFile: string | null };
    expect(result.selectedFile).toBeNull();
  });
});

describe("parseRuleCardsState", () => {
  it("passes valid state through", () => {
    const good = { id: "c1", category: "Combat", title: "Grappling", body: "You can grapple..." };
    const result = parseRuleCardsState({ cards: [good], selectedId: "c1", query: "" }) as { cards: unknown[] };
    expect(result.cards).toEqual([good]);
  });
  it("drops cards missing id", () => {
    const good = { id: "c1", category: "Combat", title: "Grappling", body: "" };
    const bad = { category: "Combat", title: "No id", body: "" };
    const result = parseRuleCardsState({ cards: [good, bad], selectedId: null, query: "" }) as { cards: unknown[] };
    expect(result.cards).toHaveLength(1);
  });
  it("returns default for null", () => {
    expect(parseRuleCardsState(null)).toEqual({ cards: [], selectedId: null, query: "" });
  });
  it("defaults a missing title to 'Untitled'", () => {
    const result = parseRuleCardsState({ cards: [{ id: "c1", category: "", body: "" }], selectedId: null, query: "" }) as { cards: { title: string }[] };
    expect(result.cards[0].title).toBe("Untitled");
  });
});

describe("parseRollTablesState", () => {
  it("passes valid state through", () => {
    const table = { id: "t1", name: "Weather", die: 8, entries: [{ id: "e1", text: "Rain", weight: 1 }] };
    const result = parseRollTablesState({ tables: [table], selectedId: "t1", mode: "browse", history: [] }) as { tables: unknown[]; mode: string };
    expect(result.tables).toEqual([table]);
    expect(result.mode).toBe("browse");
  });
  it("drops tables missing id and entries missing id", () => {
    const good = { id: "t1", name: "A", die: 20, entries: [{ id: "e1", text: "x", weight: 1 }, { text: "no id", weight: 1 }] };
    const bad = { name: "no id", die: 20, entries: [] };
    const result = parseRollTablesState({ tables: [good, bad], selectedId: null, mode: "roll", history: [] }) as { tables: { entries: unknown[] }[] };
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].entries).toHaveLength(1);
  });
  it("defaults a missing die to 20 and weight to 1", () => {
    const result = parseRollTablesState({ tables: [{ id: "t1", name: "A", entries: [{ id: "e1", text: "x" }] }], selectedId: null, mode: "roll", history: [] }) as { tables: { die: number; entries: { weight: number }[] }[] };
    expect(result.tables[0].die).toBe(20);
    expect(result.tables[0].entries[0].weight).toBe(1);
  });
  it("returns default for null", () => {
    expect(parseRollTablesState(null)).toEqual({ tables: [], selectedId: null, mode: "roll", history: [] });
  });
  it("falls back to roll mode for an unknown mode", () => {
    const result = parseRollTablesState({ tables: [], selectedId: null, mode: "nonsense", history: [] }) as { mode: string };
    expect(result.mode).toBe("roll");
  });
});

describe("parseEncounterBuilderState", () => {
  it("passes valid state through", () => {
    const enc = { id: "e1", name: "Ambush", notes: "at the bridge", members: [{ id: "m1", creatureId: "c1", name: "Goblin", count: 4 }] };
    const result = parseEncounterBuilderState({ encounters: [enc], selectedId: "e1" }) as { encounters: unknown[]; selectedId: string };
    expect(result.encounters).toEqual([enc]);
    expect(result.selectedId).toBe("e1");
  });
  it("drops encounters missing id and members missing id", () => {
    const good = { id: "e1", name: "A", members: [{ id: "m1", creatureId: "c1", name: "Goblin", count: 2 }, { creatureId: "c2", name: "no id", count: 1 }] };
    const bad = { name: "no id", members: [] };
    const result = parseEncounterBuilderState({ encounters: [good, bad], selectedId: null }) as { encounters: { members: unknown[] }[] };
    expect(result.encounters).toHaveLength(1);
    expect(result.encounters[0].members).toHaveLength(1);
  });
  it("defaults a missing count to 1", () => {
    const result = parseEncounterBuilderState({ encounters: [{ id: "e1", name: "A", members: [{ id: "m1", creatureId: "c1", name: "Goblin" }] }], selectedId: null }) as { encounters: { members: { count: number }[] }[] };
    expect(result.encounters[0].members[0].count).toBe(1);
  });
  it("returns default for null", () => {
    expect(parseEncounterBuilderState(null)).toEqual({ encounters: [], selectedId: null });
  });
});

describe("parseCardDecksState", () => {
  it("passes valid state through", () => {
    const deck = { id: "d1", name: "Tarokka", cards: [{ id: "c1", title: "The Fates", count: 1 }] };
    const draw = { d1: { drawPile: ["c1#0"], discard: [{ key: "c1#0", cardId: "c1", at: 5 }] } };
    const result = parseCardDecksState({ decks: [deck], selectedId: "d1", mode: "edit", draw }) as { decks: unknown[]; mode: string; draw: unknown };
    expect(result.decks).toEqual([deck]);
    expect(result.mode).toBe("edit");
    expect(result.draw).toEqual(draw);
  });
  it("drops decks missing id and cards missing id", () => {
    const good = { id: "d1", name: "A", cards: [{ id: "c1", title: "x", count: 1 }, { title: "no id", count: 1 }] };
    const bad = { name: "no id", cards: [] };
    const result = parseCardDecksState({ decks: [good, bad], selectedId: null, mode: "play", draw: {} }) as { decks: { cards: unknown[] }[] };
    expect(result.decks).toHaveLength(1);
    expect(result.decks[0].cards).toHaveLength(1);
  });
  it("defaults a missing count to 1", () => {
    const result = parseCardDecksState({ decks: [{ id: "d1", name: "A", cards: [{ id: "c1", title: "x" }] }], selectedId: null, mode: "play", draw: {} }) as { decks: { cards: { count: number }[] }[] };
    expect(result.decks[0].cards[0].count).toBe(1);
  });
  it("returns default for null", () => {
    expect(parseCardDecksState(null)).toEqual({ decks: [], selectedId: null, mode: "play", draw: {} });
  });
  it("falls back to play mode for an unknown mode", () => {
    const result = parseCardDecksState({ decks: [], selectedId: null, mode: "nonsense", draw: {} }) as { mode: string };
    expect(result.mode).toBe("play");
  });
});

describe("parseProgressClocksState", () => {
  it("passes valid state through", () => {
    const clock = { id: "c1", name: "Alarm raised", segments: 6, filled: 3 };
    const result = parseProgressClocksState({ clocks: [clock] }) as { clocks: unknown[] };
    expect(result.clocks).toEqual([clock]);
  });
  it("drops clocks missing an id", () => {
    const good = { id: "c1", name: "A", segments: 4, filled: 0 };
    const bad = { name: "no id", segments: 4, filled: 0 };
    const result = parseProgressClocksState({ clocks: [good, bad] }) as { clocks: unknown[] };
    expect(result.clocks).toEqual([good]);
  });
  it("defaults a missing segments to 6 and filled to 0", () => {
    const result = parseProgressClocksState({ clocks: [{ id: "c1", name: "A" }] }) as { clocks: { segments: number; filled: number }[] };
    expect(result.clocks[0].segments).toBe(6);
    expect(result.clocks[0].filled).toBe(0);
  });
  it("returns default for null", () => {
    expect(parseProgressClocksState(null)).toEqual({ clocks: [] });
  });
  it("passes shownClockId through", () => {
    const result = parseProgressClocksState({ clocks: [], shownClockId: "c1" }) as { shownClockId: string | null };
    expect(result.shownClockId).toBe("c1");
  });
  it("corrects a non-string shownClockId to null", () => {
    const result = parseProgressClocksState({ clocks: [], shownClockId: 42 }) as { shownClockId: string | null };
    expect(result.shownClockId).toBeNull();
  });
});

describe("parseHandoutGalleryState", () => {
  it("passes a folder through", () => {
    expect(parseHandoutGalleryState({ folder: "/vault/handouts" })).toEqual({ folder: "/vault/handouts" });
  });
  it("returns default for null", () => {
    expect(parseHandoutGalleryState(null)).toEqual({ folder: null });
  });
  it("defaults a non-string folder to null", () => {
    expect(parseHandoutGalleryState({ folder: 42 })).toEqual({ folder: null });
  });
});

describe("parseSessionClockState", () => {
  it("passes valid state through", () => {
    const s = { mode: "timer" as const, running: true, startedAt: 1000, accumulatedMs: 5000, showSeconds: true };
    expect(parseSessionClockState(s)).toEqual(s);
  });
  it("returns default for null", () => {
    expect(parseSessionClockState(null)).toEqual({ mode: "clock", running: false, startedAt: null, accumulatedMs: 0, showSeconds: false });
  });
  it("defaults an invalid mode to 'clock'", () => {
    const result = parseSessionClockState({ mode: "stopwatch", running: false, startedAt: null, accumulatedMs: 0, showSeconds: false }) as { mode: string };
    expect(result.mode).toBe("clock");
  });
  it("defaults a non-number accumulatedMs to 0", () => {
    const result = parseSessionClockState({ mode: "timer", running: false, startedAt: null, accumulatedMs: "corrupt", showSeconds: false }) as { accumulatedMs: number };
    expect(result.accumulatedMs).toBe(0);
  });
});

describe("parseXpTrackerState", () => {
  it("passes valid state through", () => {
    const s = { mode: "perPc" as const, partyXp: 0, perPc: { pc1: 300 }, thresholds: [0, 300] };
    expect(parseXpTrackerState(s)).toEqual({ ...s, history: [] });
  });
  it("returns default for null", () => {
    expect(parseXpTrackerState(null)).toEqual({ mode: "party", partyXp: 0, perPc: {}, history: [] });
  });
  it("keeps valid history entries and drops ones missing an id", () => {
    const good = { id: "a1", label: "+500 XP", at: 1720000000000, prevPartyXp: 0, prevPerPc: {} };
    const bad = { label: "+300 XP", prevPartyXp: 0, prevPerPc: {} };
    const result = parseXpTrackerState({ mode: "party", partyXp: 500, perPc: {}, history: [good, bad] }) as { history: unknown[] };
    expect(result.history).toEqual([good]);
  });
  it("keeps a history entry without a timestamp (pre-timestamp saves)", () => {
    const legacy = { id: "a1", label: "+500 XP", prevPartyXp: 0, prevPerPc: {} };
    const result = parseXpTrackerState({ mode: "party", partyXp: 500, perPc: {}, history: [legacy] }) as { history: { at?: number }[] };
    expect(result.history).toHaveLength(1);
    expect(result.history[0].at).toBeUndefined();
  });
  it("defaults a missing history to an empty array (pre-history saves)", () => {
    const result = parseXpTrackerState({ mode: "party", partyXp: 100, perPc: {} }) as { history: unknown[] };
    expect(result.history).toEqual([]);
  });
  it("defaults an invalid mode to 'party'", () => {
    const result = parseXpTrackerState({ mode: "solo", partyXp: 0, perPc: {} }) as { mode: string };
    expect(result.mode).toBe("party");
  });
  it("defaults one corrupt perPc entry to 0 without dropping the others", () => {
    const result = parseXpTrackerState({ mode: "perPc", partyXp: 0, perPc: { pc1: 300, pc2: "corrupt" } }) as { perPc: Record<string, number> };
    expect(result.perPc).toEqual({ pc1: 300, pc2: 0 });
  });
  it("leaves thresholds undefined when omitted (use built-in defaults)", () => {
    const result = parseXpTrackerState({ mode: "party", partyXp: 0, perPc: {} }) as { thresholds?: number[] };
    expect(result.thresholds).toBeUndefined();
  });
});

describe("parseInitiativeTrackerState - showOnPlayer", () => {
  it("defaults showOnPlayer to false on old workspace missing the field", () => {
    const result = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1 }) as { showOnPlayer: boolean };
    expect(result.showOnPlayer).toBe(false);
  });
  it("defaults showOnPlayer to false on null input", () => {
    const result = parseInitiativeTrackerState(null) as { showOnPlayer: boolean };
    expect(result.showOnPlayer).toBe(false);
  });
  it("preserves showOnPlayer: true", () => {
    const state = { combatants: [], currentId: null, round: 1, showOnPlayer: true };
    const result = parseInitiativeTrackerState(state) as { showOnPlayer: boolean };
    expect(result.showOnPlayer).toBe(true);
  });
});

describe("parseMapDisplayState - mapScale and gridOffset survive round-trip", () => {
  it("passes scenes containing mapScale and gridOffset through the outer schema", () => {
    const scene = {
      id: "s1",
      mapScale: { mode: "grid", unitLabel: "ft", unitsPerCell: 5 },
      gridOffsetX: 3,
      gridOffsetY: 7,
    };
    const s = { mapsFolder: "/maps", scenes: [scene], activeSceneId: "s1" };
    const result = parseMapDisplayState(s) as typeof s;
    expect(result.scenes).toHaveLength(1);
    const resultScene = result.scenes[0] as typeof scene;
    expect(resultScene.mapScale).toEqual(scene.mapScale);
    expect(resultScene.gridOffsetX).toBe(3);
    expect(resultScene.gridOffsetY).toBe(7);
  });
});

describe("parseTimeTrackerState", () => {
  it("passes valid state through", () => {
    const s = { currentDate: null, currentHour: 14, currentMinute: 30, history: [], showOnPlayer: true };
    const result = parseTimeTrackerState(s) as typeof s;
    expect(result.currentHour).toBe(14);
    expect(result.showOnPlayer).toBe(true);
  });
  it("defaults non-number currentHour to 8", () => {
    const result = parseTimeTrackerState({ currentDate: null, currentHour: "noon", currentMinute: 0, history: [], showOnPlayer: false }) as { currentHour: number };
    expect(result.currentHour).toBe(8);
  });
  it("returns default for null", () => {
    const result = parseTimeTrackerState(null) as { currentHour: number; showOnPlayer: boolean };
    expect(result.currentHour).toBe(8);
    expect(result.showOnPlayer).toBe(false);
  });
  it("defaults missing currentSecond to 0 (pre-seconds saves)", () => {
    const result = parseTimeTrackerState({ currentDate: null, currentHour: 14, currentMinute: 30, history: [], showOnPlayer: false }) as { currentSecond: number };
    expect(result.currentSecond).toBe(0);
  });
  it("keeps a valid currentSecond", () => {
    const result = parseTimeTrackerState({ currentDate: null, currentHour: 14, currentMinute: 30, currentSecond: 42, history: [], showOnPlayer: false }) as { currentSecond: number };
    expect(result.currentSecond).toBe(42);
  });
});

describe("parseRelationshipWebState", () => {
  it("passes valid state through", () => {
    const s = {
      nodes: [{ id: "n1", kind: "npc", label: "Vex", ref: "npcs/vex.json", x: 10, y: -5 }],
      edges: [{ id: "e1", from: "n1", to: "n2", type: "ally" }],
      selectedId: "n1",
    };
    const result = parseRelationshipWebState(s) as typeof s;
    expect(result.nodes).toHaveLength(1);
    expect(result.edges[0].type).toBe("ally");
  });
  it("drops nodes missing an id and coerces a bad kind/edge type to custom", () => {
    const result = parseRelationshipWebState({
      nodes: [{ kind: "npc", label: "x", ref: null, x: 0, y: 0 }, { id: "n1", kind: "wat", label: "y", ref: null, x: 0, y: 0 }],
      edges: [{ id: "e1", from: "a", to: "b", type: "bogus" }],
    }) as { nodes: { kind: string }[]; edges: { type: string }[] };
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].kind).toBe("custom");
    expect(result.edges[0].type).toBe("custom");
  });
  it("returns default for null", () => {
    expect(parseRelationshipWebState(null)).toEqual({ nodes: [], edges: [], selectedId: null });
  });
});

describe("parseCampaignTimelineState", () => {
  it("passes valid state through", () => {
    const s = { entries: [{ id: "e1", title: "Party meets Vex", body: "at the inn", category: "plot", date: { year: 1492, month: 0, day: 15 } }] };
    const result = parseCampaignTimelineState(s) as typeof s;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe("plot");
    expect(result.entries[0].date.year).toBe(1492);
  });
  it("keeps a custom (non-preset) category label", () => {
    const s = { entries: [{ id: "e1", title: "x", category: "betrayal arc", date: { year: 1, month: 0, day: 1 } }] };
    const result = parseCampaignTimelineState(s) as { entries: { category: string }[] };
    expect(result.entries[0].category).toBe("betrayal arc");
  });
  it("drops an entry with no id or no date", () => {
    const result = parseCampaignTimelineState({ entries: [
      { title: "no id", category: "plot", date: { year: 1, month: 0, day: 1 } },
      { id: "e2", title: "no date", category: "plot" },
      { id: "e3", title: "ok", category: "plot", date: { year: 1, month: 0, day: 2 } },
    ] }) as { entries: { id: string }[] };
    expect(result.entries.map((e) => e.id)).toEqual(["e3"]);
  });
  it("returns default for null", () => {
    expect(parseCampaignTimelineState(null)).toEqual({ entries: [] });
  });
});
