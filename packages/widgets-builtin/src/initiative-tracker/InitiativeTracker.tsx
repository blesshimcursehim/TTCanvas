// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useState } from "react";
import { useParty, useGameTime, useToast, pushInitiativeOverlay, abilityModifier } from "@ttcanvas/core";
import { portraitColor } from "../party-tracker/CharacterCard";
import type { Combatant, CombatantKind, InitiativeGroup, InitiativeTrackerState } from "./types";
import { CombatantRow } from "./CombatantRow";
import { GroupRow } from "./GroupRow";
import { wrapForward, wrapBack } from "./roundClock";
import { buildTurnOrder, syncGroupInitiative, createGroup, dissolveGroup, pruneEmptyGroups } from "./groups";
import styles from "./InitiativeTracker.module.css";

const KIND_TOKEN_COLORS: Record<string, string> = {
  pc:   "",
  foe:  "oklch(0.55 0.20 25)",
  ally: "oklch(0.50 0.16 145)",
};

interface Props {
  state: InitiativeTrackerState;
  onChange: (state: InitiativeTrackerState) => void;
}

function sorted(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => b.initiative - a.initiative);
}

const EMPTY_FORM = { name: "", initiative: "10", hp: "10", ac: "10", kind: "foe" as CombatantKind };

export function InitiativeTracker({ state, onChange }: Props) {
  const { members: partyMembers } = useParty();
  const { advanceGameTime } = useGameTime();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmClear, setConfirmClear] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupForm, setGroupForm] = useState<{ label: string; initiative: string; combined: boolean } | null>(null);
  // Draft while the seconds field is focused, so typing isn't clobbered by
  // re-renders; committed on blur/Enter. null = not editing.
  const [secondsDraft, setSecondsDraft] = useState<string | null>(null);

  const autoAdvance = state.autoAdvanceTime ?? false;
  const roundSeconds = state.roundSeconds ?? 6;
  const roundAdvances = state.roundAdvances ?? [];
  const lairAction = state.lairActionReminder ?? false;

  const groups = state.groups ?? [];
  const ordered = buildTurnOrder(state.combatants, groups);
  const currentIdx = ordered.findIndex((e) => e.id === state.currentId);

  // Push the player-facing overlay whenever the order, current turn, round, or toggle changes.
  // Current + next only, in that order - no HP/AC/initiative numbers, and never the full GM-facing
  // order (that's GM information, and can spoil upcoming enemy turns). A combined group collapses
  // to one line (its label), matching what the GM sees as a single turn. No current turn -> push
  // null rather than a card with nothing in it.
  useEffect(() => {
    if (!state.showOnPlayer) {
      pushInitiativeOverlay(null);
      return;
    }
    const ord = buildTurnOrder(state.combatants, state.groups ?? []);
    const curIdx = ord.findIndex((e) => e.id === state.currentId);
    if (curIdx === -1) {
      pushInitiativeOverlay(null);
      return;
    }
    const curEntry = ord[curIdx];
    const nextIdx = (curIdx + 1) % ord.length;
    const nextEntry = ord[nextIdx];
    const describe = (e: typeof curEntry, current: boolean) => ({
      name: e.kind === "group" ? e.group.label : e.combatant.name,
      kind: e.kind === "group" ? "foe" : (e.combatant.kind ?? "foe"),
      current,
      next: !current,
    });
    const turns = nextIdx === curIdx
      ? [describe(curEntry, true)]
      : [describe(curEntry, true), describe(nextEntry, false)];
    // A combined group's turn has no single combatant - every member acts together, so every
    // member's token should spotlight (see tracking/bugs.md).
    const activeMembers = curEntry.kind === "group" ? curEntry.members : [curEntry.combatant];
    pushInitiativeOverlay({
      round: state.round,
      turns,
      activeSourceIds: activeMembers.map((m) => m.sourceId ?? m.id),
    });
  }, [state.showOnPlayer, state.combatants, state.groups, state.currentId, state.round]);

  // Clear the overlay when the widget unmounts (e.g. soft-closed).
  useEffect(() => () => { pushInitiativeOverlay(null); }, []);

  const patch = (fields: Partial<InitiativeTrackerState>) =>
    onChange({ ...state, ...fields });

  const updateCombatant = (updated: Combatant) =>
    patch({ combatants: state.combatants.map((c) => (c.id === updated.id ? updated : c)) });

  const removeCombatant = (id: string) => {
    const remaining = state.combatants.filter((c) => c.id !== id);
    const remainingGroups = pruneEmptyGroups(remaining, groups);
    const stillCurrent = remaining.some((c) => c.id === state.currentId) || remainingGroups.some((g) => g.id === state.currentId);
    patch({ combatants: remaining, groups: remainingGroups, currentId: stillCurrent ? state.currentId : null });
  };

  const updateGroup = (updated: InitiativeGroup) => {
    const prior = groups.find((g) => g.id === updated.id);
    const combatants = prior && prior.initiative !== updated.initiative
      ? syncGroupInitiative(state.combatants, updated.id, updated.initiative)
      : state.combatants;

    // Combined <-> separate changes which TurnEntry.id represents this group's active turn (the
    // group's own id when combined, a member's id when separate) - carry the active turn across the
    // transition, or a stale currentId leaves it pointing at nothing (see buildTurnOrder/nextTurn).
    let currentId = state.currentId;
    if (prior && prior.combined !== updated.combined) {
      const members = combatants.filter((c) => c.groupId === updated.id);
      if (updated.combined) {
        if (members.some((m) => m.id === state.currentId)) currentId = updated.id;
      } else if (state.currentId === updated.id) {
        currentId = members[0]?.id ?? null;
      }
    }

    patch({ combatants, groups: groups.map((g) => (g.id === updated.id ? updated : g)), currentId });
  };

  const ungroup = (groupId: string) => {
    const result = dissolveGroup(state.combatants, groups, groupId);
    const stillCurrent = state.currentId !== groupId;
    patch({ ...result, currentId: stillCurrent ? state.currentId : null });
  };

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
    setGroupForm(null);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const openGroupForm = () => {
    const selected = state.combatants.filter((c) => selectedIds.has(c.id));
    const maxInit = Math.max(...selected.map((c) => c.initiative), 0);
    setGroupForm({ label: `${selected[0]?.name ?? "Group"} (Group)`, initiative: String(maxInit), combined: true });
  };

  const confirmGroup = () => {
    if (!groupForm) return;
    const { combatants, groups: nextGroups } = createGroup(state.combatants, groups, [...selectedIds], {
      label: groupForm.label.trim() || "Group",
      initiative: Number(groupForm.initiative) || 0,
      combined: groupForm.combined,
    });
    patch({ combatants, groups: nextGroups });
    toggleSelectMode();
  };

  const nextTurn = () => {
    if (ordered.length === 0) return;
    if (state.currentId === null) {
      patch({ currentId: ordered[0].id });
      return;
    }
    const next = currentIdx + 1;
    if (next >= ordered.length) {
      // Record the exact delta this wrap applies (0 when auto-advance is off) so a later Prev
      // over this same boundary can undo precisely this amount, not whatever the *current*
      // auto-advance toggle or roundSeconds happens to be by then (both can change mid-combat).
      const delta = autoAdvance ? roundSeconds : 0;
      if (delta) advanceGameTime(delta);
      const newRound = state.round + 1;
      if (lairAction) showToast(`Lair action! Round ${newRound}`, "info");
      patch({ currentId: ordered[0].id, round: newRound, roundAdvances: wrapForward(roundAdvances, delta) });
    } else {
      patch({ currentId: ordered[next].id });
    }
  };

  const prevTurn = () => {
    if (ordered.length === 0 || state.currentId === null) return;
    const prev = currentIdx - 1;
    if (prev < 0) {
      // Undo exactly the delta nextTurn recorded for this boundary (see nextTurn) - an empty
      // stack means we're back at round 1 with no forward wrap left to undo.
      const { delta, roundAdvances: nextRoundAdvances } = wrapBack(roundAdvances);
      if (delta) advanceGameTime(-delta);
      patch({
        currentId: ordered[ordered.length - 1].id,
        round: Math.max(1, state.round - 1),
        roundAdvances: nextRoundAdvances,
      });
    } else {
      patch({ currentId: ordered[prev].id });
    }
  };

  const commitRoundSeconds = () => {
    if (secondsDraft === null) return;
    const n = Math.round(Number(secondsDraft));
    setSecondsDraft(null);
    if (!Number.isFinite(n) || n < 1) return; // invalid input -> keep previous value
    if (n !== roundSeconds) patch({ roundSeconds: n });
  };

  const sortByInit = () => patch({ combatants: [...sorted(state.combatants)] });

  // Wipe the encounter to start fresh: drop every combatant, clear the current turn, back to round 1.
  const clearAll = () => {
    patch({ combatants: [], currentId: null, round: 1, roundAdvances: [] });
    setConfirmClear(false);
  };

  const addPartyMembers = () => {
    const existingNames = new Set(state.combatants.map((c) => c.name));
    const toAdd: Combatant[] = partyMembers
      .filter((m) => !existingNames.has(m.name))
      .map((m) => ({
        id: crypto.randomUUID(),
        name: m.name,
        initiative: m.initiative || (10 + abilityModifier(m.abilityScores?.dex ?? 10)),
        hp: m.hp,
        maxHp: m.maxHp,
        ac: m.ac,
        kind: "pc" as CombatantKind,
        sourceId: m.id,
        portraitPath: m.portraitPath ?? undefined,
      }));
    if (toAdd.length) patch({ combatants: [...state.combatants, ...toAdd] });
  };

  const addCombatant = () => {
    if (!form.name.trim()) return;
    const hp = Number(form.hp) || 1;
    const newCombatant: Combatant = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      initiative: Number(form.initiative) || 0,
      hp,
      maxHp: hp,
      ac: Number(form.ac) || 10,
      kind: form.kind,
    };
    patch({ combatants: [...state.combatants, newCombatant] });
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const placeCombatantAtCenter = (c: Combatant) => {
    const kind = c.kind ?? "foe";
    const tokenColor = kind === "pc" ? portraitColor(c.id) : KIND_TOKEN_COLORS[kind];
    window.dispatchEvent(
      new CustomEvent("ttcanvas:place-token", {
        // Prefer the origin entity's id (party member / bestiary creature) so the map can
        // dedupe against the same character dragged in directly, instead of making a
        // portraitless duplicate. Falls back to the combatant id for ad-hoc combatants.
        detail: { sourceId: c.sourceId ?? c.id, label: c.name, color: tokenColor, portraitPath: c.portraitPath },
      }),
    );
  };

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.roundGroup}>
          <span className={styles.roundLabel}>ROUND</span>
          <span className={styles.round}>{state.round}</span>
        </div>
        <div className={styles.toolButtons}>
          <button
            className={`${styles.iconBtn} ${state.showOnPlayer ? styles.playerBtnOn : ""}`}
            onClick={() => patch({ showOnPlayer: !state.showOnPlayer })}
            title={state.showOnPlayer ? "Hide initiative from player window" : "Show initiative on player window"}
            aria-pressed={state.showOnPlayer}
          >
            <svg width="15" height="12" viewBox="0 0 13 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M1 5c0 0 2-3.5 5.5-3.5S12 5 12 5s-2 3.5-5.5 3.5S1 5 1 5z" />
              <circle cx="6.5" cy="5" r="1.5" />
            </svg>
          </button>
          <button
            className={styles.iconBtn}
            onClick={prevTurn}
            disabled={state.currentId === null || ordered.length === 0}
            title="Previous turn"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 3 5 12l14 9V3zM5 3v18" />
            </svg>
          </button>
          <button
            className={styles.nextBtn}
            onClick={nextTurn}
            disabled={ordered.length === 0}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M5 3l14 9-14 9V3z" />
            </svg>
            Next turn
          </button>
          <button
            className={styles.iconBtn}
            onClick={sortByInit}
            disabled={ordered.length < 2}
            title="Re-sort by initiative"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <path d="M3.29 7 12 12l8.71-5M12 22V12M9 9.5h.01M15 9.5h.01M12 14h.01" />
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${selectMode ? styles.groupModeOn : ""}`}
            onClick={toggleSelectMode}
            disabled={state.combatants.length < 2}
            title={selectMode ? "Cancel grouping" : "Select combatants to group (shared initiative)"}
            aria-pressed={selectMode}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="3" /><circle cx="17" cy="8" r="3" />
              <path d="M3 20c0-3 2-5 5-5s5 2 5 5M11 20c0-3 2-5 6-5s4 2 4 5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Selection action bar - shown while grouping */}
      {selectMode && (
        groupForm ? (
          <div className={styles.form}>
            <input
              className={styles.formName}
              placeholder="Group label"
              value={groupForm.label}
              onChange={(e) => setGroupForm((f) => (f ? { ...f, label: e.target.value } : f))}
              onKeyDown={(e) => { if (e.key === "Enter") confirmGroup(); if (e.key === "Escape") setGroupForm(null); }}
              autoFocus
            />
            <input
              type="number"
              className={styles.formNum}
              placeholder="Init"
              value={groupForm.initiative}
              onChange={(e) => setGroupForm((f) => (f ? { ...f, initiative: e.target.value } : f))}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className={`${styles.formToggle} ${groupForm.combined ? styles.groupModeOn : ""}`}
              onClick={() => setGroupForm((f) => (f ? { ...f, combined: !f.combined } : f))}
              title={groupForm.combined ? "Combined turn - click for separate turns" : "Separate turns - click to combine"}
            >
              {groupForm.combined ? "Combined" : "Separate"}
            </button>
            <button className={styles.formAdd} onClick={confirmGroup}>Create group</button>
          </div>
        ) : (
          <div className={styles.selectBar}>
            <span className={styles.selectHint}>
              {selectedIds.size < 2 ? "Select 2+ combatants to group" : `${selectedIds.size} selected`}
            </span>
            <button className={styles.formAdd} onClick={openGroupForm} disabled={selectedIds.size < 2}>
              Group selected
            </button>
          </div>
        )
      )}

      {/* Column headers */}
      <div className={styles.colHeaders}>
        <span className={styles.colPip} />
        <span className={styles.colInit}>INIT</span>
        <span className={styles.colName}>NAME</span>
        <span className={styles.colHp}>HP</span>
        <span className={styles.colAc}>AC</span>
      </div>

      {/* Combatant / group list */}
      <div className={styles.list}>
        {ordered.length === 0 && (
          <div className={styles.empty}>No combatants yet.</div>
        )}
        {ordered.map((entry) => {
          if (entry.kind === "group") {
            return (
              <GroupRow
                key={entry.id}
                group={entry.group}
                members={entry.members}
                isCurrent={entry.id === state.currentId}
                onChangeGroup={updateGroup}
                onUngroup={() => ungroup(entry.group.id)}
                onChangeMember={updateCombatant}
                onRemoveMember={removeCombatant}
                onPlaceMemberAtCenter={placeCombatantAtCenter}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            );
          }
          const c = entry.combatant;
          const group = c.groupId ? groups.find((g) => g.id === c.groupId) : undefined;
          return (
            <CombatantRow
              key={c.id}
              combatant={c}
              isCurrent={c.id === state.currentId}
              onChange={updateCombatant}
              onRemove={() => removeCombatant(c.id)}
              onPlaceAtCenter={() => placeCombatantAtCenter(c)}
              groupLabel={group?.label}
              onRecombineGroup={group ? () => updateGroup({ ...group, combined: true }) : undefined}
              onUngroupFromBadge={group ? () => ungroup(group.id) : undefined}
              selectMode={selectMode}
              selected={selectedIds.has(c.id)}
              onToggleSelect={() => toggleSelect(c.id)}
            />
          );
        })}
      </div>

      {/* Add form */}
      {showForm && (
        <div className={styles.form}>
          <input
            className={styles.formName}
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") addCombatant(); if (e.key === "Escape") setShowForm(false); }}
            autoFocus
          />
          <input
            type="number"
            className={styles.formNum}
            placeholder="Init"
            value={form.initiative}
            onChange={(e) => setForm((f) => ({ ...f, initiative: e.target.value }))}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <input
            type="number"
            className={styles.formNum}
            placeholder="HP"
            value={form.hp}
            onChange={(e) => setForm((f) => ({ ...f, hp: e.target.value }))}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <div className={styles.kindToggle}>
            {(["pc", "foe", "ally"] as CombatantKind[]).map((k) => (
              <button
                key={k}
                className={`${styles.kindPill} ${form.kind === k ? styles.kindActive : ""}`}
                style={form.kind === k ? { background: KIND_COLORS[k], color: "var(--bg)" } : {}}
                onClick={() => setForm((f) => ({ ...f, kind: k }))}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
          <button className={styles.formAdd} onClick={addCombatant}>Add</button>
        </div>
      )}

      {/* Auto-advance in-game time */}
      <div className={styles.timeRow}>
        <button
          className={`${styles.timeToggle} ${autoAdvance ? styles.timeToggleOn : ""}`}
          onClick={() => patch({ autoAdvanceTime: !autoAdvance })}
          aria-pressed={autoAdvance}
          title={autoAdvance
            ? `Completing a round advances the in-game clock by ${roundSeconds}s`
            : "Advance the in-game clock when a round completes"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2h12M6 22h12M8 2v4l4 4 4-4V2M8 22v-4l4-4 4 4v4" />
          </svg>
          Round advances time
        </button>
        <div className={styles.timeSecs}>
          <input
            type="number"
            className={styles.timeInput}
            min={1}
            value={secondsDraft ?? String(roundSeconds)}
            onFocus={() => setSecondsDraft(String(roundSeconds))}
            onChange={(e) => setSecondsDraft(e.target.value)}
            onBlur={commitRoundSeconds}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            disabled={!autoAdvance}
            aria-label="Seconds per round"
          />
          <span className={styles.timeUnit}>s / round</span>
        </div>
      </div>

      {/* Lair action reminder */}
      <div className={styles.timeRow}>
        <button
          className={`${styles.timeToggle} ${lairAction ? styles.timeToggleOn : ""}`}
          onClick={() => patch({ lairActionReminder: !lairAction })}
          aria-pressed={lairAction}
          title={lairAction
            ? "Reminder fires each time a new round begins"
            : "Remind at the start of each round (lair actions)"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Lair action reminder
        </button>
      </div>

      {/* Bottom bar */}
      <div className={styles.bottom}>
        {confirmClear ? (
          <>
            <span className={styles.confirmText}>Clear all combatants?</span>
            <button className={`${styles.bottomBtn} ${styles.dangerBtn}`} onClick={clearAll}>Yes, clear</button>
            <button className={styles.bottomBtn} onClick={() => setConfirmClear(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button className={styles.bottomBtn} onClick={() => setShowForm((v) => !v)}>
              + Add combatant
            </button>
            <button
              className={styles.bottomBtn}
              onClick={addPartyMembers}
              disabled={partyMembers.length === 0}
              title={partyMembers.length === 0 ? "No party members" : "Add party members"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              From party
            </button>
            <button
              className={styles.bottomBtn}
              onClick={() => setConfirmClear(true)}
              disabled={state.combatants.length === 0}
              title="Clear all combatants and reset to round 1"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
              </svg>
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export const KIND_COLORS: Record<string, string> = {
  pc: "var(--accent)",
  foe: "var(--hp)",
  ally: "var(--sp)",
};
