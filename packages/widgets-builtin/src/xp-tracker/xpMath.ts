// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { XpTrackerState, XpAward } from "./types";

// Standard cumulative XP-to-level table, index 0 = level 1 (always 0 XP).
export const DEFAULT_XP_THRESHOLDS: number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

/** How many undo snapshots the XP Tracker keeps. */
export const XP_HISTORY_CAP = 50;

/** Highest level whose threshold `xp` meets or exceeds. Null if the threshold table is empty (GM cleared it). */
export function levelForXp(xp: number, thresholds: number[]): number | null {
  if (thresholds.length === 0) return null;
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
  }
  return level;
}

/** Splits totalXp evenly across `count` recipients, rounding each share down. Any remainder is dropped. */
export function splitXp(totalXp: number, count: number): number {
  if (count <= 0) return 0;
  return Math.floor(totalXp / count);
}

export interface EncounterAwardInput {
  total: number;
  recipientIds: string[];
  label: string;
  /** Injected, not generated inside, so the function stays pure/testable (the rng idiom). */
  id: string;
  at: number;
}

/**
 * Applies an encounter-style award (split a total evenly across recipients) and returns the next XP
 * state with its undo snapshot pushed. In "perPc" mode each recipient gains the share; in "party"
 * mode the shared pool advances by the same per-head share, so the recipient list only sets the
 * divisor. No-op (returns the state unchanged) when there are no recipients or the share rounds to 0.
 *
 * The magnitude is split and the sign reapplied - `splitXp(|total|, n) * sign` - so a negative
 * correction rounds its magnitude down symmetrically with a positive award, rather than `floor`
 * skewing it more negative.
 */
export function applyEncounterAward(state: XpTrackerState, input: EncounterAwardInput): XpTrackerState {
  const { total, recipientIds, label, id, at } = input;
  if (recipientIds.length === 0) return state;
  const share = splitXp(Math.abs(total), recipientIds.length) * Math.sign(total);
  if (share === 0) return state;

  const history = state.history ?? [];
  const snapshot: XpAward = { id, label, at, prevPartyXp: state.partyXp, prevPerPc: state.perPc };
  const nextHistory = [snapshot, ...history].slice(0, XP_HISTORY_CAP);

  if (state.mode === "party") {
    return { ...state, partyXp: Math.max(0, state.partyXp + share), history: nextHistory };
  }
  const perPc = { ...state.perPc };
  for (const rid of recipientIds) perPc[rid] = Math.max(0, (perPc[rid] ?? 0) + share);
  return { ...state, perPc, history: nextHistory };
}

export interface LevelProgress {
  level: number | null;
  /** Cumulative XP needed for the next level; null at max level or when there is no table. */
  next: number | null;
  /** 0-1 progress through the current level band; 1 at max level. */
  fraction: number;
}

/** Where `xp` sits within its current level band - drives the progress bar. */
export function levelProgress(xp: number, thresholds: number[]): LevelProgress {
  const level = levelForXp(xp, thresholds);
  if (level === null) return { level: null, next: null, fraction: 0 };
  const floor = thresholds[level - 1] ?? 0;
  const next = level < thresholds.length ? thresholds[level] : null;
  if (next === null || next <= floor) return { level, next: null, fraction: 1 };
  return { level, next, fraction: Math.min(1, Math.max(0, (xp - floor) / (next - floor))) };
}
