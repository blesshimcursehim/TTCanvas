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
  parseItemsState,
  parseMerchantsState,
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

  it("keeps the encounter snapshot through a re-parse (strip-mode field must be declared)", () => {
    const enc = { id: "e1", name: "Goblin Ambush", rewardXp: 1200 };
    const result = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1, encounter: enc }) as { encounter?: typeof enc };
    expect(result.encounter).toEqual(enc);
  });

  it("leaves the encounter absent for an ad-hoc combat, and drops a corrupt one", () => {
    const none = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1 }) as { encounter?: unknown };
    expect(none.encounter).toBeUndefined();
    const corrupt = parseInitiativeTrackerState({ combatants: [], currentId: null, round: 1, encounter: { name: "no id" } }) as { encounter?: unknown };
    expect(corrupt.encounter).toBeUndefined();
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

type ParsedEnc = { encounters: { rewardXp?: number; members: { source?: { kind: string; id: string }; count: number }[] }[]; selectedId: string | null };

describe("parseEncounterBuilderState", () => {
  it("passes valid state through", () => {
    const enc = {
      id: "e1", name: "Ambush", notes: "at the bridge", rewardXp: 1200,
      members: [{ id: "m1", source: { kind: "bestiary", id: "c1" }, name: "Goblin", count: 4 }],
    };
    const result = parseEncounterBuilderState({ encounters: [enc], selectedId: "e1" }) as ParsedEnc;
    expect(result.encounters).toEqual([enc]);
    expect(result.selectedId).toBe("e1");
  });
  it("keeps every source kind, and a party/npc row's fields", () => {
    const enc = {
      id: "e1", name: "A",
      members: [
        { id: "m1", source: { kind: "party", id: "p1" }, name: "Aria", count: 1, included: false },
        { id: "m2", source: { kind: "npc", id: "npcs/vex.json" }, name: "Vex", count: 2, kind: "ally", rollHp: true, sharedHp: true },
      ],
    };
    const result = parseEncounterBuilderState({ encounters: [enc], selectedId: null }) as ParsedEnc;
    expect(result.encounters[0].members).toEqual(enc.members);
  });
  it("drops encounters missing id and members missing id", () => {
    const good = { id: "e1", name: "A", members: [{ id: "m1", source: { kind: "bestiary", id: "c1" }, name: "Goblin", count: 2 }, { source: { kind: "bestiary", id: "c2" }, name: "no id", count: 1 }] };
    const bad = { name: "no id", members: [] };
    const result = parseEncounterBuilderState({ encounters: [good, bad], selectedId: null }) as ParsedEnc;
    expect(result.encounters).toHaveLength(1);
    expect(result.encounters[0].members).toHaveLength(1);
  });
  it("defaults a missing count to 1", () => {
    const result = parseEncounterBuilderState({ encounters: [{ id: "e1", name: "A", members: [{ id: "m1", source: { kind: "bestiary", id: "c1" }, name: "Goblin" }] }], selectedId: null }) as ParsedEnc;
    expect(result.encounters[0].members[0].count).toBe(1);
  });
  it("returns default for null", () => {
    expect(parseEncounterBuilderState(null)).toEqual({ encounters: [], selectedId: null });
  });

  // ── creatureId -> tagged source migration ──
  it("lifts a legacy creatureId row to a bestiary source and drops the dead field", () => {
    const legacy = { encounters: [{ id: "e1", name: "A", members: [{ id: "m1", creatureId: "c1", name: "Goblin", count: 4 }] }], selectedId: null };
    const result = parseEncounterBuilderState(legacy) as ParsedEnc;
    expect(result.encounters[0].members[0]).toEqual({ id: "m1", source: { kind: "bestiary", id: "c1" }, name: "Goblin", count: 4 });
  });
  it("is idempotent - re-parsing its own output loses nothing (WidgetSlot re-parses every render)", () => {
    const legacy = { encounters: [{ id: "e1", name: "A", rewardXp: 50, members: [{ id: "m1", creatureId: "c1", name: "Goblin", count: 2, groupInit: true }] }], selectedId: null };
    const once = parseEncounterBuilderState(legacy);
    const twice = parseEncounterBuilderState(once);
    expect(twice).toEqual(once);
  });
  it("keeps a row whose source is unreadable, as a missing-source row rather than dropping it", () => {
    const result = parseEncounterBuilderState({
      encounters: [{ id: "e1", name: "A", members: [{ id: "m1", source: "nonsense", name: "Goblin", count: 1 }] }],
      selectedId: null,
    }) as ParsedEnc;
    expect(result.encounters[0].members).toHaveLength(1);
    expect(result.encounters[0].members[0].source).toEqual({ kind: "bestiary", id: "" });
  });
  it("prefers an existing source over a stale creatureId left alongside it", () => {
    const result = parseEncounterBuilderState({
      encounters: [{ id: "e1", name: "A", members: [{ id: "m1", creatureId: "old", source: { kind: "npc", id: "npcs/vex.json" }, name: "Vex", count: 1 }] }],
      selectedId: null,
    }) as ParsedEnc;
    expect(result.encounters[0].members[0].source).toEqual({ kind: "npc", id: "npcs/vex.json" });
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
  it("seeds the four default jumps when the field is absent (pre-jumps saves)", () => {
    const result = parseTimeTrackerState({ currentDate: null, currentHour: 8, currentMinute: 0, history: [], showOnPlayer: false }) as { jumps: unknown[] };
    expect(result.jumps).toHaveLength(4);
  });
  it("keeps a valid jumps list, dropping only the corrupt entries", () => {
    const result = parseTimeTrackerState({
      currentDate: null, currentHour: 8, currentMinute: 0, history: [], showOnPlayer: false,
      jumps: [
        { id: "a", label: "Long Rest", amount: 8, unit: "hour" },
        { id: "b", label: "bad amount", amount: "lots", unit: "hour" },
        { id: "c", label: "Rewind", amount: -1, unit: "day" },
        { id: "d", label: "bad unit", amount: 1, unit: "fortnight" },
      ],
    }) as { jumps: { id: string }[] };
    expect(result.jumps.map((j) => j.id)).toEqual(["a", "c"]);
  });
  it("respects an intentionally empty jumps list (not seeded back to defaults)", () => {
    const result = parseTimeTrackerState({ currentDate: null, currentHour: 8, currentMinute: 0, history: [], showOnPlayer: false, jumps: [] }) as { jumps: unknown[] };
    expect(result.jumps).toEqual([]);
  });
  it("falls back to defaults when jumps is a non-array", () => {
    const result = parseTimeTrackerState({ currentDate: null, currentHour: 8, currentMinute: 0, history: [], showOnPlayer: false, jumps: "oops" }) as { jumps: unknown[] };
    expect(result.jumps).toHaveLength(4);
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
    expect(parseCampaignTimelineState(null)).toEqual({ entries: [], sortDirection: "asc" });
  });
  it("passes through a valid sortDirection", () => {
    const result = parseCampaignTimelineState({ entries: [], sortDirection: "desc" }) as { sortDirection: string };
    expect(result.sortDirection).toBe("desc");
  });
  it("defaults sortDirection to asc when missing or invalid", () => {
    expect((parseCampaignTimelineState({ entries: [] }) as { sortDirection: string }).sortDirection).toBe("asc");
    expect((parseCampaignTimelineState({ entries: [], sortDirection: "sideways" }) as { sortDirection: string }).sortDirection).toBe("asc");
  });
});

describe("parseItemsState", () => {
  // Carries every field, so "passes valid state through" doubles as the guard against the strip-mode
  // trap: this is a z.object that WidgetSlot re-parses each render, so a field nobody declared here
  // is silently dropped every frame.
  const item = {
    id: "i1", name: "Sunblade", kind: "weapon", rarity: "very-rare",
    valueCp: 500000, weightLb: 3, description: "Radiant.", attuned: true,
    damage: [{ dice: "1d8+8", type: "piercing" }, { dice: "1d6", type: "thunder" }],
    versatileDice: "1d10", enchantment: 3, range: "5 ft", armourClass: "",
    properties: ["versatile", "finesse"],
    holdings: [{ holderId: null, qty: 1 }],
  };
  const base = {
    items: [item], currency: { cp: 1, sp: 2, ep: 0, gp: 3, pp: 0 },
    query: "", kindFilter: null, heldFilter: "all", showWeight: false, carryLimitLb: null,
  };

  it("passes valid state through", () => {
    expect(parseItemsState(base)).toEqual(base);
  });

  it("drops an item with no id rather than inventing one", () => {
    const result = parseItemsState({ ...base, items: [item, { name: "No id", holdings: [] }] }) as { items: unknown[] };
    expect(result.items).toHaveLength(1);
  });

  it("falls back to gear for an unknown kind", () => {
    const result = parseItemsState({ ...base, items: [{ ...item, kind: "wondrous" }] }) as { items: { kind: string }[] };
    expect(result.items[0].kind).toBe("gear");
  });

  it("drops an unknown rarity instead of keeping the item stuck", () => {
    const result = parseItemsState({ ...base, items: [{ ...item, rarity: "mythic" }] }) as { items: { rarity?: string }[] };
    expect(result.items[0].rarity).toBeUndefined();
  });

  it("drops a holding with a non-numeric quantity", () => {
    const holdings = [{ holderId: "pc1", qty: "many" }, { holderId: null, qty: 2 }];
    const result = parseItemsState({ ...base, items: [{ ...item, holdings }] }) as { items: { holdings: unknown[] }[] };
    expect(result.items[0].holdings).toEqual([{ holderId: null, qty: 2 }]);
  });

  it("keeps the rest of an item when one field is garbage", () => {
    const result = parseItemsState({ ...base, items: [{ ...item, weightLb: "heavy" }] }) as { items: { name: string; weightLb?: number }[] };
    expect(result.items[0].name).toBe("Sunblade");
    expect(result.items[0].weightLb).toBeUndefined();
  });

  it("zeroes a corrupt coin without wiping the purse", () => {
    const result = parseItemsState({ ...base, currency: { cp: "lots", sp: 2, ep: 0, gp: 3, pp: 0 } }) as { currency: Record<string, number> };
    expect(result.currency).toEqual({ cp: 0, sp: 2, ep: 0, gp: 3, pp: 0 });
  });

  it("resets an unknown kindFilter so nothing filters everything out", () => {
    const result = parseItemsState({ ...base, kindFilter: "wondrous" }) as { kindFilter: string | null };
    expect(result.kindFilter).toBeNull();
  });

  it("keeps damage notation as written, since it is free text and not an enum", () => {
    const damage = [{ dice: "1d6 per level" }];
    const result = parseItemsState({ ...base, items: [{ ...item, damage }] }) as { items: { damage?: unknown }[] };
    expect(result.items[0].damage).toEqual(damage);
  });

  it("drops a damage component with no dice rather than rendering a blank row", () => {
    const damage = [{ dice: "1d8", type: "piercing" }, { dice: "", type: "fire" }, { type: "cold" }];
    const result = parseItemsState({ ...base, items: [{ ...item, damage }] }) as { items: { damage?: unknown }[] };
    expect(result.items[0].damage).toEqual([{ dice: "1d8", type: "piercing" }]);
  });

  // Damage was briefly a single string before it became a list. Nothing shipped with that shape, but
  // a vault opened by a development build could hold it, and this is a strip-mode object: an
  // unrecognised value is dropped on the very next render, so the GM would watch it vanish.
  it("folds the older single-string damage into one component instead of losing it", () => {
    const result = parseItemsState({ ...base, items: [{ ...item, damage: "1d8+1" }] }) as { items: { damage?: unknown }[] };
    expect(result.items[0].damage).toEqual([{ dice: "1d8+1" }]);
  });

  it("drops the non-strings out of a properties list rather than the whole list", () => {
    const result = parseItemsState({ ...base, items: [{ ...item, properties: ["light", 7, null, "thrown"] }] }) as { items: { properties?: string[] }[] };
    expect(result.items[0].properties).toEqual(["light", "thrown"]);
  });

  it("empties a properties field that is not a list at all", () => {
    const result = parseItemsState({ ...base, items: [{ ...item, properties: "light" }] }) as { items: { properties?: string[]; name: string }[] };
    expect(result.items[0].properties).toEqual([]);
    expect(result.items[0].name).toBe("Sunblade");
  });

  it("returns default for null", () => {
    expect(parseItemsState(null)).toEqual({
      items: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      query: "", kindFilter: null, heldFilter: "all", showWeight: false, carryLimitLb: null,
    });
  });
});

describe("parseItemsState quantity and range guards", () => {
  const item = { id: "i1", name: "Rations", kind: "gear", holdings: [] as unknown[] };
  const base = {
    items: [item], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    query: "", kindFilter: null, heldFilter: "all", showWeight: false, carryLimitLb: null,
  };

  function holdingsOf(holdings: unknown[]): unknown[] {
    const result = parseItemsState({ ...base, items: [{ ...item, holdings }] }) as { items: { holdings: unknown[] }[] };
    return result.items[0].holdings;
  }

  it("drops a fractional quantity rather than flooring it to a phantom holding", () => {
    expect(holdingsOf([{ holderId: "pc1", qty: 0.5 }])).toEqual([]);
  });

  it("drops a zero or negative quantity", () => {
    expect(holdingsOf([{ holderId: "pc1", qty: 0 }, { holderId: "pc2", qty: -3 }])).toEqual([]);
  });

  it("keeps the valid holdings beside a dropped one", () => {
    expect(holdingsOf([{ holderId: "pc1", qty: -1 }, { holderId: null, qty: 4 }]))
      .toEqual([{ holderId: null, qty: 4 }]);
  });

  it("zeroes a negative or fractional coin", () => {
    const result = parseItemsState({ ...base, currency: { cp: -5, sp: 1.5, ep: 0, gp: 3, pp: 0 } }) as { currency: Record<string, number> };
    expect(result.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 });
  });

  it("drops a negative or fractional value in copper", () => {
    const neg = parseItemsState({ ...base, items: [{ ...item, valueCp: -100 }] }) as { items: { valueCp?: number }[] };
    const frac = parseItemsState({ ...base, items: [{ ...item, valueCp: 12.5 }] }) as { items: { valueCp?: number }[] };
    expect(neg.items[0].valueCp).toBeUndefined();
    expect(frac.items[0].valueCp).toBeUndefined();
  });

  it("allows a fractional weight but not a negative one", () => {
    const half = parseItemsState({ ...base, items: [{ ...item, weightLb: 0.5 }] }) as { items: { weightLb?: number }[] };
    const neg = parseItemsState({ ...base, items: [{ ...item, weightLb: -2 }] }) as { items: { weightLb?: number }[] };
    expect(half.items[0].weightLb).toBe(0.5);
    expect(neg.items[0].weightLb).toBeUndefined();
  });

  it("drops a negative carry limit", () => {
    const result = parseItemsState({ ...base, carryLimitLb: -50 }) as { carryLimitLb: number | null };
    expect(result.carryLimitLb).toBeNull();
  });
});

// App.tsx builds RollTablesContext and InventoryContext off these slices before any widget renders,
// so a corrupt collection has to come back as an empty array here rather than reaching a .map/for-of
// at app level, outside every widget error boundary.
describe("shared-context slices survive corrupt state", () => {
  it("turns a non-array roll-tables collection into an empty one", () => {
    const result = parseRollTablesState({ tables: "corrupt", selectedId: null, mode: "roll", history: [] }) as { tables: unknown[] };
    expect(result.tables).toEqual([]);
  });

  it("turns a non-array inventory collection into an empty one", () => {
    const result = parseItemsState({ items: "corrupt" }) as { items: unknown[] };
    expect(result.items).toEqual([]);
  });

  it("turns non-array holdings into an empty list instead of a non-iterable", () => {
    const item = { id: "i1", name: "Rations", kind: "gear", holdings: 7 };
    const result = parseItemsState({ items: [item] }) as { items: { holdings: unknown[] }[] };
    expect(result.items[0].holdings).toEqual([]);
  });

  it("returns usable defaults when a widget has never been opened", () => {
    expect((parseItemsState(undefined) as { items: unknown[] }).items).toEqual([]);
    expect((parseRollTablesState(undefined) as { tables: unknown[] }).tables).toEqual([]);
  });
});

describe("parseMerchantsState", () => {
  const merchant = {
    id: "m1", name: "Dorn's Forge", kind: "blacksmith",
    owner: "Dorn", ownerRef: "npcs/dorn.json",
    priceModifier: 1.2, buybackModifier: 0.5, rarities: ["common", "uncommon"],
    stock: [{ itemId: "i1", qty: 3 }, { itemId: "i2", qty: null }],
  };
  const base = { merchants: [merchant], selectedId: "m1", query: "", kindFilter: null };

  it("passes valid state through", () => {
    expect(parseMerchantsState(base)).toEqual(base);
  });

  it("drops a merchant with no id rather than inventing one", () => {
    const result = parseMerchantsState({ ...base, merchants: [{ ...merchant, id: undefined }] }) as { merchants: unknown[] };
    expect(result.merchants).toEqual([]);
  });

  it("falls back to general for an unknown kind", () => {
    const result = parseMerchantsState({ ...base, merchants: [{ ...merchant, kind: "fishmonger" }] }) as { merchants: { kind: string }[] };
    expect(result.merchants[0].kind).toBe("general");
  });

  it("drops a stock row with no item reference, keeping its siblings", () => {
    const stock = [{ itemId: "i1", qty: 1 }, { qty: 2 }, { itemId: "i3", qty: 3 }];
    const result = parseMerchantsState({ ...base, merchants: [{ ...merchant, stock }] }) as { merchants: { stock: unknown[] }[] };
    expect(result.merchants[0].stock).toEqual([{ itemId: "i1", qty: 1 }, { itemId: "i3", qty: 3 }]);
  });

  it("keeps null qty meaning unlimited rather than defaulting it to a number", () => {
    const result = parseMerchantsState(base) as { merchants: { stock: { qty: number | null }[] }[] };
    expect(result.merchants[0].stock[1].qty).toBeNull();
  });

  it("rescues a zero or non-finite price modifier, which would price the shelf at nothing", () => {
    const bad = [{ ...merchant, priceModifier: 0 }, { ...merchant, id: "m2", priceModifier: "loads" }];
    const result = parseMerchantsState({ ...base, merchants: bad }) as { merchants: { priceModifier: number }[] };
    expect(result.merchants.map((m) => m.priceModifier)).toEqual([1, 1]);
  });

  it("resets an unknown kindFilter so nothing filters everything out", () => {
    const result = parseMerchantsState({ ...base, kindFilter: "fishmonger" }) as { kindFilter: string | null };
    expect(result.kindFilter).toBeNull();
  });

  it("returns default for null", () => {
    expect(parseMerchantsState(null)).toEqual({
      merchants: [], selectedId: null, query: "", kindFilter: null,
    });
  });

  it("gives a merchant written before rarities existed a usable preset, not an empty list", () => {
    // An empty list reads as "can never generate anything", which is a silent, confusing default.
    const { rarities: _rarities, ...legacy } = merchant;
    const result = parseMerchantsState({ ...base, merchants: [legacy] }) as { merchants: { rarities: string[] }[] };
    expect(result.merchants[0].rarities).toEqual(["common", "uncommon"]);
  });

  it("resets a corrupt rarity list to the same preset", () => {
    const result = parseMerchantsState({
      ...base, merchants: [{ ...merchant, rarities: ["shiny", 7] }],
    }) as { merchants: { rarities: string[] }[] };
    expect(result.merchants[0].rarities).toEqual(["common", "uncommon"]);
  });

  it("keeps an explicit artifact tick, since that is the GM's call to make", () => {
    const result = parseMerchantsState({
      ...base, merchants: [{ ...merchant, rarities: ["artifact"] }],
    }) as { merchants: { rarities: string[] }[] };
    expect(result.merchants[0].rarities).toEqual(["artifact"]);
  });

  it("keeps a stock row's name snapshot", () => {
    const stock = [{ itemId: "i1", qty: 1, name: "Flametongue" }];
    const result = parseMerchantsState({
      ...base, merchants: [{ ...merchant, stock }],
    }) as { merchants: { stock: { name?: string }[] }[] };
    expect(result.merchants[0].stock[0].name).toBe("Flametongue");
  });
});
