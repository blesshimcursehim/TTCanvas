// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ConditionPicker.module.css";

export const CONDITIONS: Array<{ id: string; short: string }> = [
  { id: "Blinded",        short: "Blind"  },
  { id: "Charmed",        short: "Charm"  },
  { id: "Concentrating",  short: "Conc"   },
  { id: "Deafened",       short: "Deaf"   },
  { id: "Frightened",     short: "Fright" },
  { id: "Grappled",       short: "Grap"   },
  { id: "Incapacitated",  short: "Incap"  },
  { id: "Invisible",      short: "Invis"  },
  { id: "Paralyzed",      short: "Para"   },
  { id: "Petrified",      short: "Petri"  },
  { id: "Poisoned",       short: "Psn"    },
  { id: "Prone",          short: "Prone"  },
  { id: "Restrained",     short: "Rest"   },
  { id: "Stunned",        short: "Stun"   },
  { id: "Unconscious",    short: "KO"     },
];

export function conditionShort(id: string): string {
  if (id.startsWith("Exhausted ")) return `Exh ${id.split(" ")[1]}`;
  return CONDITIONS.find((c) => c.id === id)?.short ?? id;
}

interface Props {
  active: string[];
  anchorRect: DOMRect;
  onChange: (conditions: string[]) => void;
  onClose: () => void;
  extraConditions?: Array<{ name: string; color?: string }>;
}

const PICKER_W = 228;

export function ConditionPicker({ active, anchorRect, onChange, onClose, extraConditions = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    // Escape is the keyboard equivalent of clicking away, and without it the only way out of the
    // picker is the mouse. stopPropagation keeps it from also reaching the canvas's clear-selection.
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Move focus into the picker on open, and hand it back to whatever opened it on close, so a
  // keyboard user can actually reach the chips rather than tabbing from the top of the document.
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);

  function toggle(id: string) {
    onChange(
      active.includes(id) ? active.filter((c) => c !== id) : [...active, id],
    );
  }

  function toggleExhausted(level: number) {
    const id = `Exhausted ${level}`;
    const withoutExh = active.filter((c) => !c.startsWith("Exhausted "));
    onChange(active.includes(id) ? withoutExh : [...withoutExh, id]);
  }

  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const top = spaceBelow > 180
    ? anchorRect.bottom + 6
    : anchorRect.top - 6; // will be offset via transform
  const flipUp = spaceBelow <= 180;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - PICKER_W - 8));

  return createPortal(
    <div
      ref={ref}
      className={styles.picker}
      style={{
        top,
        left,
        transform: flipUp ? "translateY(-100%)" : undefined,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      // Not a dialog: it is an anchored group of toggles, dismissed by clicking away or Escape.
      role="group"
      aria-label="Conditions"
    >
      <div className={styles.chips}>
        {CONDITIONS.map((c) => {
          const isActive = active.includes(c.id);
          const isConc = c.id === "Concentrating";
          return (
            <button
              key={c.id}
              className={`${styles.chip} ${isActive ? (isConc ? styles.chipConcActive : styles.chipActive) : ""}`}
              onClick={() => toggle(c.id)}
              // The chips are abbreviated to fit ("Fright", "KO"), so the full condition is the
              // accessible name and the tooltip. aria-pressed is what makes them read as toggles
              // rather than as buttons that do something new each press.
              aria-pressed={isActive}
              aria-label={c.id}
              title={c.id}
            >
              {c.short}
            </button>
          );
        })}
        {extraConditions.map((c) => (
          <button
            key={`extra-${c.name}`}
            className={`${styles.chip} ${styles.chipCustom} ${active.includes(c.name) ? styles.chipActive : ""}`}
            style={active.includes(c.name) && c.color ? { background: c.color, borderColor: c.color } : c.color ? { borderColor: c.color, color: c.color } : undefined}
            onClick={() => toggle(c.name)}
            aria-pressed={active.includes(c.name)}
            aria-label={c.name}
            title={c.name}
          >
            {c.name.slice(0, 6)}
          </button>
        ))}
      </div>
      <div className={styles.divider} />
      <div className={styles.exhRow}>
        <span className={styles.exhLabel}>Exhausted</span>
        {([1, 2, 3, 4, 5, 6] as const).map((n) => {
          const id = `Exhausted ${n}`;
          return (
            <button
              key={n}
              className={`${styles.exhBtn} ${active.includes(id) ? styles.exhActive : ""}`}
              onClick={() => toggleExhausted(n)}
              aria-pressed={active.includes(id)}
              aria-label={`Exhaustion level ${n}`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
