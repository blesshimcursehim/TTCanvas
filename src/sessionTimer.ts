// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { SessionTimerState, WorkspaceState } from "@ttcanvas/core";

export const DEFAULT_SESSION_TIMER: SessionTimerState = { startedAt: null, accumulatedMs: 0 };

export type SessionStatus = "stopped" | "running" | "paused";

/**
 * Every function here takes `now` rather than reading the clock itself, so the timer's
 * arithmetic is a pure function of its inputs and testable without fake timers.
 */

export function sessionStatus(s: SessionTimerState): SessionStatus {
  if (s.startedAt !== null) return "running";
  return s.accumulatedMs > 0 ? "paused" : "stopped";
}

export function elapsedMs(s: SessionTimerState, now: number): number {
  const live = s.startedAt !== null ? now - s.startedAt : 0;
  // Clamped because a hand-edited file or a backwards system-clock jump can put `startedAt`
  // in the future, which would otherwise render a negative timer.
  return Math.max(0, s.accumulatedMs + live);
}

export function toggleSessionTimer(s: SessionTimerState, now: number): SessionTimerState {
  return s.startedAt !== null
    // Bank the live span at `now` rather than reusing a rendered value: the display only
    // refreshes once a second, so reusing it would drop up to ~1s on every pause.
    ? { startedAt: null, accumulatedMs: elapsedMs(s, now) }
    : { startedAt: now, accumulatedMs: s.accumulatedMs };
}

export function resetSessionTimer(): SessionTimerState {
  return { ...DEFAULT_SESSION_TIMER };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parts(ms: number): { h: number; m: number; s: number } {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** `H:MM` for the title bar, which deliberately never ticks seconds. */
export function formatElapsed(ms: number): string {
  const { h, m } = parts(ms);
  return `${h}:${pad2(m)}`;
}

/** `H:MM:SS` for the session menu, where full precision is worth a click. */
export function formatElapsedPrecise(ms: number): string {
  const { h, m, s } = parts(ms);
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

/**
 * Pause a timer that was still running when the workspace was last saved.
 *
 * Only the banked `accumulatedMs` survives a restart: the in-flight span is dropped, because
 * the app has no idea whether the gap was a quick reload or an overnight close, and counting
 * it would silently add hours. Pause before closing to keep a span. Called from
 * `migrateWorkspace`, i.e. once per vault open, which is exactly the right scope - doing it
 * on component mount instead would re-fire on every remount (peek toggles, hide/show).
 */
export function reconcileSessionTimer(ws: WorkspaceState): WorkspaceState {
  const timer = ws.sessionTimer;
  if (!timer || timer.startedAt === null) return ws;
  return { ...ws, sessionTimer: { startedAt: null, accumulatedMs: timer.accumulatedMs } };
}
