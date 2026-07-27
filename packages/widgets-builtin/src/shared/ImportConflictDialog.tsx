// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { ModalDialog } from "./ModalDialog";
import styles from "./ImportConflictDialog.module.css";

export interface ConflictItem {
  id: string;
  label: string;
}

interface Props {
  title: string;
  /** Singular noun for the item type, e.g. "NPC", "creature", "rule card". */
  noun: string;
  totalCount: number;
  idConflicts: ConflictItem[];
  contentDuplicates: ConflictItem[];
  onCancel: () => void;
  onSkip: () => void;
  onReplace: () => void;
}

export function ImportConflictDialog({
  title, noun, totalCount, idConflicts, contentDuplicates, onCancel, onSkip, onReplace,
}: Props) {
  const plural = totalCount !== 1 ? "s" : "";
  return (
    // Opens from inside another modal, and the top layer stacks it above its launcher without a
    // z-index. Escape cancels, but a stray click outside must not, since all three answers matter.
    <ModalDialog label={title} onClose={onCancel} backdropClose={false}>
      <div className={styles.dialog}>
        <div className={styles.title}>{title}</div>
        <p className={styles.body}>
          Importing {totalCount} {noun}
          {plural}.
          {idConflicts.length > 0 && ` ${idConflicts.length} already exist in this vault.`}
          {contentDuplicates.length > 0 && ` ${contentDuplicates.length} look identical to an existing entry under a different id - these are always skipped.`}
        </p>
        {idConflicts.length > 0 && (
          <>
            <div className={styles.listLabel}>Already in vault</div>
            <ul className={styles.list}>
              {idConflicts.map((c) => <li key={c.id}>{c.label}</li>)}
            </ul>
          </>
        )}
        {contentDuplicates.length > 0 && (
          <>
            <div className={styles.listLabel}>Content duplicates</div>
            <ul className={styles.list}>
              {contentDuplicates.map((c) => <li key={c.id}>{c.label}</li>)}
            </ul>
          </>
        )}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.skipBtn} onClick={onSkip}>Skip duplicates</button>
          <button className={styles.replaceBtn} onClick={onReplace}>Replace</button>
        </div>
      </div>
    </ModalDialog>
  );
}
