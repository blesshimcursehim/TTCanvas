// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { z } from "zod";
import { DEFAULT_JUMPS, MAX_JUMP_AMOUNT } from "@ttcanvas/core";
import { createDefaultNpcGeneratorState } from "@ttcanvas/widgets-builtin";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Filters array elements that fail validation instead of discarding the whole array.
function filterArr<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .transform((arr): T[] =>
      arr.flatMap((item) => {
        const r = schema.safeParse(item);
        return r.success ? [r.data] : [];
      })
    )
    .catch([]);
}

// Shared by party members and Bestiary creatures - a bad/imported value on any score (or the whole
// field) falls back to 10 (the "+0 modifier" baseline) rather than letting a corrupt entry (e.g.
// `{ dex: "bad" }`) turn into NaN once abilityModifier() is applied to a rolled initiative.
const abilityScoresSchema = z
  .object({
    str: z.number().catch(10),
    dex: z.number().catch(10),
    con: z.number().catch(10),
    int: z.number().catch(10),
    wis: z.number().catch(10),
    cha: z.number().catch(10),
  })
  .catch({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });

// ---------------------------------------------------------------------------
// sticky-note
// ---------------------------------------------------------------------------

const stickyNoteSchema = z
  .object({
    content: z.string().catch(""),
    color: z.enum(["amber", "slate", "sage", "rose", "lilac"]).optional().catch(undefined),
  })
  .catch({ content: "" });

export function parseStickyNoteState(raw: unknown): unknown {
  return stickyNoteSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// party-tracker
// ---------------------------------------------------------------------------

const partyMemberSchema = z
  .object({
    id: z.string(),
    name: z.string().catch("Unknown"),
    race: z.string().catch(""),
    cls: z.string().catch(""),
    level: z.number().catch(1),
    sp: z.number().catch(0),
    maxSp: z.number().catch(0),
    pp: z.number().catch(10),
    gp: z.number().catch(0),
    notes: z.string().catch(""),
    inspiration: z.boolean().catch(false),
    ac: z.number().catch(10),
    hp: z.number().catch(0),
    maxHp: z.number().catch(0),
    initiative: z.number().catch(0),
    abilityScores: abilityScoresSchema.optional().catch(undefined),
  })
  .passthrough();

const partyTrackerSchema = z
  .object({
    members: filterArr(partyMemberSchema),
    compact: z.boolean().catch(false),
  })
  .catch({ members: [], compact: false });

export function parsePartyTrackerState(raw: unknown): unknown {
  return partyTrackerSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// initiative-tracker
// ---------------------------------------------------------------------------

const combatantSchema = z
  .object({
    id: z.string(),
    name: z.string().catch("Unknown"),
    initiative: z.number().catch(0),
    hp: z.number().catch(0),
    maxHp: z.number().catch(0),
    ac: z.number().catch(10),
    kind: z.enum(["pc", "foe", "ally"]).catch("foe"),
    conditions: z.array(z.string()).optional().catch(undefined),
  })
  .passthrough();

// Group-initiative groups (a shared roll for two+ combatants) - see InitiativeGroup in ITContext.ts.
const initiativeGroupSchema = z
  .object({
    id: z.string(),
    label: z.string().catch("Group"),
    initiative: z.number().catch(0),
    combined: z.boolean().catch(true),
  })
  .passthrough();

// Snapshot of the encounter a combat started from. Must be declared, not passed through: this is a
// strip-mode z.object, and WidgetSlot re-parses every render, so an undeclared field is dropped each
// frame. `.optional().catch(undefined)` so an ad-hoc combat (no encounter) and a corrupt value both
// resolve to absent.
const combatEncounterRefSchema = z
  .object({
    id: z.string(),
    name: z.string().catch("Encounter"),
    rewardXp: z.number().optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

const initiativeTrackerSchema = z
  .object({
    combatants: filterArr(combatantSchema),
    currentId: z.string().nullable().catch(null),
    round: z.number().catch(1),
    showOnPlayer: z.boolean().catch(false),
    autoAdvanceTime: z.boolean().catch(false),
    roundSeconds: z.number().int().positive().catch(6),
    roundAdvances: z.array(z.number()).catch([]),
    groups: filterArr(initiativeGroupSchema),
    lairActionReminder: z.boolean().catch(false),
    encounter: combatEncounterRefSchema,
  })
  .catch({
    combatants: [], currentId: null, round: 1, showOnPlayer: false,
    autoAdvanceTime: false, roundSeconds: 6, roundAdvances: [], groups: [], lairActionReminder: false,
  });

export function parseInitiativeTrackerState(raw: unknown): unknown {
  return initiativeTrackerSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// npc-generator
// ---------------------------------------------------------------------------

const defaultNpcGen = createDefaultNpcGeneratorState();

const npcLockedSchema = z
  .object({
    name: z.boolean().catch(false),
    occupation: z.boolean().catch(false),
    trait: z.boolean().catch(false),
    hook: z.boolean().catch(false),
    voice: z.boolean().catch(false),
    age: z.boolean().catch(false),
  })
  .catch({ name: false, occupation: false, trait: false, hook: false, voice: false, age: false });

const npcGeneratorSchema = z
  .object({
    gender: z.enum(["any", "masculine", "feminine", "other"]).catch("any"),
    race: z.string().catch(defaultNpcGen.race),
    name: z.string().catch(""),
    occupation: z.string().catch(""),
    dndClass: z.string().catch(""),
    level: z.number().nullable().catch(null),
    age: z.number().nullable().catch(null),
    trait: z.string().catch(""),
    hook: z.string().catch(""),
    voice: z.string().catch(""),
    relationship: z.enum(["ally", "neutral", "wary", "hostile"]).nullable().catch(null),
    accentColor: z.string().catch(defaultNpcGen.accentColor),
    locked: npcLockedSchema,
    generateStats: z.boolean().catch(false),
    systemPrompt: z.string().catch(""),
  })
  .passthrough();

export function parseNpcGeneratorState(raw: unknown): unknown {
  const result = npcGeneratorSchema.safeParse(raw);
  return result.success ? result.data : defaultNpcGen;
}

// ---------------------------------------------------------------------------
// npc-library
// ---------------------------------------------------------------------------

const npcLibrarySchema = z
  .object({
    selectedFile: z.string().nullable().catch(null),
    generatorDraft: npcGeneratorSchema.catch({ ...defaultNpcGen }),
  })
  .catch({ selectedFile: null, generatorDraft: { ...defaultNpcGen } });

export function parseNpcLibraryState(raw: unknown): unknown {
  return npcLibrarySchema.parse(raw);
}

// ---------------------------------------------------------------------------
// session-notes
// ---------------------------------------------------------------------------

const sessionNotesSchema = z
  .object({
    notesFolder: z.string().nullable().catch(null),
    selectedFile: z.string().nullable().catch(null),
  })
  .catch({ notesFolder: null, selectedFile: null });

export function parseSessionNotesState(raw: unknown): unknown {
  return sessionNotesSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// session-recorder
// ---------------------------------------------------------------------------

const sessionEntrySchema = z.object({
  id: z.string(),
  text: z.string().catch(""),
  inGameTime: z.string().optional().catch(undefined),
  wallTime: z.number().catch(0),
});

const sessionRecorderSchema = z
  .object({
    entries: filterArr(sessionEntrySchema),
    exportFolder: z.string().nullable().catch(null),
  })
  .catch({ entries: [], exportFolder: null });

export function parseSessionRecorderState(raw: unknown): unknown {
  return sessionRecorderSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// dice-roller
// ---------------------------------------------------------------------------

const rollMacroSchema = z.object({
  id: z.string(),
  label: z.string().catch(""),
  expr: z.string().catch(""),
});

const rollEntrySchema = z.object({
  id: z.string(),
  label: z.string().catch("Roll"),
  expr: z.string().catch(""),
  total: z.number().catch(0),
  breakdown: z.string().catch(""),
  altTotal: z.number().nullable().catch(null),
  adv: z.enum(["advantage", "disadvantage"]).nullable().catch(null),
  crit: z.boolean().catch(false),
  fumble: z.boolean().catch(false),
  // Required (no .catch): every new-format entry stamps `at`, so legacy v0.13 RollResult rows
  // (which have an id but no `at`) are dropped by filterArr rather than surviving as zero-rows.
  at: z.number(),
});

// v0.13 -> v0.14: the widget moved from a single-term parser to macros + a real evaluator, so the
// old { history, customExpr, advantage } shape is dropped by .catch (ephemeral roll history is safe
// to lose on upgrade) and only the new fields are read.
const diceRollerSchema = z
  .object({
    macros: filterArr(rollMacroSchema),
    history: filterArr(rollEntrySchema),
    input: z.string().catch(""),
    adv: z.enum(["advantage", "disadvantage"]).nullable().catch(null),
    query: z.string().catch(""),
    castId: z.string().nullable().catch(null),
  })
  .catch({ macros: [], history: [], input: "", adv: null, query: "", castId: null });

export function parseDiceRollerState(raw: unknown): unknown {
  return diceRollerSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// map-display  (outer shape only - MapDisplay has its own internal migrateState)
// ---------------------------------------------------------------------------

const mapDisplaySchema = z
  .object({
    mapsFolder: z.string().nullable().catch(null),
    scenes: z.array(z.unknown()).catch([]),
    activeSceneId: z.string().catch(""),
    autoPushMap: z.boolean().optional().catch(undefined),
    // One-shot "pin this place" request from the Gazetteer; see MapDisplayState.locateRequest.
    // Kept explicitly (not passthrough) so it survives WidgetSlot's re-parse on every render.
    locateRequest: z
      .object({ id: z.string(), locationRef: z.string(), label: z.string() })
      .optional()
      .catch(undefined),
  })
  .catch({ mapsFolder: null, scenes: [], activeSceneId: "" });

export function parseMapDisplayState(raw: unknown): unknown {
  return mapDisplaySchema.parse(raw);
}

// ---------------------------------------------------------------------------
// sound-board  (outer shape only - SoundBoard has its own internal migration
//               from the legacy flat pads[] shape to scenes[])
// ---------------------------------------------------------------------------

const soundBoardSchema = z
  .object({
    scenes: z.array(z.unknown()).catch([]),
    activeSceneId: z.string().catch(""),
  })
  .catch({ scenes: [], activeSceneId: "" });

export function parseSoundBoardState(raw: unknown): unknown {
  // Legacy flat state (pre-scenes) has no `scenes` array - pass it through untouched so
  // SoundBoard's migrateSoundBoardState can upgrade it; only validate the post-migration shape.
  if (raw && typeof raw === "object" && !Array.isArray((raw as Record<string, unknown>).scenes)) {
    return raw;
  }
  return soundBoardSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// custom-calendar  (CalendarDef is complex - keep def as unknown, validated
//                   separately by validateCalendarDef inside the widget)
// ---------------------------------------------------------------------------

const calendarSchema = z
  .object({
    def: z.unknown().catch(null),
    events: z.array(z.unknown()).catch([]),
    // Transient one-shot (Almanac consumes and clears it) - kept in the schema, not stripped, so it
    // survives the per-render parse and reaches the widget. Validated inside the widget.
    openRequest: z.unknown().optional(),
  })
  .catch({ def: null, events: [] });

export function parseCalendarState(raw: unknown): unknown {
  return calendarSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// time-tracker
// ---------------------------------------------------------------------------

// amount must be a non-zero integer within the shared bound: the editor only produces such values, so
// a fraction, zero (which can't be re-signed), or a runaway magnitude (which could stall the calendar
// conversion) means a hand-edited or corrupt entry - drop it rather than let it through.
const jumpSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= MAX_JUMP_AMOUNT),
  unit: z.enum(["min", "hour", "day", "week"]),
});

// Absent (a Time Tracker saved before jumps existed) seeds the defaults; a present list keeps only its
// valid entries - one corrupt jump is dropped, not the whole bar - and may be intentionally empty. A
// non-array or otherwise unparseable value falls back to the defaults.
const jumpsSchema = z
  .array(z.unknown())
  .optional()
  .transform((arr) =>
    arr === undefined
      ? [...DEFAULT_JUMPS]
      : arr.flatMap((item) => {
          const r = jumpSchema.safeParse(item);
          return r.success ? [r.data] : [];
        }),
  )
  .catch([...DEFAULT_JUMPS]);

const timeTrackerSchema = z
  .object({
    currentDate: z.unknown().catch(null),
    currentHour: z.number().catch(8),
    currentMinute: z.number().catch(0),
    currentSecond: z.number().catch(0),
    history: z.array(z.unknown()).catch([]),
    showOnPlayer: z.boolean().catch(false),
    jumps: jumpsSchema,
  })
  .catch({
    currentDate: null, currentHour: 8, currentMinute: 0, currentSecond: 0,
    history: [], showOnPlayer: false, jumps: [...DEFAULT_JUMPS],
  });

export function parseTimeTrackerState(raw: unknown): unknown {
  return timeTrackerSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// rules-reference
// ---------------------------------------------------------------------------

const rulesReferenceSchema = z
  .object({
    rulesFolder: z.string().nullable().catch(null),
    selectedFile: z.string().nullable().catch(null),
  })
  .catch({ rulesFolder: null, selectedFile: null });

export function parseRulesReferenceState(raw: unknown): unknown {
  return rulesReferenceSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// bestiary
// ---------------------------------------------------------------------------

const bestiaryFolderSchema = z.object({
  id: z.string(),
  name: z.string().catch("Folder"),
  parentId: z.string().nullable().catch(null),
});

const bestiaryEntrySchema = z
  .object({
    id: z.string(),
    name: z.string().catch("Unknown"),
    creatureType: z.string().catch(""),
    tags: z.array(z.string()).catch([]),
    cr: z.string().catch("0"),
    hp: z.number().catch(0),
    ac: z.number().catch(10),
    notes: z.string().catch(""),
    folderId: z.string().nullable().catch(null),
    abilityScores: abilityScoresSchema.optional().catch(undefined),
  })
  .passthrough();

const bestiarySchema = z
  .object({
    entries: filterArr(bestiaryEntrySchema),
    folders: filterArr(bestiaryFolderSchema),
    // A one-shot "open this creature's sheet" request set by a [[creature:...]] link. Kept through the
    // parse (WidgetSlot re-parses every render) so the widget actually receives it; the widget clears it
    // the same frame and the 1s save debounce coalesces set+clear, so it never reaches disk.
    openRequestId: z.string().optional().catch(undefined),
  })
  .catch({ entries: [], folders: [] });

export function parseBestiaryState(raw: unknown): unknown {
  return bestiarySchema.parse(raw);
}

// ---------------------------------------------------------------------------
// rule-cards
// ---------------------------------------------------------------------------

const ruleCardSchema = z.object({
  id: z.string(),
  category: z.string().catch(""),
  title: z.string().catch("Untitled"),
  body: z.string().catch(""),
});

const ruleCardsSchema = z
  .object({
    cards: filterArr(ruleCardSchema),
    selectedId: z.string().nullable().catch(null),
    query: z.string().catch(""),
  })
  .catch({ cards: [], selectedId: null, query: "" });

export function parseRuleCardsState(raw: unknown): unknown {
  return ruleCardsSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// inventory
// ---------------------------------------------------------------------------

// Coins are whole and never negative; a fractional or negative one is a corrupt value, not a debt.
const coinSchema = z.number().int().nonnegative().catch(0);

const currencySchema = z
  .object({
    cp: coinSchema,
    sp: coinSchema,
    ep: coinSchema,
    gp: coinSchema,
    pp: coinSchema,
  })
  .catch({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

const ITEM_KIND_VALUES = ["weapon", "armour", "consumable", "magic", "treasure", "gear"] as const;
const RARITY_VALUES = ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"] as const;

// holderId null = the party stash. A holding with a garbage qty is dropped rather than defaulted,
// since inventing a quantity is worse than losing an entry the ledger never showed correctly. The
// quantity must be a positive integer: a zero or fractional one would leave a holding that the
// holder labels and the row total disagree about (0.5 floors to 0 while the holder still reads as
// carrying it), and a negative one would subtract from the party total.
const holdingSchema = z.object({
  holderId: z.string().nullable().catch(null),
  qty: z.number().int().positive(),
});

const inventoryItemSchema = z.object({
  id: z.string(),
  name: z.string().catch("Unnamed item"),
  kind: z.enum(ITEM_KIND_VALUES).catch("gear"),
  rarity: z.enum(RARITY_VALUES).optional().catch(undefined),
  // Value is in whole copper, weight may be fractional (a 0.5 lb dagger); neither can be negative.
  valueCp: z.number().int().nonnegative().optional().catch(undefined),
  weightLb: z.number().nonnegative().finite().optional().catch(undefined),
  description: z.string().optional().catch(undefined),
  attuned: z.boolean().optional().catch(undefined),
  holdings: filterArr(holdingSchema),
});

const INVENTORY_DEFAULT = {
  items: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  query: "",
  kindFilter: null,
  showWeight: false,
  carryLimitLb: null,
};

const inventorySchema = z
  .object({
    items: filterArr(inventoryItemSchema),
    currency: currencySchema,
    query: z.string().catch(""),
    kindFilter: z.enum(ITEM_KIND_VALUES).nullable().catch(null),
    showWeight: z.boolean().catch(false),
    carryLimitLb: z.number().nonnegative().finite().nullable().catch(null),
    pullVaultPath: z.string().optional().catch(undefined),
  })
  .catch(INVENTORY_DEFAULT);

export function parseInventoryState(raw: unknown): unknown {
  return inventorySchema.parse(raw);
}

// ---------------------------------------------------------------------------
// xp-tracker
// ---------------------------------------------------------------------------

const xpAwardSchema = z.object({
  id: z.string(),
  label: z.string().catch(""),
  at: z.number().optional().catch(undefined),
  prevPartyXp: z.number().catch(0),
  prevPerPc: z.record(z.string(), z.number().catch(0)).catch({}),
});

const xpTrackerSchema = z
  .object({
    mode: z.enum(["party", "perPc"]).catch("party"),
    partyXp: z.number().catch(0),
    // per-key .catch(0) so one corrupt entry doesn't wipe every other PC's XP
    perPc: z.record(z.string(), z.number().catch(0)).catch({}),
    thresholds: z.array(z.number()).optional().catch(undefined),
    history: filterArr(xpAwardSchema),
  })
  .catch({ mode: "party", partyXp: 0, perPc: {}, history: [] });

export function parseXpTrackerState(raw: unknown): unknown {
  return xpTrackerSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// roll-tables
// ---------------------------------------------------------------------------

const rollTableEntrySchema = z.object({
  id: z.string(),
  text: z.string().catch(""),
  weight: z.number().catch(1),
  note: z.string().optional().catch(undefined),
  subtableId: z.string().optional().catch(undefined),
});

const rollTableSchema = z.object({
  id: z.string(),
  name: z.string().catch("Untitled"),
  description: z.string().optional().catch(undefined),
  die: z.number().catch(20),
  count: z.string().optional().catch(undefined),
  entries: filterArr(rollTableEntrySchema),
});

const rollHistoryItemSchema = z.object({
  id: z.string(),
  tableId: z.string().catch(""),
  tableName: z.string().catch(""),
  roll: z.number().catch(0),
  text: z.string().catch(""),
  note: z.string().optional().catch(undefined),
  chain: z.string().optional().catch(undefined),
  at: z.number().catch(0),
});

const rollTablesSchema = z
  .object({
    tables: filterArr(rollTableSchema),
    selectedId: z.string().nullable().catch(null),
    mode: z.enum(["roll", "browse"]).catch("roll"),
    history: filterArr(rollHistoryItemSchema),
  })
  .catch({ tables: [], selectedId: null, mode: "roll", history: [] });

export function parseRollTablesState(raw: unknown): unknown {
  return rollTablesSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// encounter-builder
// ---------------------------------------------------------------------------

const encounterSourceSchema = z
  .object({
    kind: z.enum(["bestiary", "party", "npc"]).catch("bestiary"),
    id: z.string().catch(""),
  })
  // A row whose source is unreadable survives as a "missing source" row rather than vanishing,
  // exactly as `creatureId: z.string().catch("")` used to do.
  .catch({ kind: "bestiary", id: "" });

const encounterMemberFields = z.object({
  id: z.string(),
  source: encounterSourceSchema,
  name: z.string().catch(""),
  count: z.number().catch(1),
  groupInit: z.boolean().optional().catch(undefined),
  rollHp: z.boolean().optional().catch(undefined),
  sharedHp: z.boolean().optional().catch(undefined),
  included: z.boolean().optional().catch(undefined),
  kind: z.enum(["pc", "foe", "ally"]).optional().catch(undefined),
});

// `creatureId` (always a Bestiary entry id) became a tagged `source`, so party and NPC rows can
// share the same row shape. Old rows are lifted on read; the new shape reaches disk the first time
// the widget saves, and z.object's default strip drops the dead creatureId with it. Idempotent,
// which matters because WidgetSlot re-parses on every render.
const encounterMemberSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && !("source" in raw) && "creatureId" in raw) {
    const { creatureId, ...rest } = raw as Record<string, unknown>;
    return { ...rest, source: { kind: "bestiary", id: creatureId } };
  }
  return raw;
}, encounterMemberFields);

const encounterSchema = z.object({
  id: z.string(),
  name: z.string().catch("Untitled"),
  notes: z.string().optional().catch(undefined),
  rewardXp: z.number().optional().catch(undefined),
  members: filterArr(encounterMemberSchema),
});

const encounterBuilderSchema = z
  .object({
    encounters: filterArr(encounterSchema),
    selectedId: z.string().nullable().catch(null),
  })
  .catch({ encounters: [], selectedId: null });

export function parseEncounterBuilderState(raw: unknown): unknown {
  return encounterBuilderSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// card-decks
// ---------------------------------------------------------------------------

const deckCardSchema = z.object({
  id: z.string(),
  title: z.string().catch(""),
  count: z.number().catch(1),
  detail: z.string().optional().catch(undefined),
  imagePath: z.string().optional().catch(undefined),
});

const deckSchema = z.object({
  id: z.string(),
  name: z.string().catch("Untitled"),
  description: z.string().optional().catch(undefined),
  cards: filterArr(deckCardSchema),
});

const drawnCardSchema = z.object({
  key: z.string(),
  cardId: z.string().catch(""),
  at: z.number().catch(0),
});

const deckDrawStateSchema = z
  .object({
    drawPile: z.array(z.string()).catch([]),
    discard: filterArr(drawnCardSchema),
  })
  .catch({ drawPile: [], discard: [] });

const cardDecksSchema = z
  .object({
    decks: filterArr(deckSchema),
    selectedId: z.string().nullable().catch(null),
    mode: z.enum(["play", "edit"]).catch("play"),
    draw: z.record(z.string(), deckDrawStateSchema).catch({}),
  })
  .catch({ decks: [], selectedId: null, mode: "play", draw: {} });

export function parseCardDecksState(raw: unknown): unknown {
  return cardDecksSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// progress-clocks
// ---------------------------------------------------------------------------

const progressClockSchema = z.object({
  id: z.string(),
  name: z.string().catch("Untitled"),
  segments: z.number().int().positive().catch(6),
  filled: z.number().int().min(0).catch(0),
});

const progressClocksSchema = z
  .object({
    clocks: filterArr(progressClockSchema),
    shownClockId: z.string().nullable().optional().catch(null),
  })
  .catch({ clocks: [] });

export function parseProgressClocksState(raw: unknown): unknown {
  return progressClocksSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// campaign-timeline
// ---------------------------------------------------------------------------

const calDateSchema = z.object({
  year: z.number().catch(1),
  month: z.number().catch(0),
  day: z.number().catch(1),
  intercalaryIdx: z.number().optional().catch(undefined),
});

const timelineEntrySchema = z.object({
  id: z.string(),
  title: z.string().catch("Untitled"),
  body: z.string().optional().catch(undefined),
  category: z.string().catch("other"),
  date: calDateSchema,
});

const campaignTimelineSchema = z
  .object({ entries: filterArr(timelineEntrySchema), sortDirection: z.enum(["asc", "desc"]).catch("asc") })
  .catch({ entries: [], sortDirection: "asc" });

export function parseCampaignTimelineState(raw: unknown): unknown {
  return campaignTimelineSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// relationship-web
// ---------------------------------------------------------------------------

const relNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["npc", "pc", "faction", "custom"]).catch("custom"),
  label: z.string().catch(""),
  ref: z.string().nullable().catch(null),
  x: z.number().catch(0),
  y: z.number().catch(0),
  color: z.string().optional().catch(undefined),
});

const relEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum(["ally", "enemy", "family", "member", "debt", "custom"]).catch("custom"),
  label: z.string().optional().catch(undefined),
});

const relationshipWebSchema = z
  .object({
    nodes: filterArr(relNodeSchema),
    edges: filterArr(relEdgeSchema),
    selectedId: z.string().nullable().catch(null),
  })
  .catch({ nodes: [], edges: [], selectedId: null });

export function parseRelationshipWebState(raw: unknown): unknown {
  return relationshipWebSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// gazetteer
// ---------------------------------------------------------------------------

// Like npc-library, the real data lives in vault files; only the open place persists in state.
const gazetteerSchema = z
  .object({ selectedFile: z.string().nullable().catch(null) })
  .catch({ selectedFile: null });

export function parseGazetteerState(raw: unknown): unknown {
  return gazetteerSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// handout-gallery
// ---------------------------------------------------------------------------

const handoutGallerySchema = z
  .object({
    folder: z.string().nullable().catch(null),
  })
  .catch({ folder: null });

export function parseHandoutGalleryState(raw: unknown): unknown {
  return handoutGallerySchema.parse(raw);
}
