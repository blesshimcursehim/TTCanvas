// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import type { NamedEntry } from "@ttcanvas/core";
import styles from "./NamedEntryList.module.css";

interface Props {
  entries: NamedEntry[];
  editing?: boolean;
  onChange?: (entries: NamedEntry[]) => void;
}

export function NamedEntryList({ entries, editing, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function update(i: number, patch: Partial<NamedEntry>) {
    onChange?.(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  function remove(i: number) {
    onChange?.(entries.filter((_, j) => j !== i));
  }

  function add() {
    onChange?.([...entries, { name: "", description: "" }]);
    setExpanded((prev) => new Set([...prev, entries.length]));
  }

  return (
    <div className={styles.list}>
      {entries.map((entry, i) => (
        <div key={i} className={styles.entry}>
          <div className={styles.header} onClick={() => !editing && toggle(i)}>
            {editing ? (
              <input
                className={styles.nameInput}
                value={entry.name}
                placeholder="Name…"
                onChange={(e) => update(i, { name: e.target.value })}
              />
            ) : (
              <span className={styles.name}>{entry.name || "(unnamed)"}</span>
            )}
            {editing ? (
              <button className={styles.removeBtn} onClick={() => remove(i)}>×</button>
            ) : (
              <span className={styles.chevron}>{expanded.has(i) ? "▲" : "▼"}</span>
            )}
          </div>
          {(editing || expanded.has(i)) && (
            editing ? (
              <textarea
                className={styles.descInput}
                value={entry.description}
                placeholder="Description…"
                rows={3}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            ) : (
              <p className={styles.desc}>{entry.description}</p>
            )
          )}
        </div>
      ))}
      {editing && (
        <button className={styles.addBtn} onClick={add}>+ Add</button>
      )}
    </div>
  );
}
