// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useRef, useState } from "react";
import { getAddableWidgets } from "../registry";
import { Icon } from "../icons/Icon";
import { useDismissOnOutsideClick } from "../hooks/useDismissOnOutsideClick";
import styles from "./WidgetPicker.module.css";

interface Props {
  openTypes: Set<string>;
  onAdd: (type: string) => void;
  onFocus: (type: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabledWidgetTypes: string[];
}

export function WidgetPicker({ openTypes, onAdd, onFocus, open, onOpenChange, disabledWidgetTypes }: Props) {
  const widgets = getAddableWidgets().filter((w) => !disabledWidgetTypes.includes(w.type));
  const categories = [...new Set(widgets.map((w) => w.category))];
  const onCanvasCount = openTypes.size;

  const rootRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(rootRef, open, () => onOpenChange(false));

  // Categories default to expanded; a category is collapsed only once the user hides it.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCategory = (category: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <div className={styles.panel}>
          {categories.map((category) => {
            const isCollapsed = collapsed.has(category);
            return (
            <div key={category} className={styles.group}>
              <button
                type="button"
                className={styles.groupLabel}
                onClick={() => toggleCategory(category)}
                aria-expanded={!isCollapsed}
              >
                <span>{category}</span>
                <Icon name={isCollapsed ? "chev-r" : "chev-d"} size={12} stroke={2} />
              </button>
              {!isCollapsed && widgets
                .filter((w) => w.category === category)
                .map((w) => {
                  const isOpen = openTypes.has(w.type);
                  const iconName = (w.icon ?? "canvas") as Parameters<typeof Icon>[0]["name"];
                  return (
                    <button
                      key={w.type}
                      className={`${styles.widgetBtn} ${isOpen ? styles.widgetBtnOpen : ""}`}
                      onClick={() => {
                        if (isOpen && w.singleton) {
                          onFocus(w.type);
                        } else {
                          onAdd(w.type);
                        }
                        if (!w.singleton) onOpenChange(false);
                      }}
                      title={isOpen && w.singleton ? `Focus ${w.title}` : `Add ${w.title}`}
                    >
                      <Icon name={iconName} size={15} stroke={1.5} />
                      <span className={styles.widgetName}>{w.title}</span>
                      {isOpen && w.singleton && (
                        <span className={styles.openPill}>open</span>
                      )}
                    </button>
                  );
                })}
            </div>
            );
          })}
          <div className={styles.footer}>
            <span className={styles.footerCount}>{onCanvasCount} on canvas</span>
          </div>
        </div>
      )}
      <button
        className={`${styles.toggleBtn} ${open ? styles.open : ""}`}
        onClick={() => onOpenChange(!open)}
        title={open ? "Close" : "Add widget"}
        aria-label={open ? "Close widget picker" : "Add widget"}
      >
        <Icon name={open ? "close" : "plus"} size={20} stroke={2} />
      </button>
    </div>
  );
}
