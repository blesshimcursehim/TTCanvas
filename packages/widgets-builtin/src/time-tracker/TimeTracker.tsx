// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { useCalendar, useToast, pushDateOverlay, jumpMinutes, MAX_JUMP_AMOUNT } from "@ttcanvas/core";
import type { TimeTrackerState, TimeAdvance, NamedJump, JumpUnit } from "@ttcanvas/core";
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
  const { currentDate, currentHour, currentMinute, history, showOnPlayer, jumps } = state;
  const currentSecond = state.currentSecond ?? 0; // absent on pre-seconds saves
  const def = calCtx.def;

  const [customInput, setCustomInput] = useState("");
  const [customUnit, setCustomUnit] = useState<"m" | "h" | "d">("h");
  const [customDir, setCustomDir] = useState<1 | -1>(1);
  const [editingJumps, setEditingJumps] = useState(false);
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
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed <= 0) return;
    const n = Math.min(parsed, MAX_JUMP_AMOUNT);
    const mag = customUnit === "h" ? n * 60 : customUnit === "d" ? n * 1440 : n;
    advance(mag * customDir, `${customDir < 0 ? "−" : "+"}${n}${customUnit}`);
    setCustomInput("");
  }

  // A jump with a blank label still needs something to show on its button and record in history -
  // derive one from its signed amount, e.g. "+8h" or "−1d".
  function jumpLabel(j: NamedJump): string {
    const t = j.label.trim();
    if (t) return t;
    const abbr: Record<JumpUnit, string> = { min: "m", hour: "h", day: "d", week: "w" };
    return `${j.amount < 0 ? "−" : "+"}${Math.abs(j.amount)}${abbr[j.unit]}`;
  }

  const applyJump = (j: NamedJump) => advance(jumpMinutes(j), jumpLabel(j));

  const setJumps = (next: NamedJump[]) => onChange({ ...state, jumps: next });
  const updateJump = (id: string, patch: Partial<NamedJump>) =>
    setJumps(jumps.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const addJump = () => setJumps([...jumps, { id: uid(), label: "", amount: 1, unit: "hour" }]);
  const deleteJump = (id: string) => setJumps(jumps.filter((j) => j.id !== id));
  function moveJump(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= jumps.length) return;
    const next = [...jumps];
    [next[i], next[j]] = [next[j], next[i]];
    setJumps(next);
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
          <div className={styles.noDef}>Set up a calendar first, on the Calendar tab.</div>
        )}
      </div>

      {/* Jumps - GM-editable named, signed advance presets */}
      <div className={styles.jumpsHead}>
        <span className={styles.jumpsTitle}>Jumps</span>
        <button
          className={styles.editJumpsBtn}
          onClick={() => setEditingJumps((v) => !v)}
          title={editingJumps ? "Done editing jumps" : "Edit jumps"}
        >
          {editingJumps ? "Done" : "Edit"}
        </button>
      </div>

      {editingJumps ? (
        <div className={styles.jumpEditList}>
          {jumps.map((j, i) => (
            <div key={j.id} className={styles.jumpEditRow}>
              <input
                className={styles.jumpLabelInput}
                value={j.label}
                placeholder={jumpLabel(j)}
                onChange={(e) => updateJump(j.id, { label: e.target.value })}
                aria-label="Jump label"
              />
              <button
                className={styles.jumpDirBtn}
                onClick={() => updateJump(j.id, { amount: -j.amount })}
                title={j.amount < 0 ? "Rewinds time - click to advance instead" : "Advances time - click to rewind instead"}
                aria-label="Flip direction"
              >
                {j.amount < 0 ? "−" : "+"}
              </button>
              <input
                className={styles.jumpMagInput}
                type="number"
                min={1}
                max={MAX_JUMP_AMOUNT}
                value={Math.abs(j.amount)}
                onChange={(e) => {
                  const mag = Math.min(MAX_JUMP_AMOUNT, Math.max(1, Math.floor(Number(e.target.value) || 1)));
                  updateJump(j.id, { amount: (j.amount < 0 ? -1 : 1) * mag });
                }}
                aria-label="Jump amount"
              />
              <select
                className={styles.jumpUnitSel}
                value={j.unit}
                onChange={(e) => updateJump(j.id, { unit: e.target.value as JumpUnit })}
                aria-label="Jump unit"
              >
                <option value="min">min</option>
                <option value="hour">hr</option>
                <option value="day">day</option>
                <option value="week">wk</option>
              </select>
              <button className={styles.jumpMoveBtn} onClick={() => moveJump(i, -1)} disabled={i === 0} title="Move up" aria-label="Move up">↑</button>
              <button className={styles.jumpMoveBtn} onClick={() => moveJump(i, 1)} disabled={i === jumps.length - 1} title="Move down" aria-label="Move down">↓</button>
              <button className={styles.jumpDelBtn} onClick={() => deleteJump(j.id)} title="Delete jump" aria-label="Delete jump">×</button>
            </div>
          ))}
          <button className={styles.addJumpBtn} onClick={addJump}>+ Add jump</button>
        </div>
      ) : (
        <div className={styles.jumpsRow}>
          {jumps.length === 0
            ? <span className={styles.jumpsEmpty}>No jumps. Edit to add one.</span>
            : jumps.map((j) => (
                <button
                  key={j.id}
                  className={styles.advBtn}
                  onClick={() => applyJump(j)}
                  disabled={!def || !currentDate}
                  title={`${jumpLabel(j)} (${j.amount < 0 ? "rewind" : "advance"})`}
                >
                  {jumpLabel(j)}
                </button>
              ))}
        </div>
      )}

      {/* Custom one-off amount, with a direction toggle */}
      <div className={styles.customRow}>
        <button
          className={styles.dirBtn}
          onClick={() => setCustomDir((d) => (d === 1 ? -1 : 1))}
          title={customDir < 0 ? "Rewind - click to advance" : "Advance - click to rewind"}
          aria-label="Custom direction"
        >
          {customDir < 0 ? "−" : "+"}
        </button>
        <input
          className={styles.customInput}
          type="number"
          min={1}
          max={MAX_JUMP_AMOUNT}
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
