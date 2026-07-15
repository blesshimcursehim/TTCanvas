// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createPortal } from "react-dom";
import styles from "./KeyboardHelp.module.css";

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

const SHORTCUTS = [
  { key: `${mod}+K`,    action: "Command palette" },
  { key: `${mod}+\\`,   action: "Toggle widget picker" },
  { key: "Escape",      action: "Clear selection / close panels" },
  { key: "Del / ⌫",    action: "Remove focused widget" },
  { key: `${mod}+Z`,    action: "Undo last move or resize" },
  { key: `${mod}+⇧+F`, action: "Toggle fullscreen" },
  { key: `${mod}+G`,    action: "Toggle dot grid" },
  { key: "?",           action: "Show this overlay" },
];

interface Props {
  onClose: () => void;
}

export function KeyboardHelp({ onClose }: Props) {
  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <table className={styles.table}>
          <tbody>
            {SHORTCUTS.map(({ key, action }) => (
              <tr key={key} className={styles.row}>
                <td className={styles.keyCell}><kbd className={styles.kbd}>{key}</kbd></td>
                <td className={styles.actionCell}>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
}
