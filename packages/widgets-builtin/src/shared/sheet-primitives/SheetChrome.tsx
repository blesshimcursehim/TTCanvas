// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { ModalDialog } from "../ModalDialog";
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
  return (
    <ModalDialog label={title} onClose={onClose}>
      <div className={styles.sheet}>
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
            <button className={styles.closeBtn} onClick={onClose} aria-label={`Close ${title}`}>×</button>
          </div>
        </div>

        {/* Tabs are a real tablist: arrow-key navigation and the "tab 2 of 4" announcement both
            come from the roles, and roving tabindex keeps Tab itself moving past the whole set. */}
        <div className={styles.tabBar} role="tablist" aria-label={`${title} sections`}>
          {tabs.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
              onClick={() => onTabChange(tab)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const at = (tabs.indexOf(activeTab) + step + tabs.length) % tabs.length;
                onTabChange(tabs[at]);
                // Focus has to follow the selection, or it would be left on a button that just
                // became tabIndex -1.
                (e.currentTarget.parentElement?.children[at] as HTMLElement | undefined)?.focus();
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={styles.body} role="tabpanel" aria-label={activeTab}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </ModalDialog>
  );
}
