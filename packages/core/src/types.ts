// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface WidgetInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  state: unknown;
  hidden?: boolean;
}

export interface Layout {
  widgets: WidgetInstance[];
  /**
   * Full-screen GM-only backdrop behind the canvas, a filename in the vault's maps/ subfolder
   * (reuses the existing maps-folder copy machinery rather than a dedicated backgrounds/ folder).
   */
  backgroundImage?: string;
}

/** Absent = "reveal", for back-compat with fog data saved before hide mode existed. */
export type FogMode = "reveal" | "hide";

export type FogReveal =
  | { shape: "brush"; cx: number; cy: number; r: number; mode?: FogMode }
  | { shape: "rect"; x: number; y: number; w: number; h: number; mode?: FogMode };

export interface MapToken {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  size?: number;       // multiplier; 1 = default 26px; stored per-token
  sourceId?: string;   // links to party member / combatant id for duplicate detection
  portraitPath?: string; // vault-relative path (e.g. "portraits/uuid.jpg"), or an inline data URL for Bestiary portraits
  kind?: MapTokenKind;   // grouping for the visibility manager (M4); absent = "npc"
  onBoard?: boolean;     // visibility "All" toggle (M4); absent = true (on the board)
  showPlayers?: boolean; // visibility "Players" toggle (M4); absent = true (mirrored)
  locationRef?: string;  // Gazetteer location filename this pin is linked to, e.g. "locations/x.json"
}

/** Token grouping in the visibility manager (Player / NPC / Enemy / Location). */
export type MapTokenKind = "player" | "npc" | "enemy" | "location";

/** Player-safe markup drawn on a map. All geometry is normalised (0-1 of the image). */
export type AnnotationColor = "amber" | "rose" | "azure" | "sage";
export type AnnotationType = "ring" | "box" | "arrow" | "highlight";

interface AnnotationBase {
  id: string;
  color: AnnotationColor;
  stroke: 1 | 2 | 3;     // S / M / L
  label?: string;
  onBoard?: boolean;     // visibility "All" toggle (M4); absent = true
  showPlayers?: boolean; // visibility "Players" toggle (M4); absent = true
}

/** Visual style for a scene's markup - a manual per-scene toggle (no auto-swap). */
export type MarkupPreset = "ink" | "cartographer";

export type MapAnnotation =
  | (AnnotationBase & { type: "ring"; x: number; y: number; w: number; h: number })
  | (AnnotationBase & { type: "box"; x: number; y: number; w: number; h: number })
  | (AnnotationBase & { type: "arrow"; x1: number; y1: number; x2: number; y2: number })
  | (AnnotationBase & { type: "highlight"; points: { x: number; y: number }[] });

/** The rectangle-shaped annotation types (share x/y/w/h geometry). */
export type BoxLikeAnnotation = Extract<MapAnnotation, { type: "ring" | "box" }>;

export interface CharacterPayload {
  kind: "npc" | "creature" | "pc";
  name: string;
  subtitle?: string;
  portraitSrc?: string;     // data URL - 400×400 crop (fallback)
  portraitFullSrc?: string; // data URL - full image (≤1920px), preferred
  accentColor?: string;
  tags?: string[];
}

/** A cast location's establishing card - image (optional) over a name, a kind/parent locator, and a
 * player-safe blurb. The GM notes never travel here; only what players should see. */
export interface LocationPayload {
  name: string;
  subtitle?: string; // e.g. "Tavern - Citadel of Thorns"
  blurb?: string;    // player-safe line
  imgSrc?: string;   // data URL of the establishing image, or absent
}

/** One line of a cast price list. Prices arrive pre-formatted as a coin string, because the coin
 *  maths and the merchant's modifiers are the GM window's business - the player window only prints
 *  what it is handed. */
export interface ShopLine {
  name: string;
  price: string;
  /** null for unlimited stock; 0 renders as sold out. Absent is treated as unlimited. */
  qty?: number | null;
  rarity?: string;
}

/** A merchant's shelves, cast as a player-facing price list. Everything GM-only - buyback rates,
 *  the party purse, the merchant's notes - stays behind. */
export interface ShopPayload {
  name: string;
  subtitle?: string; // e.g. "Blacksmith - Citadel of Thorns"
  lines: ShopLine[];
}

export interface PlayerScene {
  type: "idle" | "map" | "handout" | "character" | "text" | "location" | "shop";
  inWorldDate?: string; // formatted string; present only when Time Tracker showOnPlayer is true
  map?: {
    mapFolder: string;
    mapFile: string;
    portraitsFolder?: string; // absolute path to vault/portraits; undefined on older pushes
    imgW: number;
    imgH: number;
    fogEnabled: boolean;
    fogReveals: FogReveal[];
    tokens: MapToken[];
    annotations?: MapAnnotation[]; // player-safe markup; absent on pushes from older builds
    markupPreset?: MarkupPreset;   // markup style; absent on older pushes -> "cartographer"
    panX: number;
    panY: number;
    scale: number;
    gmViewW: number;
    gmViewH: number;
  };
  handout?: {
    imgSrc: string;
  };
  text?: { title?: string; body: string }; // routed generator result cast to players
  character?: CharacterPayload;
  location?: LocationPayload; // Gazetteer establishing card
  shop?: ShopPayload;         // Merchants price list
}

export interface AbilityScores {
  str: number; dex: number; con: number;
  int: number; wis: number; cha: number;
}

/** Standard ability-score modifier (score 10-11 = +0). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * SRD 5.2.1 proficiency bonus for a character level: +2 at levels 1-4, then +1 every four levels up
 * to +6 at 17-20 (`2 + floor((level - 1) / 4)`), clamped to that range. Unlike the always-on ability
 * modifier, it is added only where a character is proficient - a trained saving throw, skill or
 * attack - which is the difference between the two.
 */
export function proficiencyBonus(level: number): number {
  const clamped = Math.min(20, Math.max(1, Math.floor(level)));
  return 2 + Math.floor((clamped - 1) / 4);
}

/**
 * SRD 5.2.1 proficiency bonus for a monster/NPC Challenge Rating: +2 up to CR 4, then +1 every four
 * CR (`2 + floor((CR - 1) / 4)` for CR >= 1), reaching +9 at CR 30. Fractional and CR 0 creatures all
 * sit at +2. Statblock NPCs are rated by CR rather than level, so their proficient saves derive from
 * this. `cr` is a string ("1/2", "5", ...); an unparseable value falls back to the +2 baseline every
 * creature has.
 */
export function proficiencyBonusForCr(cr: string): number {
  const t = cr.trim();
  const slash = t.indexOf("/");
  // A CR like "1/2" is a fraction; anything below 1 stays in the +2 tier, so exact value is moot.
  const value = slash === -1 ? Number(t) : Number(t.slice(0, slash)) / Number(t.slice(slash + 1));
  if (!Number.isFinite(value)) return 2;
  return 2 + Math.floor((Math.max(1, value) - 1) / 4);
}

export interface NamedEntry {
  name: string;
  description: string;
}

/** How an NPC stands towards the party. Lives here rather than in npc-library/types.ts because
 *  NpcContext exposes it to widgets, and core cannot import from widgets-builtin. */
export type NpcRelationship = "ally" | "neutral" | "wary" | "hostile";

/** The kind of place a Gazetteer location represents. Lives here rather than in gazetteer/types.ts
 *  for the same reason as NpcRelationship: GazetteerContext exposes it to widgets. */
export type LocationKind = "region" | "settlement" | "landmark" | "dungeon" | "wilderness" | "poi" | "custom";

/** A link from a Gazetteer place to an NPC or a faction. NPCs mirror an NPC Library file and cache
 *  the name so the chip still reads if the file is missing; factions are free-standing labels (ref
 *  null) as factions are not first-class entities in the vault. Lives here for the same reason as
 *  LocationKind. */
export interface LinkedEntity {
  kind: "npc" | "faction";
  /** NPC Library filename ("npcs/vex.json") for kind "npc"; null for a free-standing faction. */
  ref: string | null;
  /** Cached display name - kept fresh from the source for linked NPCs, owned outright for factions. */
  label: string;
}

export interface SpellSlots {
  [level: number]: { total: number; used: number };
}

export interface SpellcastingBlock {
  ability: "str" | "dex" | "con" | "int" | "wis" | "cha";
  saveDC?: number;
  attackBonus?: number;
  slots?: SpellSlots;
  spells?: { level: number; name: string; prepared?: boolean }[];
}

/** Coin purse. Lives here rather than in party-tracker/types.ts because both the PC sheet and the
 *  Inventory widget hold one, and PartyMemberPatch carries deltas of it. */
export interface PCCurrency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

/** Low denomination first, so display and rollup code iterate in a predictable order. `as const`
 *  keeps the tuple's literal element types, which is what makes `PCCurrency[k]` index cleanly. */
export const CURRENCY_KEYS = ["cp", "sp", "ep", "gp", "pp"] as const;

export const DEFAULT_CURRENCY: PCCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

/**
 * Add a signed delta onto a purse. Absent coins count as 0, results are floored at 0 and rounded, so
 * a fractional share from an even split can never persist "12.5 gp". Additive rather than absolute so
 * callers hand back "+3 gp" and the sum happens inside the state updater, where it cannot race a
 * concurrent edit of the same purse.
 */
export function applyCurrencyDelta(base: PCCurrency | undefined, delta: Partial<PCCurrency>): PCCurrency {
  const cur = base ?? DEFAULT_CURRENCY;
  const next = { ...DEFAULT_CURRENCY };
  for (const k of CURRENCY_KEYS) {
    next[k] = Math.max(0, Math.round((cur[k] ?? 0) + (delta[k] ?? 0)));
  }
  return next;
}

/** SRD 5.2.1 coin values in copper. Electrum sits at 50cp even though most tables ignore it. */
export const COIN_IN_CP: Record<keyof PCCurrency, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

/**
 * Render a copper amount as the largest single denomination that divides it cleanly, falling back to
 * gp with two decimals. Item prices are stored in copper so a 5sp torch never becomes 0.5gp and drifts
 * through float arithmetic; this is the display half of that.
 */
export function formatCoin(cp: number): string {
  if (!Number.isFinite(cp)) return "-";
  if (cp === 0) return "0 cp";
  for (const k of ["pp", "gp", "ep", "sp"] as const) {
    const unit = COIN_IN_CP[k];
    if (cp >= unit && cp % unit === 0) return `${cp / unit} ${k}`;
  }
  if (cp < COIN_IN_CP.gp) return `${cp} cp`;
  return `${(cp / COIN_IN_CP.gp).toFixed(2)} gp`;
}

/**
 * The title bar's real-world session timer. Distinct from the in-game calendar clock, which
 * lives in the Time Tracker widget and flows through CalendarContext.
 *
 * `running` is deliberately not a field: the timer runs exactly when `startedAt` is non-null,
 * so the illegal "running with no start time" state cannot be represented at all.
 */
export interface SessionTimerState {
  /** Epoch ms the current run started, or null when paused or stopped. */
  startedAt: number | null;
  /** Time banked from previous runs. The live span is added at display time, never persisted per tick. */
  accumulatedMs: number;
}

export interface WorkspaceState {
  version: 2;
  activeLayout: string;
  layouts: Record<string, Layout>;
  showGrid?: boolean;
  showVignette?: boolean;
  singletonStates?: Record<string, unknown>;
  disabledWidgetTypes?: string[];
  sessionTimer?: SessionTimerState;
}
