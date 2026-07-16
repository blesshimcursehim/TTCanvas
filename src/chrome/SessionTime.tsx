// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionTimerState } from "@ttcanvas/core";
import type { AppClockFormat } from "../appConfig";
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
  clockFormat: AppClockFormat;
  onChange: (state: SessionTimerState) => void;
}

// `hourCycle: "h23"` rather than `hour12: false`, which renders midnight as 24:00 in some
// locales. "system" leaves the 12h/24h choice to the OS, which is what timeStyle short means.
const clockOptions: Record<AppClockFormat, Intl.DateTimeFormatOptions> = {
  system: { timeStyle: "short" },
  "24h": { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  "12h": { hour: "numeric", minute: "2-digit", hour12: true },
};

const toggleLabel = {
  stopped: "Start session",
  running: "Pause session",
  paused: "Resume session",
} as const;

const statusLabel = {
  stopped: "not started",
  running: "running",
  paused: "paused",
} as const;

/**
 * The title bar's real-world time: wall clock always, session elapsed once started, and a menu
 * holding the actions plus the elapsed at full precision.
 *
 * Kept out of Titlebar because the wall clock ticks for the life of the app, and a tick in
 * Titlebar would re-render the brand, vault crumb and every tool button once a second.
 */
export function SessionTime({ state, clockFormat, onChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const wallClock = useMemo(
    () => new Intl.DateTimeFormat(undefined, clockOptions[clockFormat]),
    [clockFormat],
  );

  // Re-render once a second so the clock and a running timer stay live. Nothing is persisted
  // per tick: both readouts are recomputed from stored timestamps, so this never calls onChange.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useDismissOnOutsideClick(wrapRef, menuOpen, () => setMenuOpen(false));

  // The shared dismiss hook only covers pointer dismissal. Escape is handled here rather than
  // folded into it because SettingsMenu, its other consumer, has its own inner Escape handlers
  // for inline rename that a document-level listener would fight. See bugs.md.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const status = sessionStatus(state);
  const elapsed = elapsedMs(state, Date.now());
  const clockText = wallClock.format(new Date());

  // The visible text is the times, which a screen reader should still read (WCAG 2.5.3), but on
  // its own it says neither what the control is nor whether the timer is running - the status
  // dot is decorative. So the name carries purpose, the visible clock, status and elapsed.
  const pillLabel =
    status === "stopped"
      ? `Session timer. Clock ${clockText}, not started`
      : `Session timer. Clock ${clockText}, ${statusLabel[status]}, ${formatElapsed(elapsed)} elapsed`;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.pill} ${styles[`pill_${status}`]}`}
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-label={pillLabel}
        title={pillLabel}
      >
        <span className={styles.clock}>{clockText}</span>
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
