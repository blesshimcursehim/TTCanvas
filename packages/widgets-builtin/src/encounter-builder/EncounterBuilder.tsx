// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useMemo, useState } from "react";
import { useBestiary, useParty, useIT, abilityModifier, type BestiaryCreatureRef } from "@ttcanvas/core";
import type { Encounter, EncounterMember, EncounterBuilderState } from "./types";
import { buildCombatants } from "./combat";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import styles from "./EncounterBuilder.module.css";

function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

interface Props {
  state: EncounterBuilderState;
  onChange: (state: EncounterBuilderState) => void;
}

export function EncounterBuilder({ state, onChange }: Props) {
  const { creatures } = useBestiary();
  const { members: party } = useParty();
  const { addCombatants } = useIT();
  const { encounters, selectedId } = state;

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [addParty, setAddParty] = useState(true);
  const [autoRoll, setAutoRoll] = useState(true);
  const [lastStart, setLastStart] = useState<{ count: number; missing: number } | null>(null);

  const selected = encounters.find((e) => e.id === selectedId) ?? null;
  const creaturesById = useMemo(() => new Map(creatures.map((c) => [c.id, c])), [creatures]);

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
  function addMember(creature: BestiaryCreatureRef) {
    if (!selected) return;
    const existing = selected.members.find((m) => m.creatureId === creature.id);
    if (existing) {
      // Bump the count rather than adding a duplicate row.
      updateMember(existing.id, { count: existing.count + 1 });
    } else {
      const member: EncounterMember = { id: crypto.randomUUID(), creatureId: creature.id, name: creature.name, count: 1 };
      updateEncounter(selected.id, { members: [...selected.members, member] });
    }
    setPicking(false);
    setPickQuery("");
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
  function handleStartCombat() {
    if (!selected) return;
    const { combatants, missing, groups } = buildCombatants(selected, creaturesById, party, { addParty, autoRoll });
    addCombatants(combatants, groups);
    setLastStart({ count: combatants.length, missing });
  }

  // ── Render ────────────────────────────────────────────────
  const totalCreatures = selected
    ? selected.members.reduce((sum, m) => sum + (creaturesById.has(m.creatureId) ? Math.max(1, m.count) : 0), 0)
    : 0;
  const missingCount = selected
    ? selected.members.filter((m) => !creaturesById.has(m.creatureId)).length
    : 0;

  const pq = pickQuery.trim().toLowerCase();
  const pickList = pq ? creatures.filter((c) => c.name.toLowerCase().includes(pq)) : creatures;

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
                <span className={styles.detailSub}>{totalCreatures} creature{totalCreatures !== 1 ? "s" : ""}</span>
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

            {/* Member list */}
            <div className={styles.memberList}>
              {selected.members.length === 0 && <div className={styles.emptyHint}>No creatures yet. Add some from the Bestiary below.</div>}
              {selected.members.map((m) => {
                const creature = creaturesById.get(m.creatureId);
                const missing = !creature;
                const dexMod = creature?.abilityScores ? abilityModifier(creature.abilityScores.dex) : 0;
                return (
                  <div key={m.id} className={styles.memberRow}>
                    <span className={`${styles.memberName} ${missing ? styles.memberMissing : ""}`}>
                      {creature?.name ?? m.name}
                      {missing && <span className={styles.missingTag}> · missing from Bestiary</span>}
                    </span>
                    {creature && (
                      <span className={styles.memberMeta}>
                        CR {creature.cr} · {creature.hp} HP · AC {creature.ac}
                        {dexMod !== 0 && (
                          <span className={styles.memberDexMod} title="Added to this creature's rolled initiative">
                            {" "}· DEX {formatMod(dexMod)} init
                          </span>
                        )}
                      </span>
                    )}
                    <div className={styles.countStepper}>
                      <button className={styles.stepBtn} onClick={() => setMemberCount(m.id, m.count - 1)} disabled={m.count <= 1} title="Fewer">−</button>
                      <span className={styles.countValue}>{m.count}</span>
                      <button className={styles.stepBtn} onClick={() => setMemberCount(m.id, m.count + 1)} title="More">+</button>
                    </div>
                    {m.count > 1 && (
                      <label className={styles.groupCheck} title="Roll one shared initiative for the whole stack, instead of one per copy">
                        <input
                          type="checkbox"
                          checked={m.groupInit ?? false}
                          onChange={(e) => updateMember(m.id, { groupInit: e.target.checked })}
                        />
                        Group
                      </label>
                    )}
                    <button className={styles.removeBtn} onClick={() => removeMember(m.id)} title="Remove">×</button>
                  </div>
                );
              })}
            </div>

            {/* Add-from-Bestiary picker */}
            {picking ? (
              <div className={styles.picker}>
                <input
                  className={styles.pickSearch}
                  value={pickQuery}
                  autoFocus
                  placeholder="Search the Bestiary…"
                  onChange={(e) => setPickQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setPicking(false); setPickQuery(""); } }}
                />
                <div className={styles.pickList}>
                  {creatures.length === 0 ? (
                    <div className={styles.emptyHint}>The Bestiary is empty. Add creatures there first.</div>
                  ) : pickList.length === 0 ? (
                    <div className={styles.emptyHint}>No matches.</div>
                  ) : (
                    pickList.map((c) => (
                      <button key={c.id} className={styles.pickRow} onClick={() => addMember(c)}>
                        <span className={styles.pickName}>{c.name}</span>
                        <span className={styles.pickMeta}>CR {c.cr}</span>
                      </button>
                    ))
                  )}
                </div>
                <button className={styles.pickClose} onClick={() => { setPicking(false); setPickQuery(""); }}>Done</button>
              </div>
            ) : (
              <button className={styles.addFromBtn} onClick={() => setPicking(true)}>+ Add from Bestiary</button>
            )}

            {/* Start combat panel */}
            <div className={styles.startPanel}>
              <label className={styles.check}>
                <input type="checkbox" checked={addParty} onChange={(e) => setAddParty(e.target.checked)} />
                Also add party{party.length > 0 ? ` (${party.length})` : ""}
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={autoRoll} onChange={(e) => setAutoRoll(e.target.checked)} />
                Auto-roll initiative
              </label>
              <button className={styles.startBtn} onClick={handleStartCombat} disabled={totalCreatures === 0 && !(addParty && party.length > 0)}>
                Start combat
              </button>
              {lastStart && (
                <div className={styles.startResult}>
                  Added {lastStart.count} to the Initiative Tracker.
                  {lastStart.missing > 0 && <span className={styles.startMissing}> {lastStart.missing} missing creature{lastStart.missing !== 1 ? "s" : ""} skipped.</span>}
                </div>
              )}
              {missingCount > 0 && !lastStart && (
                <div className={styles.startMissing}>{missingCount} creature{missingCount !== 1 ? "s" : ""} missing from the Bestiary - will be skipped.</div>
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
