// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useState } from "react";
import type { SessionClockState } from "./types";
import styles from "./SessionClock.module.css";

interface Props {
  state: SessionClockState;
  onChange: (state: SessionClockState) => void;
}

// True once this app session has reconciled a running timer on load. Module-level (not a
// component ref) so it survives the widget's hide/show remounts within one session, yet
// resets on a full app reload - exactly the scope of "reconcile once when the app starts".
let reconciledOnLoad = false;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatElapsed(totalMs: number, showSeconds: boolean): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return showSeconds ? `${h}:${pad2(m)}:${pad2(s)}` : `${h}:${pad2(m)}`;
}

function formatWallClock(date: Date, showSeconds: boolean): string {
  const h = date.getHours();
  const m = pad2(date.getMinutes());
  return showSeconds ? `${h}:${m}:${pad2(date.getSeconds())}` : `${h}:${m}`;
}

export function SessionClock({ state, onChange }: Props) {
  const { mode, running, startedAt, accumulatedMs, showSeconds } = state;

  // Forces a re-render every second so both the wall clock and the running timer stay live -
  // neither of those need to be persisted per-tick, only recomputed from real timestamps.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // A timer left running when the app closed would otherwise count the whole closed period on
  // reopen (close overnight -> reads ~8h, since the live span is only banked into accumulatedMs
  // on pause). On the first mount of an app session, pause it instead: the banked accumulatedMs
  // is kept and the untimed gap is dropped. Runs once (see reconciledOnLoad) so a hide/show
  // remount - which must keep counting - doesn't trip it. Pause before closing to keep an
  // in-flight span across a restart.
  useEffect(() => {
    if (reconciledOnLoad) return;
    reconciledOnLoad = true;
    if (state.running && state.startedAt != null) {
      onChange({ ...state, running: false, startedAt: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsedMs = accumulatedMs + (running && startedAt ? Date.now() - startedAt : 0);
  const digits = mode === "clock" ? formatWallClock(new Date(), showSeconds) : formatElapsed(elapsedMs, showSeconds);

  function setMode(next: SessionClockState["mode"]) {
    onChange({ ...state, mode: next });
  }

  function handleStartPause() {
    if (running) {
      // Recompute at click time rather than reusing the render-time `elapsedMs` - that value is
      // only refreshed once a second by the tick, so reusing it would lose up to ~1s per pause.
      const finalMs = accumulatedMs + (startedAt ? Date.now() - startedAt : 0);
      onChange({ ...state, running: false, startedAt: null, accumulatedMs: finalMs });
    } else {
      onChange({ ...state, running: true, startedAt: Date.now() });
    }
  }

  function handleReset() {
    onChange({ ...state, running: false, startedAt: null, accumulatedMs: 0 });
  }

  return (
    <div className={styles.root}>
      <div className={styles.modeTabs}>
        <button
          className={`${styles.modeTab} ${mode === "clock" ? styles.modeTabActive : ""}`}
          onClick={() => setMode("clock")}
        >
          Clock
        </button>
        <button
          className={`${styles.modeTab} ${mode === "timer" ? styles.modeTabActive : ""}`}
          onClick={() => setMode("timer")}
        >
          Timer
        </button>
      </div>

      <div className={styles.display}>
        <span className={styles.digits}>{digits}</span>
      </div>

      {mode === "timer" && (
        <div className={styles.controls}>
          <button
            className={`${styles.actionBtn} ${running ? styles.actionBtnActive : ""}`}
            onClick={handleStartPause}
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleReset}
            disabled={!running && accumulatedMs === 0}
          >
            Reset
          </button>
        </div>
      )}

      <label className={styles.secondsToggle}>
        <input
          type="checkbox"
          checked={showSeconds}
          onChange={() => onChange({ ...state, showSeconds: !showSeconds })}
        />
        Show seconds
      </label>
    </div>
  );
}
