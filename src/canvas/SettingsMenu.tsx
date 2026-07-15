// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useRef, useEffect } from "react";
import type { Layout } from "@ttcanvas/core";
import { Icon } from "../icons/Icon";
import { useDismissOnOutsideClick } from "../hooks/useDismissOnOutsideClick";
import styles from "./SettingsMenu.module.css";

interface Props {
  open: boolean;
  onToggle: () => void;
  layouts: Record<string, Layout>;
  activeLayout: string;
  showGrid: boolean;
  showVignette: boolean;
  /** Active layout's background filename (in the vault's maps/ folder), if any is set. */
  backgroundImage?: string;
  onSwitch: (name: string) => void;
  onNew: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onToggleGrid: () => void;
  onToggleVignette: () => void;
  onChooseBackground: () => void;
  onClearBackground: () => void;
}

export function SettingsMenu({
  open, onToggle,
  layouts, activeLayout,
  showGrid, showVignette, backgroundImage,
  onSwitch, onNew, onRename, onDelete,
  onToggleGrid, onToggleVignette, onChooseBackground, onClearBackground,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const layoutNames = Object.keys(layouts);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (renamingName) renameInputRef.current?.focus();
  }, [renamingName]);

  function commitNew() {
    const name = newName.trim();
    if (!name || layouts[name]) return;
    onNew(name);
    setNewName("");
    setAdding(false);
  }

  function cancelNew() {
    setNewName("");
    setAdding(false);
  }

  function startRename(name: string) {
    setRenamingName(name);
    setRenameValue(name);
  }

  function commitRename() {
    const next = renameValue.trim();
    if (renamingName && next && next !== renamingName && !layouts[next]) {
      onRename(renamingName, next);
    }
    setRenamingName(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingName(null);
    setRenameValue("");
  }

  function handleToggle() {
    if (open) { cancelNew(); cancelRename(); }
    onToggle();
  }

  // Close on a left-click outside; open only, so handleToggle here always closes.
  useDismissOnOutsideClick(rootRef, open, handleToggle);

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <div className={styles.panel}>
          <div className={styles.sectionLabel}>Layouts</div>

          {layoutNames.map((name) => {
            const isActive = name === activeLayout;

            if (renamingName === name) {
              return (
                <div key={name} className={styles.newRow}>
                  <input
                    ref={renameInputRef}
                    className={styles.newInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    onBlur={commitRename}
                  />
                </div>
              );
            }

            return (
              <div
                key={name}
                className={`${styles.layoutRow} ${isActive ? styles.activeRow : ""}`}
                onClick={() => { if (!isActive) onSwitch(name); }}
              >
                <span className={styles.layoutName}>{name}</span>
                <button
                  className={styles.iconBtn}
                  title="Rename layout"
                  onClick={(e) => { e.stopPropagation(); startRename(name); }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
                    <path d="M7.5 1.5a1.5 1.5 0 0 1 2 2L3 10H1V8L7.5 1.5z"/>
                  </svg>
                </button>
                {layoutNames.length > 1 && (
                  <button
                    className={styles.iconBtn}
                    title="Delete layout"
                    onClick={(e) => { e.stopPropagation(); onDelete(name); }}
                  >
                    <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
                      <path d="M1 3h9M4 3V1.5h3V3M2 3l.5 7.5h6L9 3H2z"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {adding ? (
            <div className={styles.newRow}>
              <input
                ref={addInputRef}
                className={styles.newInput}
                value={newName}
                placeholder="Layout name…"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNew();
                  if (e.key === "Escape") cancelNew();
                }}
              />
              <button className={styles.confirmBtn} onClick={commitNew}>Add</button>
            </div>
          ) : (
            <button className={styles.newBtn} onClick={() => setAdding(true)}>
              + New layout
            </button>
          )}

          <div className={styles.divider} />
          <div className={styles.sectionLabel}>Display</div>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={showGrid}
              onChange={onToggleGrid}
            />
            <span className={styles.checkLabel}>Dot grid</span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={showVignette}
              onChange={onToggleVignette}
            />
            <span className={styles.checkLabel}>Vignette</span>
          </label>

          <div className={styles.divider} />
          <div className={styles.sectionLabel}>Background</div>
          <div className={styles.bgRow}>
            <span className={styles.bgName} title={backgroundImage}>
              {backgroundImage ? backgroundImage.split("/").pop() : "No background set"}
            </span>
            <button className={styles.bgBtn} onClick={onChooseBackground}>
              {backgroundImage ? "Change" : "Choose"}
            </button>
            {backgroundImage && (
              <button className={styles.bgBtn} onClick={onClearBackground}>Clear</button>
            )}
          </div>
          <div className={styles.bgHint}>Full-screen behind the canvas, GM-only. Hit Peek to hide widgets and show it alone.</div>
        </div>
      )}

      <button
        className={`${styles.toggleBtn} ${open ? styles.open : ""}`}
        onClick={handleToggle}
        title={open ? "Close tweaks" : "Canvas tweaks"}
        aria-label="Canvas tweaks"
      >
        <Icon name="sliders" size={18} stroke={1.5} />
      </button>
    </div>
  );
}
