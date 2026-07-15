// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import styles from "./ModeToggle.module.css";

interface ModeToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}

/** Shared segmented two-or-more-way mode toggle (e.g. roll/browse, play/edit, timeline/grouped). */
export function ModeToggle<T extends string>({ value, onChange, options, className }: ModeToggleProps<T>) {
  return (
    <div className={className ?? styles.toggle}>
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`${styles.btn} ${opt.value === value ? styles.btnActive : ""}`}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
