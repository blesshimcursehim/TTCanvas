// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { useCalendar, useToast, pushDateOverlay } from "@ttcanvas/core";
import type { TimeTrackerState, TimeAdvance } from "@ttcanvas/core";
import { formatCalDate, formatTime, timeOfDay, formatDateOverlay, advanceTime, eventsStartingBetween, describeCrossedEvents } from "../calendar/utils";
import styles from "./TimeTracker.module.css";

interface Props {
  state: TimeTrackerState;
  onChange: (s: TimeTrackerState) => void;
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function TimeTracker({ state, onChange }: Props) {
  const calCtx = useCalendar();
  const { showToast } = useToast();
  const { currentDate, currentHour, currentMinute, history, showOnPlayer } = state;
  const currentSecond = state.currentSecond ?? 0; // absent on pre-seconds saves
  const def = calCtx.def;

  const [customInput, setCustomInput] = useState("");
  const [customUnit, setCustomUnit] = useState<"m" | "h" | "d">("h");
  const [historyOpen, setHistoryOpen] = useState(false);

  function advance(deltaMinutes: number, label: string) {
    if (!def || !currentDate) return;
    const prev: TimeAdvance = {
      id: uid(),
      label,
      prevDate: currentDate,
      prevHour: currentHour,
      prevMinute: currentMinute,
      prevSecond: currentSecond,
    };
    const { date: newDate, hour: newHour, minute: newMinute } = advanceTime(
      currentDate, currentHour, currentMinute, deltaMinutes, def,
    );
    const newState: TimeTrackerState = {
      ...state,
      currentDate: newDate,
      currentHour: newHour,
      currentMinute: newMinute,
      history: [prev, ...history].slice(0, 100),
    };
    onChange(newState);
    if (showOnPlayer) pushDate(newState, def);
    // Remind (never trigger) when the advance crosses a calendar event's start day.
    const crossed = eventsStartingBetween(currentDate, newDate, calCtx.events, def);
    if (crossed.length) showToast(describeCrossedEvents(crossed, newDate, def), "info");
  }

  function handleCustom() {
    const raw = customInput.trim();
    if (!raw) return;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) return;
    const mins = customUnit === "h" ? n * 60 : customUnit === "d" ? n * 1440 : n;
    advance(mins, `+${n}${customUnit}`);
    setCustomInput("");
  }

  function undoTo(idx: number) {
    const entry = history[idx];
    if (!entry) return;
    const newState: TimeTrackerState = {
      ...state,
      currentDate: entry.prevDate,
      currentHour: entry.prevHour,
      currentMinute: entry.prevMinute,
      currentSecond: entry.prevSecond ?? 0,
      history: history.slice(idx + 1),
    };
    onChange(newState);
    if (showOnPlayer && def) pushDate(newState, def);
  }

  function togglePlayer() {
    const next = { ...state, showOnPlayer: !showOnPlayer };
    onChange(next);
    if (!showOnPlayer && def && currentDate) pushDate(next, def);
    else pushDateOverlay(null); // clear overlay when turning off
  }

  function pushDate(s: TimeTrackerState, d: typeof def) {
    if (!d || !s.currentDate) return;
    pushDateOverlay(formatDateOverlay(s.currentDate, s.currentHour, s.currentMinute, d));
  }

  const dateLabel = def && currentDate ? formatCalDate(currentDate, def) : "-";
  const timeLabel = formatTime(currentHour, currentMinute, currentSecond);
  const todLabel = def && currentDate ? timeOfDay(currentHour) : "";

  return (
    <div className={styles.wrap}>
      {/* Date + time display */}
      <div className={styles.display}>
        <div className={styles.dateRow}>
          <span className={styles.dateLabel}>{dateLabel}</span>
          <button
            className={`${styles.playerBtn} ${showOnPlayer ? styles.playerBtnOn : ""}`}
            onClick={togglePlayer}
            title={showOnPlayer ? "Hide from player window" : "Show on player window"}
          >
            <svg width="13" height="10" viewBox="0 0 13 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M1 5c0 0 2-3.5 5.5-3.5S12 5 12 5s-2 3.5-5.5 3.5S1 5 1 5z" />
              <circle cx="6.5" cy="5" r="1.5" />
            </svg>
          </button>
        </div>
        {def && currentDate && (
          <div className={styles.timeRow}>
            <span className={styles.timeLabel}>{timeLabel}</span>
            <span className={styles.todLabel}>{todLabel}</span>
          </div>
        )}
        {!def && (
          <div className={styles.noDef}>Open the Calendar widget to set up a calendar first.</div>
        )}
      </div>

      {/* Advance buttons */}
      <div className={styles.advanceRow}>
        <button className={styles.advBtn} onClick={() => advance(60,    "+1h")} disabled={!def || !currentDate}>+1h</button>
        <button className={styles.advBtn} onClick={() => advance(480,   "+8h")} disabled={!def || !currentDate}>+8h</button>
        <button className={styles.advBtn} onClick={() => advance(1440,  "+1d")} disabled={!def || !currentDate}>+1d</button>
        <button className={styles.advBtn} onClick={() => advance(10080, "+1w")} disabled={!def || !currentDate}>+1w</button>
      </div>

      {/* Custom input */}
      <div className={styles.customRow}>
        <input
          className={styles.customInput}
          type="number"
          min={1}
          placeholder="-"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCustom(); }}
          disabled={!def || !currentDate}
        />
        {(["h", "d", "m"] as const).map((u) => (
          <button
            key={u}
            className={`${styles.unitBtn} ${customUnit === u ? styles.unitActive : ""}`}
            onClick={() => setCustomUnit(u)}
          >
            {u}
          </button>
        ))}
        <button
          className={styles.goBtn}
          onClick={handleCustom}
          disabled={!customInput.trim() || !def || !currentDate}
        >
          Go
        </button>
      </div>

      {/* History */}
      <div className={styles.historyHeader} onClick={() => setHistoryOpen((o) => !o)}>
        <span className={styles.historyToggle}>{historyOpen ? "▾" : "▸"} History</span>
        {history.length > 0 && <span className={styles.historyCount}>{history.length}</span>}
      </div>

      {historyOpen && (
        <div className={styles.historyList}>
          {history.length === 0 && (
            <div className={styles.historyEmpty}>No advances yet</div>
          )}
          {history.map((entry, i) => (
            <div key={entry.id} className={styles.historyItem}>
              <span className={styles.historyLabel}>{entry.label}</span>
              <span className={styles.historyDate}>
                {def ? formatCalDate(entry.prevDate, def) : "-"} {formatTime(entry.prevHour, entry.prevMinute)}
              </span>
              <button
                className={styles.undoBtn}
                onClick={() => undoTo(i)}
                title="Undo to this point"
              >
                ↩
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
