// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVault, pushHandoutScene, logWarn, logError } from "@ttcanvas/core";
import type { HandoutGalleryState } from "./types";
import { mimeForImageExt } from "../shared/mime";
import styles from "./HandoutGallery.module.css";

interface Props {
  state: HandoutGalleryState;
  onChange: (state: HandoutGalleryState) => void;
}

function displayName(path: string): string {
  return path.replace(/\\/g, "/").replace(/\.[^./]+$/, "").split("/").pop() ?? path;
}

export function HandoutGallery({ state, onChange }: Props) {
  const vault = useVault();
  const [files, setFiles] = useState<string[]>([]);
  const [art, setArt] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);

  const loadList = useCallback(async () => {
    if (!state.folder) { setFiles([]); return; }
    try {
      setFiles((await vault.listFolderImages(state.folder)).sort());
    } catch (err) {
      logError(`Handouts: could not list folder "${state.folder}"`, err);
      setFiles([]);
    }
  }, [state.folder, vault]);

  useEffect(() => { loadList(); }, [loadList, vault.vaultVersion]);

  // Eagerly load every image as a data URL, like Rules Reference eagerly loads file content for
  // its search index. readBinaryFile (not readFileBase64) because a nested path from a subfolder
  // (e.g. "npcs/goblin.png") contains "/" - readFileBase64's file_name arg rejects that outright.
  useEffect(() => {
    if (!state.folder || files.length === 0) { setArt({}); return; }
    setArt({});
    const folder = state.folder;
    let cancelled = false;
    files.forEach(async (f) => {
      try {
        const b64 = await vault.readBinaryFile(`${folder}/${f}`);
        if (!cancelled) setArt((prev) => ({ ...prev, [f]: `data:${mimeForImageExt(f)};base64,${b64}` }));
      } catch (err) {
        logWarn(`Handouts: could not read image "${f}"`, err);
        if (!cancelled) setArt((prev) => ({ ...prev, [f]: "" }));
      }
    });
    return () => { cancelled = true; };
  }, [files, state.folder, vault]);

  useEffect(() => { setQuery(""); setPreview(null); }, [state.folder]);

  // Keyboard parity with every other overlay in the app (picker/palette/help all close on Escape) -
  // moving focus onto the close button also gives keyboard users a starting point inside the dialog.
  useEffect(() => {
    if (!preview) return;
    lightboxCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? files.filter((f) => displayName(f).toLowerCase().includes(q)) : files;
  }, [files, query]);

  async function pickFolder() {
    const picked = await vault.pickFolder(state.folder);
    if (picked) onChange({ folder: picked });
  }

  function cast(f: string) {
    const src = art[f];
    if (src) void pushHandoutScene(src);
  }

  if (!state.folder) {
    return (
      <div className={styles.centered}>
        <p className={styles.hint}>No folder selected.</p>
        <button className={styles.actionBtn} onClick={pickFolder}>Choose Folder</button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Handouts</span>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search handouts"
        />
        <button className={styles.toolbarBtn} onClick={pickFolder} title="Change folder">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor" aria-hidden="true">
            <path d="M0 1.5C0 .67.67 0 1.5 0H4.9l1.5 1.5H11.5C12.33 1.5 13 2.17 13 3v6.5c0 .83-.67 1.5-1.5 1.5h-10C.67 11 0 10.33 0 9.5v-8z" />
          </svg>
        </button>
        <button className={styles.toolbarBtn} onClick={loadList} title="Refresh">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.hint}>{files.length === 0 ? "No images found in this folder." : "No results."}</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((f) => (
            <div key={f} className={styles.card}>
              <button className={styles.thumbBtn} onClick={() => setPreview(f)} title={displayName(f)}>
                {art[f] ? <img src={art[f]} className={styles.thumbImg} alt="" draggable={false} /> : <span className={styles.thumbPlaceholder} />}
              </button>
              <span className={styles.cardName}>{displayName(f)}</span>
              <button
                className={styles.castBtn}
                onClick={() => cast(f)}
                disabled={!art[f]}
                title="Cast to player window"
                aria-label="Cast to player window"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
                  <line x1="2" y1="20" x2="2.01" y2="20" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          className={styles.lightbox}
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label={displayName(preview)}
        >
          <div className={styles.lightboxInner} onClick={(e) => e.stopPropagation()}>
            {art[preview] && <img src={art[preview]} className={styles.lightboxImg} alt={displayName(preview)} />}
            <div className={styles.lightboxBar}>
              <span className={styles.lightboxName}>{displayName(preview)}</span>
              <button className={styles.lightboxCastBtn} onClick={() => cast(preview)} disabled={!art[preview]}>Cast to player</button>
              <button ref={lightboxCloseRef} className={styles.lightboxCloseBtn} onClick={() => setPreview(null)} aria-label="Close preview">×</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
