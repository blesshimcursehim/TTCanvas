// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Combatant, SharedPartyMember, PartyMemberPatch, CombatEncounterRef } from "@ttcanvas/core";
import { buildEndCombatReview, type UnlinkedCombatant } from "./endCombat";
import { splitXp } from "../xp-tracker/xpMath";
import styles from "./EndCombatModal.module.css";

/** An XP award to route after combat, alongside the HP hand-back. */
export interface EndCombatXpAward {
  total: number;
  recipientIds: string[];
  label: string;
}

export interface EndCombatResult {
  hpPatches: PartyMemberPatch[];
  xpAward?: EndCombatXpAward;
}

interface Props {
  combatants: Combatant[];
  party: SharedPartyMember[];
  round: number;
  /** The encounter this combat came from, if any - its rewardXp drives the XP section. */
  encounter?: CombatEncounterRef;
  /** How the XP Tracker splits awards, for an honest preview ("each" vs "to the pool"). */
  xpMode: "party" | "perPc";
  /** Applies the ticked HP hand-backs and the XP award, then ends combat. */
  onEnd: (result: EndCombatResult) => void;
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

export function EndCombatModal({ combatants, party, round, encounter, xpMode, onEnd, onCancel }: Props) {
  const review = buildEndCombatReview(combatants, party);
  // Default to applying every clear-cut change; leave unchanged and ambiguous rows for the GM to opt in.
  const [applyIds, setApplyIds] = useState<Set<string>>(
    () => new Set(review.party.filter((d) => d.changed && !d.ambiguous).map((d) => d.memberId)),
  );

  const hasReward = encounter?.rewardXp !== undefined && encounter.rewardXp > 0;
  const [xpAmount, setXpAmount] = useState(() => (hasReward ? String(encounter?.rewardXp) : ""));
  // Default XP recipients to the party members who were actually in the fight; a sitting-out PC can
  // still be ticked (party is the full roster), or a participant unticked.
  const [xpRecipients, setXpRecipients] = useState<Set<string>>(
    () => new Set(review.party.map((d) => d.memberId)),
  );

  const toggle = (memberId: string) => {
    setApplyIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleXp = (memberId: string) => {
    setXpRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const xpTotal = parseInt(xpAmount, 10);
  const xpValid = hasReward && Number.isFinite(xpTotal) && xpTotal > 0 && xpRecipients.size > 0;
  const xpShare = xpValid ? splitXp(xpTotal, xpRecipients.size) : 0;

  const handleEnd = () => {
    const hpPatches: PartyMemberPatch[] = review.party
      .filter((d) => applyIds.has(d.memberId))
      .map((d) => ({ id: d.memberId, hp: d.after }));
    const xpAward: EndCombatXpAward | undefined = xpValid
      ? { total: xpTotal, recipientIds: [...xpRecipients], label: `Encounter: ${encounter?.name ?? "combat"}` }
      : undefined;
    onEnd({ hpPatches, xpAward });
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

          {hasReward && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>XP reward</div>
              <div className={styles.xpRow}>
                <input
                  className={styles.xpInput}
                  type="number"
                  min={0}
                  value={xpAmount}
                  onChange={(e) => setXpAmount(e.target.value)}
                  aria-label="XP to award"
                />
                <span className={styles.xpPreview}>
                  {xpValid
                    ? `${xpShare.toLocaleString()} XP ${xpMode === "party" ? "to the pool" : "each"} across ${xpRecipients.size}`
                    : "Tick at least one PC"}
                </span>
              </div>
              <div className={styles.xpRecipients}>
                {party.map((m) => (
                  <label key={m.id} className={styles.xpChip}>
                    <input
                      type="checkbox"
                      checked={xpRecipients.has(m.id)}
                      onChange={() => toggleXp(m.id)}
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </section>
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
