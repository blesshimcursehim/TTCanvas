// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { AbilityScores } from "@ttcanvas/core";
import styles from "./AbilityGrid.module.css";

const ABILITIES: { key: keyof AbilityScores; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

function modifier(score: number) {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

interface Props {
  scores: AbilityScores;
  editing?: boolean;
  onChange?: (scores: AbilityScores) => void;
}

export function AbilityGrid({ scores, editing, onChange }: Props) {
  return (
    <div className={styles.grid}>
      {ABILITIES.map(({ key, label }) => (
        <div key={key} className={styles.cell}>
          <span className={styles.label}>{label}</span>
          {editing ? (
            <input
              className={styles.input}
              type="number"
              min={1}
              max={30}
              value={scores[key]}
              onChange={(e) => onChange?.({ ...scores, [key]: Math.max(1, Math.min(30, Number(e.target.value) || 10)) })}
            />
          ) : (
            <span className={styles.score}>{scores[key]}</span>
          )}
          <span className={styles.mod}>{modifier(scores[key])}</span>
        </div>
      ))}
    </div>
  );
}
