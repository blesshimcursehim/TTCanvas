// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure bookkeeping for InitiativeTrackerState.roundAdvances: the stack of seconds-deltas each
// forward round-wrap applied to the game clock, so a later Prev can undo exactly what the
// matching Next added - not whatever auto-advance / roundSeconds happen to be set to by then.
//
// wrapForward always pushes (0 when auto-advance was off), so the stack has exactly one entry
// per round-wrap regardless of toggling in between; wrapBack's LIFO pop then always lines up
// with the boundary actually being reversed.

/** Push the delta this forward wrap applied (0 if auto-advance was off). */
export function wrapForward(roundAdvances: number[], delta: number): number[] {
  return [...roundAdvances, delta];
}

export interface WrapBackResult {
  /** The delta to undo, or undefined when the stack is empty (nothing left to rewind). */
  delta: number | undefined;
  roundAdvances: number[];
}

/** Pop the delta the matching forward wrap pushed. */
export function wrapBack(roundAdvances: number[]): WrapBackResult {
  const delta = roundAdvances[roundAdvances.length - 1];
  return { delta, roundAdvances: delta !== undefined ? roundAdvances.slice(0, -1) : roundAdvances };
}
