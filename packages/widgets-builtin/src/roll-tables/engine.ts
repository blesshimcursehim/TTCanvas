// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure weighted-table logic, unit-tested with an injectable rng (like xpMath.ts /
// npc-generator/tables.ts). An entry's `weight` is how many consecutive die values
// it covers, so a roll is 1..sum(weights) mapped onto cumulative ranges. M2 adds
// nested-table resolution (`resolveRoll`) and count expressions (`parseCount`).

import type { RollTable, RollTableEntry } from "./types";

/** Clamps a weight to a positive integer; a missing/garbage weight counts as 1. */
export function entryWeight(entry: RollTableEntry): number {
  const w = Math.floor(entry.weight);
  return Number.isFinite(w) && w >= 1 ? w : 1;
}

/** Sum of all entry weights - the effective die size the table actually rolls over. */
export function totalWeight(entries: RollTableEntry[]): number {
  return entries.reduce((sum, e) => sum + entryWeight(e), 0);
}

export interface EntryRange {
  from: number;
  to: number;
}

/**
 * Inclusive value range each entry occupies, in order. A weight-1 entry is `{from:n,to:n}`;
 * a weight-3 entry spans three consecutive values. Drives the Browse column and roll lookup.
 */
export function entryRanges(entries: RollTableEntry[]): EntryRange[] {
  const ranges: EntryRange[] = [];
  let cursor = 1;
  for (const e of entries) {
    const w = entryWeight(e);
    ranges.push({ from: cursor, to: cursor + w - 1 });
    cursor += w;
  }
  return ranges;
}

export interface RollResult {
  /** The value rolled, 1..totalWeight. */
  roll: number;
  entry: RollTableEntry;
}

/**
 * Rolls the table: picks 1..sum(weights) and returns the covering entry. Returns null for
 * an empty table (nothing to land on). `rng` returns a float in [0,1) - injectable for tests.
 */
export function rollTable(table: RollTable, rng: () => number = Math.random): RollResult | null {
  const total = totalWeight(table.entries);
  if (total <= 0) return null;
  const roll = Math.floor(rng() * total) + 1;
  const ranges = entryRanges(table.entries);
  for (let i = 0; i < ranges.length; i++) {
    if (roll >= ranges[i].from && roll <= ranges[i].to) {
      return { roll, entry: table.entries[i] };
    }
  }
  // Unreachable while ranges are contiguous, but stay safe rather than return undefined.
  return { roll, entry: table.entries[table.entries.length - 1] };
}

/**
 * Formats a value for display against a die. Percentile-scale dice (d100 and up) zero-pad to two
 * digits by convention, so a d100 reads `05` and a range reads `01-05` (its wraparound max `100`
 * stays as-is); smaller dice are left unpadded (`5`, `20`).
 */
export function padValue(n: number, die: number): string {
  const width = die >= 100 ? 2 : 1;
  return String(n).padStart(width, "0");
}

/** Formats an entry's range for the Browse column: a single value, or `from-to` when it spans several. */
export function formatRange(range: EntryRange, die: number): string {
  return range.from === range.to
    ? padValue(range.from, die)
    : `${padValue(range.from, die)}-${padValue(range.to, die)}`;
}

// ── M2: nested tables ─────────────────────────────────────────

/** Hard depth cap for subtable resolution - a cycle guard backstop, not a design target. */
const MAX_CHAIN_DEPTH = 25;

export interface RollStep {
  tableId: string;
  tableName: string;
  roll: number;
  entry: RollTableEntry;
}

export interface ResolvedRoll {
  /** Every table rolled on, in order, from the starting table to the final result. */
  steps: RollStep[];
  /** The final display text: the landed entry's text, or a placeholder if the chain broke. */
  text: string;
  note?: string;
}

/**
 * Rolls `startTable` and, whenever the landed entry points at another table via `subtableId`,
 * keeps rolling on that table instead - so an entry can say "roll on the Loot table" rather than
 * spelling out a result inline. Guards against cycles (A -> B -> A) with a visited-table set and a
 * depth cap; a `subtableId` that no longer resolves (deleted table) degrades to a "missing table"
 * result rather than throwing. Returns null only when the starting table itself has nothing to roll.
 */
export function resolveRoll(
  startTable: RollTable,
  tables: RollTable[],
  rng: () => number = Math.random,
): ResolvedRoll | null {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const steps: RollStep[] = [];
  let current: RollTable | undefined = startTable;

  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
    if (!current || visited.has(current.id)) {
      return steps.length === 0 ? null : { steps, text: "(table loop detected)" };
    }
    visited.add(current.id);
    const result = rollTable(current, rng);
    if (!result) {
      return steps.length === 0 ? null : { steps, text: "(missing table)" };
    }
    steps.push({ tableId: current.id, tableName: current.name, roll: result.roll, entry: result.entry });
    if (!result.entry.subtableId) {
      return { steps, text: result.entry.text, note: result.entry.note };
    }
    current = byId.get(result.entry.subtableId);
    if (!current) {
      return { steps, text: "(missing table)", note: result.entry.note };
    }
  }
  return { steps, text: "(table loop detected)" };
}

// ── M2: count expressions ────────────────────────────────────

/** Ceiling on a single roll's result count, so a reckless "100d20" can't flood the history. */
const MAX_ROLL_COUNT = 20;

/**
 * Parses and rolls a count expression: a plain integer (`"3"`) or dice notation
 * (`"2d6"`, `"d4"`, `"1d6+2"`). Returns the rolled count (>=1), or null if `expr` doesn't match
 * either form. `rng` is injectable for tests, matching the rest of the engine.
 */
export function parseCount(expr: string, rng: () => number = Math.random): number | null {
  const trimmed = expr.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return n >= 1 ? n : null;
  }
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(trimmed);
  if (!m) return null;
  const numDice = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  if (numDice < 1 || sides < 1) return null;
  let total = mod;
  for (let i = 0; i < numDice; i++) total += Math.floor(rng() * sides) + 1;
  return Math.max(1, total);
}

/**
 * Rolls `table.count` times (default 1 when unset/blank/invalid), resolving nested subtables on
 * each pull via `resolveRoll`. This is what the widget's Roll button calls: for a plain table it's
 * one result same as `resolveRoll`, for a table with `count: "2d6"` it's a collated batch.
 */
export function rollTableMultiple(
  table: RollTable,
  tables: RollTable[],
  rng: () => number = Math.random,
): ResolvedRoll[] {
  const requested = table.count?.trim() ? (parseCount(table.count, rng) ?? 1) : 1;
  const n = Math.min(MAX_ROLL_COUNT, requested);
  const results: ResolvedRoll[] = [];
  for (let i = 0; i < n; i++) {
    const r = resolveRoll(table, tables, rng);
    if (r) results.push(r);
  }
  return results;
}
