// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useRef, useState } from "react";
import type { SessionTimerState } from "@ttcanvas/core";
import {
  elapsedMs,
  formatElapsed,
  formatElapsedPrecise,
  resetSessionTimer,
  sessionStatus,
  toggleSessionTimer,
} from "../sessionTimer";
import { useDismissOnOutsideClick } from "../hooks/useDismissOnOutsideClick";
import styles from "./SessionTime.module.css";

interface Props {
  state: SessionTimerState;
  onChange: (state: SessionTimerState) => void;
}

// Module-scoped because constructing a formatter is comparatively expensive and this one never
// varies. `timeStyle: "short"` follows the OS's own 12h/24h preference instead of hardcoding 24h.
const wallClock = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

const toggleLabel = {
  stopped: "Start session",
  running: "Pause session",
  paused: "Resume session",
} as const;

/**
 * The title bar's real-world time: wall clock always, session elapsed once started, and a menu
 * holding the actions plus the elapsed at full precision.
 *
 * Kept out of Titlebar because the wall clock ticks for the life of the app, and a tick in
 * Titlebar would re-render the brand, vault crumb and every tool button once a second.
 */
export function SessionTime({ state, onChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Re-render once a second so the clock and a running timer stay live. Nothing is persisted
  // per tick: both readouts are recomputed from stored timestamps, so this never calls onChange.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useDismissOnOutsideClick(wrapRef, menuOpen, () => setMenuOpen(false));

  const status = sessionStatus(state);
  const elapsed = elapsedMs(state, Date.now());

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.pill} ${styles[`pill_${status}`]}`}
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        title="Session timer"
      >
        <span className={styles.clock}>{wallClock.format(new Date())}</span>
        {status !== "stopped" && (
          <>
            <span className={styles.sep} aria-hidden="true">·</span>
            <span
              className={`${styles.dot} ${status === "running" ? styles.dotRunning : styles.dotPaused}`}
              aria-hidden="true"
            />
            <span className={styles.elapsed}>{formatElapsed(elapsed)}</span>
          </>
        )}
      </button>

      {menuOpen && (
        <div className={styles.menu}>
          <div className={styles.menuLabel}>Session · {formatElapsedPrecise(elapsed)}</div>
          <div className={styles.menuDivider} />
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              onChange(toggleSessionTimer(state, Date.now()));
              setMenuOpen(false);
            }}
          >
            {toggleLabel[status]}
          </button>
          <button
            type="button"
            className={styles.menuItem}
            disabled={status === "stopped"}
            onClick={() => {
              onChange(resetSessionTimer());
              setMenuOpen(false);
            }}
          >
            Reset session
          </button>
        </div>
      )}
    </div>
  );
}
