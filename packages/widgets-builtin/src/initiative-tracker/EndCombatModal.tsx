// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Combatant, SharedPartyMember, PartyMemberPatch } from "@ttcanvas/core";
import { buildEndCombatReview, type UnlinkedCombatant } from "./endCombat";
import styles from "./EndCombatModal.module.css";

interface Props {
  combatants: Combatant[];
  party: SharedPartyMember[];
  round: number;
  /** Applies the ticked HP hand-backs, then ends combat. Called with the patches to write. */
  onEnd: (patches: PartyMemberPatch[]) => void;
  onCancel: () => void;
}

const REASON_LABEL: Record<UnlinkedCombatant["reason"], [one: string, many: string]> = {
  "foe": ["foe", "foes"],
  "npc-or-ally": ["ally or NPC", "allies or NPCs"],
  "unlinked-pc": ["hand-added PC", "hand-added PCs"],
  "member-gone": ["PC with no roster entry", "PCs with no roster entry"],
};

/** "3 foes, 1 ally or NPC" from the unlinked bucket, in a stable reason order. */
function summariseUnlinked(unlinked: UnlinkedCombatant[]): string {
  const order: UnlinkedCombatant["reason"][] = ["foe", "npc-or-ally", "unlinked-pc", "member-gone"];
  return order
    .map((reason) => ({ reason, n: unlinked.filter((u) => u.reason === reason).length }))
    .filter(({ n }) => n > 0)
    .map(({ reason, n }) => `${n} ${REASON_LABEL[reason][n === 1 ? 0 : 1]}`)
    .join(", ");
}

export function EndCombatModal({ combatants, party, round, onEnd, onCancel }: Props) {
  const review = buildEndCombatReview(combatants, party);
  // Default to applying every clear-cut change; leave unchanged and ambiguous rows for the GM to opt in.
  const [applyIds, setApplyIds] = useState<Set<string>>(
    () => new Set(review.party.filter((d) => d.changed && !d.ambiguous).map((d) => d.memberId)),
  );

  const toggle = (memberId: string) => {
    setApplyIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleEnd = () => {
    const patches: PartyMemberPatch[] = review.party
      .filter((d) => applyIds.has(d.memberId))
      .map((d) => ({ id: d.memberId, hp: d.after }));
    onEnd(patches);
  };

  const unlinkedSummary = summariseUnlinked(review.unlinked);

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => e.stopPropagation()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>End combat</span>
          <span className={styles.round}>Round {round}</span>
        </div>

        <div className={styles.body}>
          {review.party.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Party</div>
              {review.party.map((d) => (
                <label key={d.memberId} className={`${styles.row} ${d.ambiguous ? styles.rowWarn : ""}`}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    checked={applyIds.has(d.memberId)}
                    onChange={() => toggle(d.memberId)}
                  />
                  <span className={styles.name}>{d.name}</span>
                  <span className={styles.hp}>
                    {d.changed ? (
                      <>{d.before} <span className={styles.arrow}>-&gt;</span> {d.after}</>
                    ) : (
                      <span className={styles.unchanged}>{d.after} (unchanged)</span>
                    )}
                  </span>
                  {d.ambiguous ? (
                    <span className={styles.note} title="More than one combatant links to this character - showing the first">
                      ⚠ 2+ combatants share this PC
                    </span>
                  ) : d.conditions.length > 0 ? (
                    <span className={styles.note}>still {d.conditions.join(", ")}</span>
                  ) : null}
                </label>
              ))}
            </section>
          ) : (
            <div className={styles.empty}>No party members in this combat to hand back.</div>
          )}

          {unlinkedSummary && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Not carried back</div>
              <div className={styles.unlinked}>{unlinkedSummary} - HP and conditions are discarded.</div>
            </section>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.endBtn} onClick={handleEnd}>End combat</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
