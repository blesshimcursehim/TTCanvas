// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createPortal } from "react-dom";
import styles from "./SheetChrome.module.css";

interface Props {
  title: string;
  subtitle?: string;
  tabs: string[];
  activeTab: string;
  editing: boolean;
  onTabChange: (tab: string) => void;
  onEditToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SheetChrome({
  title, subtitle, tabs, activeTab, editing,
  onTabChange, onEditToggle, onClose, children, footer,
}: Props) {
  return createPortal(
    <div className={styles.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.sheet} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <span className={styles.title}>{title}</span>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          </div>
          <div className={styles.actions}>
            <button
              className={`${styles.editBtn} ${editing ? styles.editBtnActive : ""}`}
              onClick={onEditToggle}
              title={editing ? "Done editing" : "Edit"}
            >
              {editing ? "Done" : "Edit"}
            </button>
            <button className={styles.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        <div className={styles.tabBar}>
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
              onClick={() => onTabChange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
