// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useMemo, useState } from "react";
import {
  useBestiary, useParty, useNpcs, useIT, useXp, abilityModifier,
  type CombatantKind,
} from "@ttcanvas/core";
import type { Encounter, EncounterMember, EncounterSource, EncounterBuilderState } from "./types";
import { buildCombatants, type CombatSources } from "./combat";
import { parseExpression } from "../dice-roller/dice";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ModeToggle } from "../shared/ModeToggle";
import styles from "./EncounterBuilder.module.css";

function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** What a row needs to render, resolved live from whichever library owns the source. */
interface RowView {
  name: string;
  meta: string;
  dexMod: number;
  /** The source has a parseable hit-dice formula, so "Roll HP" is worth offering. Party has none. */
  hpFormula: string | null;
}

type PickTab = "bestiary" | "party" | "npc";

const PICK_TABS: { value: PickTab; label: string }[] = [
  { value: "bestiary", label: "Bestiary" },
  { value: "party", label: "Party" },
  { value: "npc", label: "NPCs" },
];

const NPC_SIDES: { value: CombatantKind; label: string }[] = [
  { value: "foe", label: "Foe" },
  { value: "ally", label: "Ally" },
];

function libraryOf(kind: EncounterSource["kind"]): string {
  return kind === "bestiary" ? "the Bestiary" : kind === "party" ? "the party" : "the NPC Library";
}

interface Props {
  state: EncounterBuilderState;
  onChange: (state: EncounterBuilderState) => void;
}

export function EncounterBuilder({ state, onChange }: Props) {
  const { creatures } = useBestiary();
  const { members: party } = useParty();
  const { npcs } = useNpcs();
  const { startCombat, combatantCount } = useIT();
  const { awardEncounterXp } = useXp();
  const { encounters, selectedId } = state;

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickTab, setPickTab] = useState<PickTab>("bestiary");
  const [pickQuery, setPickQuery] = useState("");
  const [autoRoll, setAutoRoll] = useState(true);
  // Shown when "Start combat" is pressed while a combat is already running - replace vs append.
  const [confirmStart, setConfirmStart] = useState(false);
  const [lastStart, setLastStart] = useState<{ count: number; missing: number } | null>(null);

  const selected = encounters.find((e) => e.id === selectedId) ?? null;

  const sources: CombatSources = useMemo(() => ({
    bestiary: new Map(creatures.map((c) => [c.id, c])),
    party: new Map(party.map((m) => [m.id, m])),
    npcs: new Map(npcs.map((n) => [n.filename, n])),
  }), [creatures, party, npcs]);

  /** A formula worth offering "Roll HP" for - present and valid notation. Unparseable = not offered. */
  function rollableFormula(formula: string | undefined): string | null {
    return formula && parseExpression(formula) ? formula : null;
  }

  /** Resolves a row against its library. null = the source is gone (deleted since it was added). */
  function rowView(member: EncounterMember): RowView | null {
    const { kind, id } = member.source;
    if (kind === "bestiary") {
      const c = sources.bestiary.get(id);
      if (!c) return null;
      return {
        name: c.name,
        meta: `CR ${c.cr} · ${c.hp} HP · AC ${c.ac}`,
        dexMod: c.abilityScores ? abilityModifier(c.abilityScores.dex) : 0,
        hpFormula: rollableFormula(c.hitDice),
      };
    }
    if (kind === "party") {
      const m = sources.party.get(id);
      if (!m) return null;
      return {
        name: m.name,
        meta: `${m.hp}/${m.maxHp} HP · AC ${m.ac}`,
        dexMod: m.abilityScores ? abilityModifier(m.abilityScores.dex) : 0,
        hpFormula: null, // party HP is authoritative, never rolled
      };
    }
    const n = sources.npcs.get(id);
    if (!n) return null;
    const bits = [n.cr ? `CR ${n.cr}` : null, n.hp ? `${n.hp} HP` : null, n.ac ? `AC ${n.ac}` : null]
      .filter((b): b is string => b !== null);
    return {
      name: n.name,
      meta: bits.length ? bits.join(" · ") : "no statblock",
      dexMod: n.abilityScores ? abilityModifier(n.abilityScores.dex) : 0,
      hpFormula: rollableFormula(n.hpFormula),
    };
  }

  // ── Encounter CRUD ────────────────────────────────────────
  function patchEncounters(next: Encounter[]) {
    onChange({ ...state, encounters: next });
  }

  function updateEncounter(id: string, patch: Partial<Encounter>) {
    patchEncounters(encounters.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function selectEncounter(id: string) {
    onChange({ ...state, selectedId: id });
    setAdding(false);
    setRenaming(false);
    setConfirmDelete(false);
    setConfirmStart(false);
    setPicking(false);
    setLastStart(null);
  }

  function handleAddEncounter() {
    const name = addName.trim();
    if (!name) return;
    const encounter: Encounter = { id: crypto.randomUUID(), name, members: [] };
    onChange({ ...state, encounters: [...encounters, encounter], selectedId: encounter.id });
    setAdding(false);
    setAddName("");
  }

  function handleDeleteEncounter() {
    if (!selected) return;
    const remaining = encounters.filter((e) => e.id !== selected.id);
    onChange({ ...state, encounters: remaining, selectedId: remaining[0]?.id ?? null });
    setConfirmDelete(false);
  }

  function commitRename() {
    if (selected && renameDraft.trim()) updateEncounter(selected.id, { name: renameDraft.trim() });
    setRenaming(false);
  }

  // ── Member editing ────────────────────────────────────────
  function sameSource(a: EncounterSource, b: EncounterSource): boolean {
    return a.kind === b.kind && a.id === b.id;
  }

  function addMember(source: EncounterSource, name: string, kind?: CombatantKind) {
    if (!selected) return;
    const existing = selected.members.find((m) => sameSource(m.source, source));
    if (existing) {
      // A party member is one person, so re-picking them is a no-op rather than a second copy.
      if (source.kind !== "party") updateMember(existing.id, { count: existing.count + 1 });
    } else {
      const member: EncounterMember = { id: crypto.randomUUID(), source, name, count: 1, kind };
      updateEncounter(selected.id, { members: [...selected.members, member] });
    }
    setPicking(false);
    setPickQuery("");
  }

  /** Bulk convenience replacing the old all-or-nothing "Also add party" checkbox. */
  function addWholeParty() {
    if (!selected) return;
    const fresh = party
      .filter((m) => !selected.members.some((x) => sameSource(x.source, { kind: "party", id: m.id })))
      .map((m): EncounterMember => ({
        id: crypto.randomUUID(),
        source: { kind: "party", id: m.id },
        name: m.name,
        count: 1,
      }));
    if (fresh.length) updateEncounter(selected.id, { members: [...selected.members, ...fresh] });
  }

  function updateMember(memberId: string, patch: Partial<EncounterMember>) {
    if (!selected) return;
    updateEncounter(selected.id, {
      members: selected.members.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
    });
  }

  function setMemberCount(memberId: string, raw: number) {
    updateMember(memberId, { count: Math.max(1, Math.floor(raw) || 1) });
  }

  function removeMember(memberId: string) {
    if (!selected) return;
    updateEncounter(selected.id, { members: selected.members.filter((m) => m.id !== memberId) });
  }

  // ── Start combat ──────────────────────────────────────────
  function runStartCombat(mode: "replace" | "append") {
    if (!selected) return;
    const { combatants, missing, groups } = buildCombatants(selected, sources, { autoRoll });
    startCombat(combatants, groups, mode, { id: selected.id, name: selected.name, rewardXp: selected.rewardXp });
    setConfirmStart(false);
    setLastStart({ count: combatants.length, missing });
  }

  // Primary "Start combat": straight through when the tracker is empty, otherwise ask
  // replace-vs-append first rather than silently piling a second copy onto a live fight.
  function handleStartCombat() {
    if (combatantCount > 0) setConfirmStart(true);
    else runStartCombat("replace");
  }

  // ── Render ────────────────────────────────────────────────
  const includedMembers = selected?.members.filter((m) => m.included !== false) ?? [];
  const totalCombatants = includedMembers.reduce(
    (sum, m) => sum + (rowView(m) ? (m.source.kind === "party" ? 1 : Math.max(1, m.count)) : 0),
    0,
  );
  const missingCount = includedMembers.filter((m) => !rowView(m)).length;
  const hasPartyRow = selected?.members.some((m) => m.source.kind === "party") ?? false;

  const pq = pickQuery.trim().toLowerCase();
  const pickList: { key: string; name: string; meta: string; add: () => void }[] =
    pickTab === "bestiary"
      ? creatures
          .filter((c) => !pq || c.name.toLowerCase().includes(pq))
          .map((c) => ({
            key: c.id, name: c.name, meta: `CR ${c.cr}`,
            add: () => addMember({ kind: "bestiary", id: c.id }, c.name),
          }))
      : pickTab === "party"
        ? party
            .filter((m) => !pq || m.name.toLowerCase().includes(pq))
            .map((m) => ({
              key: m.id, name: m.name, meta: `${m.hp}/${m.maxHp} HP`,
              add: () => addMember({ kind: "party", id: m.id }, m.name),
            }))
        : npcs
            .filter((n) => !pq || n.name.toLowerCase().includes(pq))
            .map((n) => ({
              key: n.filename, name: n.name, meta: n.cr ? `CR ${n.cr}` : "NPC",
              // An NPC's standing towards the party is the sensible default side to seed from.
              add: () => addMember(
                { kind: "npc", id: n.filename }, n.name,
                n.relationship === "ally" ? "ally" : "foe",
              ),
            }));

  const pickEmptyHint =
    pickTab === "bestiary" ? "The Bestiary is empty. Add creatures there first."
      : pickTab === "party" ? "The party roster is empty. Add characters in the Party Tracker."
        : "The NPC Library is empty. Add NPCs there first.";

  return (
    <div className={styles.root}>
      {/* ── Left: encounter list ─────────────────── */}
      <div className={styles.left}>
        <div className={styles.leftHead}>
          <span className={styles.leftTitle}>Encounters</span>
          <button className={styles.addIconBtn} onClick={() => { setAdding(true); setAddName(""); }} title="New encounter">+</button>
        </div>
        <div className={styles.listScroll}>
          {encounters.length === 0 && <div className={styles.emptyList}>No encounters yet. Hit + to add one.</div>}
          {encounters.map((e) => (
            <div
              key={e.id}
              className={`${styles.listRow} ${e.id === selectedId ? styles.listRowActive : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => selectEncounter(e.id)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") selectEncounter(e.id); }}
            >
              <span className={styles.listName}>{e.name}</span>
              <span className={styles.countBadge}>{e.members.reduce((s, m) => s + Math.max(1, m.count), 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: detail / add pane ─────────────── */}
      <div className={styles.right}>
        {adding ? (
          <div className={styles.addForm}>
            <div className={styles.addFormTitle}>New Encounter</div>
            <input
              className={styles.addInput}
              value={addName}
              autoFocus
              placeholder="e.g. Bridge ambush"
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddEncounter(); if (e.key === "Escape") setAdding(false); }}
            />
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAddEncounter} disabled={!addName.trim()}>Create</button>
            </div>
          </div>
        ) : selected ? (
          <div className={styles.detail}>
            {/* Header */}
            <div className={styles.detailHeader}>
              <div className={styles.detailHeaderText}>
                {renaming ? (
                  <input
                    className={styles.titleInput}
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
                    onBlur={commitRename}
                  />
                ) : (
                  <span
                    className={styles.detailTitle}
                    onDoubleClick={() => { setRenaming(true); setRenameDraft(selected.name); }}
                    title="Double-click to rename"
                  >{selected.name}</span>
                )}
                <span className={styles.detailSub}>{totalCombatants} combatant{totalCombatants !== 1 ? "s" : ""}</span>
              </div>
              <div className={styles.detailActions}>
                <ConfirmDeleteButton
                  confirming={confirmDelete}
                  trigger="🗑"
                  triggerLabel="Delete encounter"
                  confirmQuestion={`Delete "${selected.name}"?`}
                  confirmLabel="Yes, delete"
                  className={styles.iconBtn}
                  onRequestConfirm={() => setConfirmDelete(true)}
                  onConfirm={handleDeleteEncounter}
                  onCancel={() => setConfirmDelete(false)}
                />
              </div>
            </div>

            {/* Notes */}
            <textarea
              className={styles.notes}
              value={selected.notes ?? ""}
              rows={2}
              placeholder="Setup notes (optional) - terrain, tactics, triggers…"
              onChange={(e) => updateEncounter(selected.id, { notes: e.target.value || undefined })}
            />

            {/* Reward XP - GM-entered, offered by the end-combat review. Never derived from CR. The
                inline "Award" is the general path for a fight that never went through the tracker;
                it splits the reward across the whole party. */}
            <div className={styles.rewardRow}>
              <span className={styles.rewardLabel}>Reward XP</span>
              <input
                className={styles.rewardInput}
                type="number"
                min={0}
                placeholder="none"
                value={selected.rewardXp ?? ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  updateEncounter(selected.id, { rewardXp: Number.isFinite(n) && n > 0 ? n : undefined });
                }}
              />
              <button
                className={styles.rewardBtn}
                onClick={() => selected.rewardXp && awardEncounterXp(selected.rewardXp, party.map((m) => m.id), `Encounter: ${selected.name}`)}
                disabled={!selected.rewardXp || party.length === 0}
                title={party.length === 0 ? "No party members to award" : "Split this reward across the whole party"}
              >
                Award to party
              </button>
            </div>

            {/* Member list */}
            <div className={styles.memberList}>
              {selected.members.length === 0 && <div className={styles.emptyHint}>No combatants yet. Add some from the libraries below.</div>}
              {selected.members.map((m) => {
                const view = rowView(m);
                const excluded = m.included === false;
                const isParty = m.source.kind === "party";
                return (
                  <div key={m.id} className={`${styles.memberRow} ${excluded ? styles.memberRowExcluded : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.includeCheck}
                      checked={!excluded}
                      title={excluded ? "Excluded from Start combat" : "Included in Start combat"}
                      aria-label={`Include ${view?.name ?? m.name}`}
                      onChange={(e) => updateMember(m.id, { included: e.target.checked ? undefined : false })}
                    />
                    <span className={`${styles.memberName} ${!view ? styles.memberMissing : ""}`}>
                      {view?.name ?? m.name}
                      {!view && <span className={styles.missingTag}> · missing from {libraryOf(m.source.kind)}</span>}
                    </span>
                    {view && (
                      <span className={styles.memberMeta}>
                        {view.meta}
                        {view.dexMod !== 0 && (
                          <span className={styles.memberDexMod} title="Added to this combatant's rolled initiative">
                            {" "}· DEX {formatMod(view.dexMod)} init
                          </span>
                        )}
                      </span>
                    )}
                    {m.source.kind === "npc" && (
                      <ModeToggle
                        value={m.kind === "ally" ? "ally" : "foe"}
                        options={NPC_SIDES}
                        className={styles.sideToggle}
                        onChange={(k) => updateMember(m.id, { kind: k })}
                      />
                    )}
                    {isParty ? (
                      // The roster holds individuals - "Aria 1 / Aria 2" would be a bug, so no stepper.
                      <span className={styles.countStatic} title="Party members are individuals">1</span>
                    ) : (
                      <div className={styles.countStepper}>
                        <button className={styles.stepBtn} onClick={() => setMemberCount(m.id, m.count - 1)} disabled={m.count <= 1} title="Fewer">−</button>
                        <span className={styles.countValue}>{m.count}</span>
                        <button className={styles.stepBtn} onClick={() => setMemberCount(m.id, m.count + 1)} title="More">+</button>
                      </div>
                    )}
                    {!isParty && m.count > 1 && (
                      <label className={styles.groupCheck} title="Roll one shared initiative for the whole stack, instead of one per copy">
                        <input
                          type="checkbox"
                          checked={m.groupInit ?? false}
                          onChange={(e) => updateMember(m.id, { groupInit: e.target.checked })}
                        />
                        Group
                      </label>
                    )}
                    {view?.hpFormula && (
                      <label className={styles.groupCheck} title={`Roll HP from ${view.hpFormula} instead of the static average`}>
                        <input
                          type="checkbox"
                          checked={m.rollHp ?? false}
                          onChange={(e) => updateMember(m.id, { rollHp: e.target.checked || undefined })}
                        />
                        Roll HP
                      </label>
                    )}
                    {view?.hpFormula && m.rollHp && m.count > 1 && (
                      <label className={styles.groupCheck} title="Roll HP once for the whole stack, instead of one roll per copy">
                        <input
                          type="checkbox"
                          checked={m.sharedHp ?? false}
                          onChange={(e) => updateMember(m.id, { sharedHp: e.target.checked || undefined })}
                        />
                        shared
                      </label>
                    )}
                    <button className={styles.removeBtn} onClick={() => removeMember(m.id)} title="Remove">×</button>
                  </div>
                );
              })}
            </div>

            {/* Add-a-combatant picker */}
            {picking ? (
              <div className={styles.picker}>
                <ModeToggle value={pickTab} options={PICK_TABS} onChange={(t) => { setPickTab(t); setPickQuery(""); }} />
                <input
                  className={styles.pickSearch}
                  value={pickQuery}
                  autoFocus
                  placeholder={`Search ${PICK_TABS.find((t) => t.value === pickTab)?.label}…`}
                  onChange={(e) => setPickQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setPicking(false); setPickQuery(""); } }}
                />
                <div className={styles.pickList}>
                  {pickList.length === 0 ? (
                    <div className={styles.emptyHint}>{pq ? "No matches." : pickEmptyHint}</div>
                  ) : (
                    pickList.map((row) => (
                      <button key={row.key} className={styles.pickRow} onClick={row.add}>
                        <span className={styles.pickName}>{row.name}</span>
                        <span className={styles.pickMeta}>{row.meta}</span>
                      </button>
                    ))
                  )}
                </div>
                <button className={styles.pickClose} onClick={() => { setPicking(false); setPickQuery(""); }}>Done</button>
              </div>
            ) : (
              <button className={styles.addFromBtn} onClick={() => setPicking(true)}>+ Add combatant</button>
            )}

            {/* Start combat panel */}
            <div className={styles.startPanel}>
              {/* Party used to ride along on a checkbox that was never saved, so encounters built
                  before party rows existed would silently start with no PCs. Say so, with the fix. */}
              {!hasPartyRow && party.length > 0 && (
                <div className={styles.partyHint}>
                  No party members in this encounter.
                  <button className={styles.partyHintBtn} onClick={addWholeParty}>+ Add party ({party.length})</button>
                </div>
              )}
              <label className={styles.check}>
                <input type="checkbox" checked={autoRoll} onChange={(e) => setAutoRoll(e.target.checked)} />
                Auto-roll initiative
              </label>
              {confirmStart ? (
                // Inline confirm (the InitiativeTracker "Clear all" idiom), not a modal: three
                // outcomes, so ConfirmDeleteButton's two-way control doesn't fit.
                <div className={styles.confirmStart}>
                  <span className={styles.confirmStartMsg}>
                    A combat is already running ({combatantCount} combatant{combatantCount !== 1 ? "s" : ""}).
                  </span>
                  <div className={styles.confirmStartActions}>
                    <button className={styles.startBtn} onClick={() => runStartCombat("replace")}>Replace it</button>
                    <button className={styles.appendBtn} onClick={() => runStartCombat("append")}>Append</button>
                    <button className={styles.cancelBtn} onClick={() => setConfirmStart(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className={styles.startActions}>
                  <button className={styles.startBtn} onClick={handleStartCombat} disabled={totalCombatants === 0}>
                    Start combat
                  </button>
                  <button
                    className={styles.appendBtn}
                    onClick={() => runStartCombat("append")}
                    disabled={totalCombatants === 0 || combatantCount === 0}
                    title="Add these combatants to the combat already in the tracker"
                  >
                    Add to current combat
                  </button>
                </div>
              )}
              {lastStart && (
                <div className={styles.startResult}>
                  Sent {lastStart.count} to the Initiative Tracker.
                  {lastStart.missing > 0 && <span className={styles.startMissing}> {lastStart.missing} missing source{lastStart.missing !== 1 ? "s" : ""} skipped.</span>}
                </div>
              )}
              {missingCount > 0 && !lastStart && (
                <div className={styles.startMissing}>{missingCount} combatant{missingCount !== 1 ? "s" : ""} missing from their library - will be skipped.</div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.emptyDetail}>Select an encounter, or hit + to create one.</div>
        )}
      </div>
    </div>
  );
}
