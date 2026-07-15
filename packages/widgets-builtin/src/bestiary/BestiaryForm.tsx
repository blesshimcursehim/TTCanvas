// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { createPortal } from "react-dom";
import { useVault } from "@ttcanvas/core";
import { CropModal } from "../party-tracker/CropModal";
import type { BestiaryEntry, BestiaryFolder } from "./types";
import { mimeForImageExt } from "../shared/mime";
import styles from "./BestiaryForm.module.css";

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function flattenFolders(
  folders: BestiaryFolder[],
  parentId: string | null,
  depth: number,
): Array<{ folder: BestiaryFolder; depth: number }> {
  return folders
    .filter((f) => f.parentId === parentId)
    .flatMap((f) => [{ folder: f, depth }, ...flattenFolders(folders, f.id, depth + 1)]);
}

interface Props {
  initial?: BestiaryEntry;
  folders: BestiaryFolder[];
  onConfirm: (entry: BestiaryEntry) => void;
  onCancel: () => void;
}

export function BestiaryForm({ initial, folders, onConfirm, onCancel }: Props) {
  const vault = useVault();
  const [name, setName] = useState(initial?.name ?? "");
  const [creatureType, setCreatureType] = useState(initial?.creatureType ?? "");
  const [cr, setCr] = useState(initial?.cr ?? "");
  const [hp, setHp] = useState(String(initial?.hp ?? ""));
  const [ac, setAc] = useState(String(initial?.ac ?? ""));
  const [tagsRaw, setTagsRaw] = useState(initial?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [folderId, setFolderId] = useState<string | null>(initial?.folderId ?? null);
  const [portrait, setPortrait] = useState<string | undefined>(initial?.portrait);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);

  async function handlePickPortrait() {
    const src = await vault.pickImageFile();
    if (!src) return;
    const b64 = await vault.readBinaryFile(src);
    const mime = mimeForImageExt(src);
    setCropDataUrl(`data:${mime};base64,${b64}`);
  }

  function handleCropConfirm(cropped: string) {
    setPortrait(cropped);
    setCropDataUrl(null);
  }

  function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm({
      id: initial?.id ?? uid(),
      name: trimmed,
      creatureType: creatureType.trim(),
      cr: cr.trim(),
      hp: Math.max(0, parseInt(hp, 10) || 0),
      ac: Math.max(0, parseInt(ac, 10) || 0),
      tags: tagsRaw.split(",").map((t) => t.trim()).filter(Boolean),
      notes,
      folderId,
      portrait,
    });
  }

  const flat = flattenFolders(folders, null, 0);

  const modal = (
    <div className={styles.overlay} onMouseDown={onCancel}>
      <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{initial ? "Edit Creature" : "Add Creature"}</span>
          <button className={styles.closeBtn} onClick={onCancel}>×</button>
        </div>

        <div className={styles.body}>
          {/* Portrait */}
          <div className={styles.portraitRow}>
            <button className={styles.portraitBtn} onClick={handlePickPortrait} title="Upload portrait">
              {portrait
                ? <img src={portrait} className={styles.portraitImg} alt="Portrait" draggable={false} />
                : <span className={styles.portraitPlaceholder}>+</span>
              }
            </button>
            <div className={styles.mainFields}>
              <input className={styles.input} placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
              <input className={styles.input} placeholder="Type (e.g. Dragon, Undead)" value={creatureType} onChange={(e) => setCreatureType(e.target.value)} />
            </div>
          </div>

          {/* Stats row */}
          <div className={styles.statsRow}>
            <label className={styles.statField}>
              <span className={styles.statLabel}>CR</span>
              <input className={`${styles.input} ${styles.statInput}`} placeholder="-" value={cr} onChange={(e) => setCr(e.target.value)} />
            </label>
            <label className={styles.statField}>
              <span className={styles.statLabel}>HP</span>
              <input className={`${styles.input} ${styles.statInput}`} type="number" min={0} placeholder="0" value={hp} onChange={(e) => setHp(e.target.value)} />
            </label>
            <label className={styles.statField}>
              <span className={styles.statLabel}>AC</span>
              <input className={`${styles.input} ${styles.statInput}`} type="number" min={0} placeholder="0" value={ac} onChange={(e) => setAc(e.target.value)} />
            </label>
          </div>

          {/* Tags + folder */}
          <input className={styles.input} placeholder="Tags (comma separated)" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
          <select
            className={styles.input}
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value || null)}
          >
            <option value="">- No folder (root) -</option>
            {flat.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {"  ".repeat(depth)}{folder.name}
              </option>
            ))}
          </select>

          {/* Notes */}
          <textarea
            className={`${styles.input} ${styles.notes}`}
            placeholder="Notes (markdown supported)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!name.trim()}>
            {initial ? "Save" : "Add"}
          </button>
        </div>
      </div>

      {cropDataUrl && (
        <CropModal
          imgDataUrl={cropDataUrl}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropDataUrl(null)}
        />
      )}
    </div>
  );

  return createPortal(modal, document.body);
}
