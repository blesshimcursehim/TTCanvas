// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useVault, useCalendar } from "@ttcanvas/core";
import { getAllWidgets } from "../registry";
import styles from "./CommandPalette.module.css";

function fileToLabel(path: string): string {
  const base = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  return base.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

interface ResultItem {
  id: string;
  group: string;
  label: string;
  sub?: string;
  action: () => void;
}

const MAX_PER_GROUP = 5;

interface Props {
  openTypes: Set<string>;
  onAdd: (type: string) => void;
  onFocus: (type: string) => void;
  onOpenNpc: (filename: string) => void;
  onOpenFile: (filename: string) => void;
  onClose: () => void;
}

export function CommandPalette({ openTypes, onAdd, onFocus, onOpenNpc, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [npcFiles, setNpcFiles] = useState<string[]>([]);
  const [vaultFiles, setVaultFiles] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const vault = useVault();
  const { events } = useCalendar();

  useEffect(() => {
    inputRef.current?.focus();
    if (!vault.vaultPath) return;
    vault.listFiles("md").then((files) => {
      setNpcFiles(files.filter((f) => f.startsWith("npcs/")));
      setVaultFiles(files.filter((f) => !f.startsWith("npcs/")));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally load once on open
  }, []);

  const q = query.trim().toLowerCase();
  const hit = (text: string) => !q || text.toLowerCase().includes(q);

  const results: ResultItem[] = [];

  getAllWidgets()
    .filter((w) => hit(w.title) || hit(w.category))
    .slice(0, MAX_PER_GROUP)
    .forEach((w) => {
      const isOpen = openTypes.has(w.type);
      results.push({
        id: `w:${w.type}`,
        group: "Widgets",
        label: isOpen ? `Focus ${w.title}` : `Add ${w.title}`,
        sub: w.category,
        action: () => { isOpen ? onFocus(w.type) : onAdd(w.type); onClose(); },
      });
    });

  npcFiles
    .filter((f) => hit(fileToLabel(f)))
    .slice(0, MAX_PER_GROUP)
    .forEach((f) => {
      results.push({
        id: `npc:${f}`,
        group: "NPCs",
        label: fileToLabel(f),
        sub: "NPC Library",
        action: () => { onOpenNpc(f); onClose(); },
      });
    });

  vaultFiles
    .filter((f) => hit(f.split("/").pop()?.replace(/\.md$/, "") ?? f))
    .slice(0, MAX_PER_GROUP)
    .forEach((f) => {
      results.push({
        id: `file:${f}`,
        group: "Notes",
        label: f.split("/").pop()?.replace(/\.md$/, "") ?? f,
        sub: f.includes("/") ? f.split("/").slice(0, -1).join("/") : undefined,
        action: () => { onOpenFile(f); onClose(); },
      });
    });

  events
    .filter((e) => hit(e.title) || (e.note ? hit(e.note) : false))
    .slice(0, MAX_PER_GROUP)
    .forEach((e) => {
      results.push({
        id: `evt:${e.id}`,
        group: "Calendar Events",
        label: e.title,
        sub: e.note,
        action: () => { onFocus("custom-calendar"); onClose(); },
      });
    });

  const hi = Math.min(highlighted, Math.max(0, results.length - 1));

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { results[hi]?.action(); }
    else if (e.key === "Escape") { onClose(); }
  }

  // Build grouped list preserving flat indices for highlight tracking
  const groups: Array<{ name: string; items: Array<{ item: ResultItem; idx: number }> }> = [];
  let flatIdx = 0;
  for (const item of results) {
    let g = groups.find((g) => g.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push({ item, idx: flatIdx++ });
  }

  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="6" cy="6" r="4.5" />
            <line x1="9.5" y1="9.5" x2="13" y2="13" />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search widgets, NPCs, notes, events…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlighted(0); }}
            onKeyDown={handleKey}
          />
          <kbd className={styles.escHint}>Esc</kbd>
        </div>

        <div className={styles.results}>
          {results.length === 0 && (
            <div className={styles.empty}>{q ? "No results" : "Start typing to search…"}</div>
          )}
          {groups.map((g) => (
            <div key={g.name} className={styles.group}>
              <div className={styles.groupLabel}>{g.name}</div>
              {g.items.map(({ item, idx }) => (
                <div
                  key={item.id}
                  className={`${styles.item} ${idx === hi ? styles.itemOn : ""}`}
                  onMouseEnter={() => setHighlighted(idx)}
                  onMouseDown={(e) => { e.preventDefault(); item.action(); }}
                >
                  <span className={styles.itemLabel}>{item.label}</span>
                  {item.sub && <span className={styles.itemSub}>{item.sub}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
