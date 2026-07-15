// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { renderMarkdown } from "../shared/markdownRenderer";
import type { BestiaryEntry } from "./types";
import styles from "./BestiaryDetail.module.css";

interface Props {
  entry: BestiaryEntry;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddToIT: () => void;
}

export function BestiaryDetail({ entry, onBack, onEdit, onDelete, onAddToIT }: Props) {
  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← Back</button>
        <div className={styles.topActions}>
          <button className={styles.iconBtn} title="Edit" onClick={onEdit}>✎</button>
          <button className={styles.iconBtn} title="Delete" onClick={onDelete}>×</button>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.hero}>
          <div className={styles.portrait}>
            {entry.portrait
              ? <img src={entry.portrait} className={styles.portraitImg} alt={entry.name} draggable={false} />
              : <span className={styles.portraitFallback}>{entry.name.charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className={styles.heroInfo}>
            <div className={styles.name}>{entry.name}</div>
            {entry.creatureType && (
              <div className={styles.type}>{entry.creatureType}</div>
            )}
            <div className={styles.statRow}>
              {entry.cr && <span className={styles.statPill}>CR {entry.cr}</span>}
              <span className={styles.statPill}>♥ {entry.hp} HP</span>
              <span className={styles.statPill}>🛡 {entry.ac} AC</span>
            </div>
            {entry.tags.length > 0 && (
              <div className={styles.tags}>
                {entry.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
              </div>
            )}
          </div>
        </div>

        {entry.notes && (
          <div
            className={styles.notes}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.notes) }}
          />
        )}

        {!entry.notes && (
          <div className={styles.noNotes}>No notes.</div>
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.itBtn} onClick={onAddToIT}>
          + Add to Initiative Tracker
        </button>
      </div>
    </div>
  );
}
