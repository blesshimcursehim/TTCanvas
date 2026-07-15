// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useVault } from "@ttcanvas/core";
import type { RulesReferenceState } from "./types";
import { renderMarkdown } from "../shared/markdownRenderer";
import { FileTree, buildFileTree } from "../session-notes/FileTree";
import styles from "./RulesReference.module.css";

interface Props {
  state: RulesReferenceState;
  onChange: (state: RulesReferenceState) => void;
}

export function RulesReference({ state, onChange }: Props) {
  const vault = useVault();
  const [files, setFiles] = useState<string[]>([]);
  const [contentCache, setContentCache] = useState<Record<string, string | null>>({});
  const [query, setQuery] = useState("");
  const rightRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    if (!state.rulesFolder) return;
    try {
      const md = await vault.listFolderFiles(state.rulesFolder, "md");
      setFiles(md.sort());
    } catch {
      setFiles([]);
    }
  }, [state.rulesFolder, vault]);

  useEffect(() => { loadList(); }, [loadList, vault.vaultVersion]);

  // Load all file content for the search index
  useEffect(() => {
    if (!state.rulesFolder || files.length === 0) {
      setContentCache({});
      return;
    }
    setContentCache({});
    const folder = state.rulesFolder;
    files.forEach(async (f) => {
      try {
        const text = await vault.readFolderFile(folder, f);
        setContentCache((prev) => ({ ...prev, [f]: text }));
      } catch {
        setContentCache((prev) => ({ ...prev, [f]: null }));
      }
    });
    // Re-runs only when the file list changes, not on every folder-path read - and
    // vault's context value is a fresh object every render (tracked in
    // tracking/phase6-fixes.md), so including the whole object would defeat that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Reset query on folder change
  useEffect(() => { setQuery(""); }, [state.rulesFolder]);

  // Scroll to top whenever a different file is selected
  useEffect(() => {
    if (rightRef.current) rightRef.current.scrollTop = 0;
  }, [state.selectedFile]);

  function handleProseClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as Element).closest("a[data-wikilink]");
    if (!anchor) return;
    e.preventDefault();
    const target = anchor.getAttribute("data-wikilink");
    if (!target) return;
    const lower = target.toLowerCase();
    const match = files.find((f) => f.slice(0, f.lastIndexOf(".")).toLowerCase() === lower);
    if (match) onChange({ ...state, selectedFile: match });
  }

  const filteredFiles = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter((f) => {
      if (f.toLowerCase().includes(q)) return true;
      const content = contentCache[f];
      return typeof content === "string" && content.toLowerCase().includes(q);
    });
  }, [files, query, contentCache]);

  const tree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);

  async function pickFolder() {
    const picked = await vault.pickFolder(state.rulesFolder);
    if (picked) onChange({ rulesFolder: picked, selectedFile: null });
  }

  const content: string | null | undefined = state.selectedFile
    ? contentCache[state.selectedFile]
    : undefined;
  const contentLoading = !!(state.selectedFile && !(state.selectedFile in contentCache));

  if (!state.rulesFolder) {
    return (
      <div className={styles.centered}>
        <p className={styles.hint}>No rules folder selected.</p>
        <button className={styles.actionBtn} onClick={pickFolder}>
          Choose Rules Folder
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Rules Reference</span>

        <button className={styles.toolbarBtn} onClick={pickFolder} title="Change rules folder">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor" aria-hidden="true">
            <path d="M0 1.5C0 .67.67 0 1.5 0H4.9l1.5 1.5H11.5C12.33 1.5 13 2.17 13 3v6.5c0 .83-.67 1.5-1.5 1.5h-10C.67 11 0 10.33 0 9.5v-8z"/>
          </svg>
        </button>

        <button className={styles.toolbarBtn} onClick={loadList} title="Refresh file list">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <div className={styles.panels}>
        <div className={styles.left}>
          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search rules…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search rules"
            />
          </div>

          {filteredFiles.length === 0 ? (
            <p className={styles.hint}>
              {files.length === 0 ? "No .md files found." : "No results."}
            </p>
          ) : (
            <FileTree
              nodes={tree}
              selectedFile={state.selectedFile}
              onSelect={(path) => onChange({ ...state, selectedFile: path })}
            />
          )}
        </div>

        <div className={styles.right} ref={rightRef}>
          {!state.selectedFile && <p className={styles.hint}>Select a rule to read.</p>}
          {contentLoading && <p className={styles.hint}>Loading…</p>}

          {!contentLoading && content === null && state.selectedFile && (
            <p className={styles.hint}>Could not read file.</p>
          )}

          {!contentLoading && typeof content === "string" && (
            <div
              className={styles.prose}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              onClick={handleProseClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}
