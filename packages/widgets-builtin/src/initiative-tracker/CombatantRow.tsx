// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useRef } from "react";
import type { Combatant } from "./types";
import { KIND_COLORS } from "./InitiativeTracker";
import { portraitColor } from "../party-tracker/CharacterCard";
import { setActiveTokenDrag, clearActiveTokenDrag } from "../shared/tokenDrag";
import { ConditionPicker, conditionShort } from "./ConditionPicker";
import { useConditions } from "@ttcanvas/core";
import styles from "./CombatantRow.module.css";

const KIND_TOKEN_COLORS: Record<string, string> = {
  pc:   "",
  foe:  "oklch(0.55 0.20 25)",
  ally: "oklch(0.50 0.16 145)",
};

interface Props {
  combatant: Combatant;
  isCurrent: boolean;
  onChange: (c: Combatant) => void;
  onRemove: () => void;
  onPlaceAtCenter: () => void;
  /** Group-initiative label, if this combatant belongs to a group. Locks the initiative input -
   *  it's edited via the group instead, to avoid desyncing the shared roll. */
  groupLabel?: string;
  /** Show a small badge with groupLabel next to the name. Off when already nested under a
   *  GroupRow header, which conveys the label itself. */
  showGroupBadge?: boolean;
  /** Re-combines a "separate" group back into one turn entry - the only way back after flipping
   *  a GroupRow to separate, since that flip removes the GroupRow (and its own toggle) from view. */
  onRecombineGroup?: () => void;
  /** Fully dissolves the group this combatant belongs to. */
  onUngroupFromBadge?: () => void;
  /** Row-selection checkbox for the "group these combatants" flow, replacing the drag handle. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

function resolveKind(c: Combatant): "pc" | "foe" | "ally" {
  if (c.kind) return c.kind;
  return (c as unknown as { isPlayer?: boolean }).isPlayer ? "pc" : "foe";
}

export function CombatantRow({
  combatant, isCurrent, onChange, onRemove, onPlaceAtCenter,
  groupLabel, showGroupBadge = true, onRecombineGroup, onUngroupFromBadge,
  selectMode = false, selected = false, onToggleSelect,
}: Props) {
  const patch = (fields: Partial<Combatant>) => onChange({ ...combatant, ...fields });
  const { customConditions } = useConditions();
  const kind = resolveKind(combatant);
  const pipColor = KIND_COLORS[kind];
  const tokenColor = kind === "pc" ? portraitColor(combatant.id) : KIND_TOKEN_COLORS[kind];
  const isDead = combatant.hp <= 0;
  const hpPct = combatant.maxHp > 0
    ? Math.max(0, Math.min(1, combatant.hp / combatant.maxHp)) * 100
    : 0;
  const conditions = combatant.conditions ?? [];

  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  function handleDragStart(e: React.DragEvent) {
    const kind = combatant.kind === "pc" ? "player" : combatant.kind === "ally" ? "npc" : "enemy";
    // Prefer the origin entity's id (party member / bestiary creature) so the map dedupes against
    // the same character dragged in directly, and carry the portrait so the token isn't blank.
    setActiveTokenDrag({
      sourceId: combatant.sourceId ?? combatant.id,
      label: combatant.name,
      color: tokenColor,
      portraitPath: combatant.portraitPath,
      kind,
    });
    e.dataTransfer.setData("text/plain", "ttcanvas-token");
    e.dataTransfer.effectAllowed = "copy";
    e.stopPropagation();
  }

  function openPicker(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = addBtnRef.current?.getBoundingClientRect();
    if (rect) setPickerAnchor(rect);
  }

  function removeCondition(id: string) {
    patch({ conditions: conditions.filter((c) => c !== id) });
  }

  return (
    <div
      className={[
        styles.row,
        isCurrent ? styles.current : "",
        isDead ? styles.dead : "",
      ].join(" ")}
    >
      {/* Drag handle + kind pip, or a selection checkbox while grouping */}
      {selectMode ? (
        <label className={styles.selectHandle} title="Select for grouping">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        </label>
      ) : (
        <div
          className={styles.dragHandle}
          draggable
          title={`Drag ${combatant.name} onto map`}
          onDragStart={handleDragStart}
          onDragEnd={clearActiveTokenDrag}
          style={{ "--pip-color": pipColor } as React.CSSProperties}
        >
          <div className={styles.pip} style={{ background: pipColor, boxShadow: `0 0 5px ${pipColor}` }} />
          <div className={styles.dragGrip} aria-hidden="true">
            <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
              <circle cx="2" cy="2" r="1.1" /><circle cx="6" cy="2" r="1.1" />
              <circle cx="2" cy="5" r="1.1" /><circle cx="6" cy="5" r="1.1" />
              <circle cx="2" cy="8" r="1.1" /><circle cx="6" cy="8" r="1.1" />
            </svg>
          </div>
        </div>
      )}

      {/* Initiative - locked when grouped, edited via the group instead */}
      <input
        type="number"
        className={styles.initInput}
        value={combatant.initiative}
        onChange={(e) => patch({ initiative: Number(e.target.value) || 0 })}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        title={groupLabel ? `Shared with ${groupLabel} - edit via the group` : "Initiative"}
        disabled={!!groupLabel}
      />

      {/* Name + conditions */}
      <div className={styles.nameCell}>
        <div className={styles.nameTop}>
          <input
            className={`${styles.nameInput} ${kind === "pc" ? styles.playerName : ""}`}
            value={combatant.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Name"
          />
          {isCurrent && <span className={styles.nowBadge}>NOW</span>}
          {groupLabel && showGroupBadge && (
            <span className={styles.groupBadge}>
              <button
                className={styles.groupBadgeLabel}
                onClick={onRecombineGroup}
                title={`Shared with ${groupLabel} - click to combine into one turn`}
              >
                {groupLabel}
              </button>
              <button className={styles.groupBadgeUngroup} onClick={onUngroupFromBadge} title="Ungroup">×</button>
            </span>
          )}
          <button
            ref={addBtnRef}
            className={styles.addCondBtn}
            onClick={openPicker}
            title="Add condition"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="4.5" y1="1" x2="4.5" y2="8" />
              <line x1="1" y1="4.5" x2="8" y2="4.5" />
            </svg>
          </button>
        </div>

        {conditions.length > 0 && (
          <div className={styles.conditionsRow}>
            {conditions.map((c) => (
              <button
                key={c}
                className={`${styles.condPill} ${c === "Concentrating" ? styles.condPillConc : ""}`}
                onClick={() => removeCondition(c)}
                title={`${c} - click to remove`}
              >
                {conditionShort(c)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* HP */}
      <div className={styles.hpCell}>
        <div className={styles.hpText}>
          <input
            type="number"
            className={styles.hpInput}
            value={combatant.hp}
            onChange={(e) => patch({ hp: Number(e.target.value) || 0 })}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            title="Current HP"
          />
          <span className={styles.hpSep}>/</span>
          <span className={styles.hpMax}>{combatant.maxHp}</span>
        </div>
        <div className={styles.hpBarTrack}>
          <div className={styles.hpBarFill} style={{ width: `${hpPct}%` }} />
        </div>
      </div>

      {/* AC */}
      <div className={styles.acCell}>
        <svg width="10" height="12" viewBox="0 0 13 15" fill="none" className={styles.shieldIcon}>
          <path
            d="M6.5 0.75L1 3.25v4.5C1 10.75 3.5 13.25 6.5 14.25c3-1 5.5-3.5 5.5-6.5V3.25L6.5 0.75z"
            fill="currentColor" opacity="0.18"
            stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"
          />
        </svg>
        <input
          type="number"
          className={styles.acInput}
          value={combatant.ac}
          onChange={(e) => patch({ ac: Number(e.target.value) || 0 })}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          title="AC"
        />
      </div>

      {/* Place on map */}
      <button
        className={styles.mapBtn}
        onClick={onPlaceAtCenter}
        title={`Place ${combatant.name} at map center`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="4" />
          <path d="M12 14v6M9 20h6" />
        </svg>
      </button>

      {/* Remove */}
      <button className={styles.removeBtn} onClick={onRemove} title="Remove">×</button>

      {/* Condition picker portal */}
      {pickerAnchor && (
        <ConditionPicker
          active={conditions}
          anchorRect={pickerAnchor}
          onChange={(conds) => patch({ conditions: conds })}
          onClose={() => setPickerAnchor(null)}
          extraConditions={customConditions}
        />
      )}
    </div>
  );
}
