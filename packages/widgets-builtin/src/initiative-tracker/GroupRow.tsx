// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { Combatant, InitiativeGroup } from "./types";
import { CombatantRow } from "./CombatantRow";
import styles from "./GroupRow.module.css";

interface Props {
  group: InitiativeGroup;
  members: Combatant[];
  isCurrent: boolean;
  onChangeGroup: (g: InitiativeGroup) => void;
  onUngroup: () => void;
  onChangeMember: (c: Combatant) => void;
  onRemoveMember: (id: string) => void;
  onPlaceMemberAtCenter: (c: Combatant) => void;
  /** Row-selection checkboxes for the "group these combatants" flow - lets a member of an already
   *  combined group be selected too, e.g. to fold a newcomer into it via createGroup's merge rule. */
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

/**
 * A combined group: one collapsed turn-order entry. Members nest underneath, sharing the header's
 * initiative (locked on each member row - edit it here instead) and turn highlight.
 */
export function GroupRow({
  group, members, isCurrent, onChangeGroup, onUngroup, onChangeMember, onRemoveMember, onPlaceMemberAtCenter,
  selectMode = false, selectedIds, onToggleSelect,
}: Props) {
  return (
    <div className={`${styles.root} ${isCurrent ? styles.current : ""}`}>
      <div className={styles.header}>
        <input
          type="number"
          className={styles.initInput}
          value={group.initiative}
          onChange={(e) => onChangeGroup({ ...group, initiative: Number(e.target.value) || 0 })}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          title="Shared initiative"
        />
        <input
          className={styles.labelInput}
          value={group.label}
          onChange={(e) => onChangeGroup({ ...group, label: e.target.value })}
          placeholder="Group label"
        />
        {isCurrent && <span className={styles.nowBadge}>NOW</span>}
        <button
          className={`${styles.turnToggle} ${group.combined ? styles.turnToggleOn : ""}`}
          onClick={() => onChangeGroup({ ...group, combined: !group.combined })}
          title={group.combined
            ? "Combined turn - the group acts as one entry. Click to split into separate turns."
            : "Separate turns - members act individually. Click to combine into one turn."}
        >
          {group.combined ? "Combined turn" : "Separate turns"}
        </button>
        <button className={styles.ungroupBtn} onClick={onUngroup} title="Ungroup">
          Ungroup
        </button>
      </div>
      <div className={styles.members}>
        {members.map((m) => (
          <CombatantRow
            key={m.id}
            combatant={m}
            isCurrent={isCurrent}
            onChange={onChangeMember}
            onRemove={() => onRemoveMember(m.id)}
            onPlaceAtCenter={() => onPlaceMemberAtCenter(m)}
            groupLabel={group.label}
            showGroupBadge={false}
            selectMode={selectMode}
            selected={selectedIds?.has(m.id) ?? false}
            onToggleSelect={() => onToggleSelect?.(m.id)}
          />
        ))}
      </div>
    </div>
  );
}
