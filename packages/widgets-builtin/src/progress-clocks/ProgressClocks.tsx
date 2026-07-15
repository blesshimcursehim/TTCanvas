// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useState } from "react";
import { pushClockOverlay } from "@ttcanvas/core";
import type { ProgressClock, ProgressClocksState } from "./types";
import { clockWedges } from "./wedges";
import styles from "./ProgressClocks.module.css";

interface Props {
  state: ProgressClocksState;
  onChange: (state: ProgressClocksState) => void;
}

const SEGMENT_PRESETS = [4, 6, 8, 10, 12];
const FACE_RADIUS = 26;

function newClock(name: string, segments: number): ProgressClock {
  return { id: crypto.randomUUID(), name, segments, filled: 0 };
}

export function ProgressClocks({ state, onChange }: Props) {
  const clocks = state.clocks;
  const shownClockId = state.shownClockId ?? null;

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addSegments, setAddSegments] = useState(6);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Push the shown clock's overlay whenever it (or the list it's found in) changes, so +/- and
  // renames update the player window live instead of needing the cast button pressed again.
  useEffect(() => {
    const shown = shownClockId ? clocks.find((c) => c.id === shownClockId) : null;
    pushClockOverlay(shown ? { name: shown.name, segments: shown.segments, filled: shown.filled } : null);
  }, [shownClockId, clocks]);

  // Clear the overlay when the widget unmounts (e.g. soft-closed) - mirrors Initiative Tracker.
  useEffect(() => () => { pushClockOverlay(null); }, []);

  function updateClock(id: string, patch: Partial<ProgressClock>) {
    onChange({ ...state, clocks: clocks.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }

  function adjust(clock: ProgressClock, delta: number) {
    updateClock(clock.id, { filled: Math.max(0, Math.min(clock.segments, clock.filled + delta)) });
  }

  function handleAdd() {
    const name = addName.trim();
    if (!name) return;
    onChange({ ...state, clocks: [...clocks, newClock(name, addSegments)] });
    setAdding(false);
    setAddName("");
    setAddSegments(6);
  }

  function deleteClock(id: string) {
    onChange({ ...state, clocks: clocks.filter((c) => c.id !== id) });
  }

  function commitRename(id: string) {
    const name = renameDraft.trim();
    if (name) updateClock(id, { name });
    setRenamingId(null);
  }

  function toggleCast(clock: ProgressClock) {
    onChange({ ...state, shownClockId: shownClockId === clock.id ? null : clock.id });
  }

  return (
    <div className={styles.root}>
      <div className={styles.list}>
        {clocks.length === 0 && !adding && (
          <div className={styles.emptyHint}>No clocks yet. Hit + to add one.</div>
        )}
        {clocks.map((clock) => (
          <div key={clock.id} className={styles.clockRow}>
            <svg className={styles.face} width={FACE_RADIUS * 2} height={FACE_RADIUS * 2} viewBox={`0 0 ${FACE_RADIUS * 2} ${FACE_RADIUS * 2}`}>
              {clockWedges(clock.segments, clock.filled, FACE_RADIUS).map((w, i) => (
                <path key={i} d={w.d} className={w.filled ? styles.wedgeFilled : styles.wedgeEmpty} />
              ))}
            </svg>
            <div className={styles.clockMain}>
              {renamingId === clock.id ? (
                <input
                  className={styles.nameInput}
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(clock.id); if (e.key === "Escape") setRenamingId(null); }}
                  onBlur={() => commitRename(clock.id)}
                />
              ) : (
                <span
                  className={styles.clockName}
                  onDoubleClick={() => { setRenamingId(clock.id); setRenameDraft(clock.name); }}
                  title="Double-click to rename"
                >
                  {clock.name}
                </span>
              )}
              <span className={styles.clockCount}>{clock.filled} / {clock.segments}</span>
            </div>
            <div className={styles.clockBtns}>
              <button
                className={`${styles.castBtn} ${shownClockId === clock.id ? styles.castBtnOn : ""}`}
                onClick={() => toggleCast(clock)}
                title={shownClockId === clock.id ? "Hide from player window" : "Show on player window (stays live as you fill it in)"}
                aria-label="Cast to player window"
                aria-pressed={shownClockId === clock.id}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
                  <line x1="2" y1="20" x2="2.01" y2="20" />
                </svg>
              </button>
              <button className={styles.stepBtn} onClick={() => adjust(clock, -1)} disabled={clock.filled === 0} title="Fill back one segment">–</button>
              <button className={styles.stepBtn} onClick={() => adjust(clock, 1)} disabled={clock.filled === clock.segments} title="Fill in one segment">+</button>
              <button className={styles.deleteBtn} onClick={() => deleteClock(clock.id)} title="Delete clock">×</button>
            </div>
          </div>
        ))}

        {adding && (
          <div className={styles.addForm}>
            <input
              className={styles.nameInput}
              value={addName}
              autoFocus
              placeholder="e.g. Alarm raised"
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
            />
            <div className={styles.segRow}>
              {SEGMENT_PRESETS.map((n) => (
                <button
                  key={n}
                  className={`${styles.segBtn} ${addSegments === n ? styles.segBtnActive : ""}`}
                  onClick={() => setAddSegments(n)}
                >{n}</button>
              ))}
              <input
                className={styles.segCustom}
                type="number"
                min={2}
                value={addSegments}
                title="Custom segment count"
                onChange={(e) => setAddSegments(Math.max(2, Math.floor(Number(e.target.value) || 2)))}
              />
            </div>
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAdd} disabled={!addName.trim()}>Add</button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <button className={styles.addRowBtn} onClick={() => { setAdding(true); setAddName(""); setAddSegments(6); }}>+ Add clock</button>
      )}
    </div>
  );
}
