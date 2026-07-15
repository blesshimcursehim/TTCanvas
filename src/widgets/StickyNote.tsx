// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import styles from "./StickyNote.module.css";

export type StickyNoteColor = "amber" | "slate" | "sage" | "rose" | "lilac";

export const STICKY_NOTE_COLORS: StickyNoteColor[] = ["amber", "slate", "sage", "rose", "lilac"];
export const DEFAULT_STICKY_NOTE_COLOR: StickyNoteColor = STICKY_NOTE_COLORS[0];

export interface StickyNoteState {
  content: string;
  color?: StickyNoteColor;
}

interface Props {
  state: StickyNoteState;
  onChange: (state: StickyNoteState) => void;
}

export function StickyNote({ state, onChange }: Props) {
  const color = state.color ?? DEFAULT_STICKY_NOTE_COLOR;

  return (
    <div className={styles.root} data-color={color}>
      <div className={styles.header}>
        {STICKY_NOTE_COLORS.map((c) => (
          <button
            key={c}
            className={`${styles.dot} ${c === color ? styles.dotActive : ""}`}
            data-color={c}
            onClick={() => onChange({ ...state, color: c })}
            title={c}
            aria-label={`${c} tint`}
          />
        ))}
      </div>
      <textarea
        className={styles.textarea}
        value={state.content}
        onChange={(e) => onChange({ ...state, content: e.target.value })}
        placeholder="Type a note…"
      />
    </div>
  );
}
