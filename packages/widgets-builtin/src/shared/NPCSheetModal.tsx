// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import type { ParsedNpc, NpcRelationship } from "../npc-library/types";
import { SheetChrome } from "./sheet-primitives/SheetChrome";
import { SectionHead } from "./sheet-primitives/SectionHead";
import { AbilityGrid } from "./sheet-primitives/AbilityGrid";
import { RollableStat } from "./sheet-primitives/RollableStat";
import { NamedEntryList } from "./sheet-primitives/NamedEntryList";
import type { AbilityScores, NamedEntry } from "@ttcanvas/core";
import { abilityModifier, proficiencyBonus, proficiencyBonusForCr } from "@ttcanvas/core";
import styles from "./NPCSheetModal.module.css";

const TABS = ["Overview", "Abilities", "Combat", "Spellcasting", "Notes"] as const;
type Tab = typeof TABS[number];

const RELATIONSHIP_LABELS: Record<NpcRelationship, string> = {
  ally: "Ally", neutral: "Neutral", wary: "Wary", hostile: "Hostile",
};

const SKILLS_5E = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
  "History", "Insight", "Intimidation", "Investigation", "Medicine",
  "Nature", "Perception", "Performance", "Persuasion", "Religion",
  "Sleight of Hand", "Stealth", "Survival",
];

const ABILITY_KEYS: (keyof AbilityScores)[] = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABELS: Record<keyof AbilityScores, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
};

function fmtBonus(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

const DEFAULT_SCORES: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

interface Props {
  npc: ParsedNpc;
  onSave: (npc: ParsedNpc) => void;
  onClose: () => void;
}

export function NPCSheetModal({ npc, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ParsedNpc>(npc);

  function patch(p: Partial<ParsedNpc>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  // The NPC's proficiency bonus, from whichever measure it's built on: level for class-leveled NPCs,
  // else Challenge Rating for statblock monsters, else the +2 baseline every creature has. (Most
  // library NPCs have no level, so gating on level alone would drop proficiency for CR-rated saves.)
  function npcProficiencyBonus(): number {
    if (draft.level) return proficiencyBonus(draft.level);
    if (draft.cr) return proficiencyBonusForCr(draft.cr);
    return 2;
  }

  // A saving throw's total: ability modifier (default score 10) plus the proficiency bonus when the
  // NPC is proficient in that save.
  function saveBonus(key: keyof AbilityScores): number {
    const score = draft.abilityScores?.[key] ?? 10;
    const proficient = (draft.savingThrows ?? []).includes(key);
    return abilityModifier(score) + (proficient ? npcProficiencyBonus() : 0);
  }

  function set<K extends keyof ParsedNpc>(key: K, val: ParsedNpc[K]) {
    setDraft((d) => {
      const n = { ...d };
      n[key] = val;
      return n;
    });
  }

  function handleEditToggle() {
    if (editing) {
      onSave(draft);
    }
    setEditing((e) => !e);
  }

  const subtitle = [
    draft.race,
    draft.class ? `${draft.class}${draft.level ? ` ${draft.level}` : ""}` : null,
    draft.occupation,
  ].filter(Boolean).join(" · ");

  return (
    <SheetChrome
      title={draft.name || "NPC"}
      subtitle={subtitle}
      tabs={[...TABS]}
      activeTab={tab}
      editing={editing}
      onTabChange={(t) => setTab(t as Tab)}
      onEditToggle={handleEditToggle}
      onClose={onClose}
    >
      {/* ── Overview ─────────────────────────────── */}
      {tab === "Overview" && (
        <div className={styles.pane}>
          {editing ? (
            <div className={styles.fieldGrid}>
              <label className={styles.fieldLabel}>Name
                <input className={styles.input} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className={styles.fieldLabel}>Race
                <input className={styles.input} value={draft.race} onChange={(e) => patch({ race: e.target.value })} />
              </label>
              <label className={styles.fieldLabel}>Occupation
                <input className={styles.input} value={draft.occupation} onChange={(e) => patch({ occupation: e.target.value })} />
              </label>
              <label className={styles.fieldLabel}>Class
                <input className={styles.input} value={draft.class ?? ""} onChange={(e) => patch({ class: e.target.value || undefined })} />
              </label>
              <label className={styles.fieldLabel}>Subclass
                <input className={styles.input} placeholder="freeform" value={draft.subclass ?? ""} onChange={(e) => patch({ subclass: e.target.value || undefined })} />
              </label>
              <label className={styles.fieldLabel}>Level
                <input className={styles.input} type="number" min={1} max={20} value={draft.level ?? ""} onChange={(e) => patch({ level: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
              <label className={styles.fieldLabel}>Age
                <input className={styles.input} type="number" value={draft.age ?? ""} onChange={(e) => patch({ age: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
            </div>
          ) : null}

          <SectionHead style={{ marginTop: editing ? 14 : 0 }}>Narrative</SectionHead>
          <div className={styles.narrativeGrid}>
            <div>
              <div className={styles.narrativeLabel}>TRAIT</div>
              {editing
                ? <input className={styles.input} value={draft.trait ?? ""} onChange={(e) => patch({ trait: e.target.value })} placeholder="Physical or personality quirk" />
                : <p className={styles.narrativeText}>{draft.trait || <em className={styles.empty}>-</em>}</p>}
            </div>
            <div>
              <div className={styles.narrativeLabel}>HOOK</div>
              {editing
                ? <input className={styles.input} value={draft.hook ?? ""} onChange={(e) => patch({ hook: e.target.value })} placeholder="Plot hook or secret" />
                : <p className={styles.narrativeText}>{draft.hook || <em className={styles.empty}>-</em>}</p>}
            </div>
            <div>
              <div className={styles.narrativeLabel}>VOICE</div>
              {editing
                ? <input className={styles.input} value={draft.voice ?? ""} onChange={(e) => patch({ voice: e.target.value })} placeholder="How they speak" />
                : <p className={`${styles.narrativeText} ${styles.voiceText}`}>{draft.voice || <em className={styles.empty}>-</em>}</p>}
            </div>
          </div>

          <SectionHead style={{ marginTop: 14 }}>Library</SectionHead>
          <div className={styles.metaGrid}>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>Relationship</span>
              {editing ? (
                <div className={styles.relChips}>
                  {(["ally", "neutral", "wary", "hostile"] as NpcRelationship[]).map((r) => (
                    <button
                      key={r}
                      className={`${styles.relChip} ${draft.relationship === r ? styles.relChipActive : ""}`}
                      data-rel={r}
                      onClick={() => patch({ relationship: r })}
                    >{RELATIONSHIP_LABELS[r]}</button>
                  ))}
                </div>
              ) : (
                <span className={styles.relBadge} data-rel={draft.relationship}>{draft.relationship ? RELATIONSHIP_LABELS[draft.relationship] : "-"}</span>
              )}
            </div>
            {(["location", "faction", "lastSeen"] as const).map((key) => (
              <div key={key} className={styles.metaRow}>
                <span className={styles.metaKey}>{key === "lastSeen" ? "Last seen" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
                {editing
                  ? <input className={styles.input} value={draft[key] ?? ""} onChange={(e) => set(key, e.target.value || undefined)} />
                  : <span className={styles.metaVal}>{draft[key] || "-"}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Abilities ────────────────────────────── */}
      {tab === "Abilities" && (
        <div className={styles.pane}>
          <SectionHead>Ability Scores</SectionHead>
          <AbilityGrid
            scores={draft.abilityScores ?? DEFAULT_SCORES}
            editing={editing}
            onChange={(s) => patch({ abilityScores: s })}
            subject={draft.name}
          />

          <SectionHead style={{ marginTop: 16 }}>Saving Throws</SectionHead>
          {editing ? (
            <div className={styles.saveThrowGrid}>
              {ABILITY_KEYS.map((key) => {
                const checked = (draft.savingThrows ?? []).includes(key);
                return (
                  <label key={key} className={styles.saveThrowRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const saves = draft.savingThrows ?? [];
                        patch({ savingThrows: checked ? saves.filter((s) => s !== key) : [...saves, key] });
                      }}
                    />
                    <span>{ABILITY_LABELS[key]}</span>
                    <span className={styles.saveBonus}>{fmtBonus(saveBonus(key))}</span>
                  </label>
                );
              })}
            </div>
          ) : draft.savingThrows?.length ? (
            <div className={styles.saveThrowChips}>
              {draft.savingThrows.map((s) => {
                const key = s as keyof AbilityScores;
                const label = ABILITY_LABELS[key] ?? s;
                return (
                  <RollableStat
                    key={s}
                    className={styles.saveChip}
                    bonus={saveBonus(key)}
                    label={`${label} save`}
                    subject={draft.name}
                  >
                    {label} {fmtBonus(saveBonus(key))}
                  </RollableStat>
                );
              })}
            </div>
          ) : (
            <p className={styles.saveThrowText}><em className={styles.empty}>None</em></p>
          )}

          <SectionHead style={{ marginTop: 16 }}>Skills</SectionHead>
          <div className={styles.skillsGrid}>
            {SKILLS_5E.map((skill) => {
              const bonus = (draft.skills ?? {})[skill];
              return (
                <div key={skill} className={styles.skillRow}>
                  <span className={styles.skillName}>{skill}</span>
                  {editing ? (
                    <input
                      className={styles.skillInput}
                      type="number"
                      placeholder="-"
                      value={bonus ?? ""}
                      onChange={(e) => {
                        const skills = { ...(draft.skills ?? {}) };
                        if (e.target.value === "") delete skills[skill];
                        else skills[skill] = Number(e.target.value);
                        patch({ skills });
                      }}
                    />
                  ) : bonus != null ? (
                    <RollableStat className={styles.skillBonus} bonus={bonus} label={skill} subject={draft.name} />
                  ) : (
                    <span className={styles.skillBonus}>-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Combat ───────────────────────────────── */}
      {tab === "Combat" && (
        <div className={styles.pane}>
          <SectionHead>Stats</SectionHead>
          <div className={styles.statRow}>
            {([
              { key: "cr", label: "CR" },
              { key: "hp", label: "HP" },
              { key: "hpMax", label: "HP Max" },
              { key: "ac", label: "AC" },
            ] as const).map(({ key, label }) => (
              <label key={key} className={styles.statCell}>
                <span className={styles.statLabel}>{label}</span>
                {editing
                  ? <input
                      className={styles.statInput}
                      value={draft[key] ?? ""}
                      onChange={(e) => {
                        if (key === "cr") set("cr", e.target.value || undefined);
                        else set(key, e.target.value ? Number(e.target.value) : undefined);
                      }}
                    />
                  : <span className={styles.statValue}>{draft[key] ?? "-"}</span>}
              </label>
            ))}
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Hit Dice
              {editing
                ? <input className={styles.input} value={draft.hpFormula ?? ""} onChange={(e) => patch({ hpFormula: e.target.value || undefined })} placeholder="e.g. 4d8+4" />
                : <span className={styles.fieldVal}>{draft.hpFormula || "-"}</span>}
            </label>
          </div>

          <SectionHead style={{ marginTop: 14 }}>Speed</SectionHead>
          <div className={styles.speedGrid}>
            {(["walk", "fly", "swim", "burrow", "climb"] as const).map((k) => (
              <label key={k} className={styles.speedCell}>
                <span className={styles.speedLabel}>{k}</span>
                {editing
                  ? <input className={styles.statInput} type="number" value={draft.speed?.[k] ?? ""} onChange={(e) => patch({ speed: { ...draft.speed, [k]: e.target.value ? Number(e.target.value) : undefined } })} />
                  : <span className={styles.statValue}>{draft.speed?.[k] != null ? `${draft.speed[k]} ft` : "-"}</span>}
              </label>
            ))}
          </div>

          <SectionHead style={{ marginTop: 14 }}>Resistances & Immunities</SectionHead>
          {([
            { key: "damageImmunities", label: "Damage Immunities" },
            { key: "damageResistances", label: "Damage Resistances" },
            { key: "damageVulnerabilities", label: "Vulnerabilities" },
            { key: "conditionImmunities", label: "Condition Immunities" },
          ] as const).map(({ key, label }) => (
            <div key={key} className={styles.fieldRow}>
              <label className={styles.fieldLabel}>{label}
                {editing
                  ? <input className={styles.input} value={(draft[key] ?? []).join(", ")} onChange={(e) => set(key, e.target.value ? e.target.value.split(",").map((s) => s.trim()) : [])} placeholder="comma-separated" />
                  : <span className={styles.fieldVal}>{(draft[key] ?? []).join(", ") || "-"}</span>}
              </label>
            </div>
          ))}

          {(["senses", "languages"] as const).map((key) => (
            <div key={key} className={styles.fieldRow}>
              <label className={styles.fieldLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}
                {editing
                  ? <input
                      className={styles.input}
                      value={key === "languages" ? (draft.languages ?? []).join(", ") : (draft.senses ?? "")}
                      onChange={(e) => {
                        if (key === "languages") set("languages", e.target.value ? e.target.value.split(",").map((s) => s.trim()) : []);
                        else set("senses", e.target.value || undefined);
                      }}
                      placeholder={key === "languages" ? "comma-separated" : ""}
                    />
                  : <span className={styles.fieldVal}>
                      {key === "languages" ? (draft.languages ?? []).join(", ") || "-" : draft.senses || "-"}
                    </span>}
              </label>
            </div>
          ))}

          <SectionHead style={{ marginTop: 14 }}>Traits</SectionHead>
          <NamedEntryList
            entries={draft.traits ?? []}
            editing={editing}
            onChange={(e) => patch({ traits: e })}
          />

          <SectionHead style={{ marginTop: 14 }}>Actions</SectionHead>
          <NamedEntryList
            entries={draft.actions ?? []}
            editing={editing}
            onChange={(e) => patch({ actions: e })}
          />

          <SectionHead style={{ marginTop: 14 }}>Reactions</SectionHead>
          <NamedEntryList
            entries={draft.reactions ?? []}
            editing={editing}
            onChange={(e) => patch({ reactions: e })}
          />
        </div>
      )}

      {/* ── Spellcasting ─────────────────────────── */}
      {tab === "Spellcasting" && (
        <div className={styles.pane}>
          <SectionHead>Spellcasting</SectionHead>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Casting Ability
              {editing ? (
                <select
                  className={styles.select}
                  value={draft.spellcasting?.ability ?? ""}
                  onChange={(e) => patch({ spellcasting: { ...draft.spellcasting, ability: e.target.value as keyof AbilityScores } })}
                >
                  <option value="">-</option>
                  {ABILITY_KEYS.map((k) => <option key={k} value={k}>{ABILITY_LABELS[k]}</option>)}
                </select>
              ) : (
                <span className={styles.fieldVal}>{draft.spellcasting?.ability ? ABILITY_LABELS[draft.spellcasting.ability] : "-"}</span>
              )}
            </label>
            <label className={styles.fieldLabel}>Save DC
              {editing
                ? <input className={styles.input} type="number" value={draft.spellcasting?.saveDC ?? ""} onChange={(e) => patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", saveDC: e.target.value ? Number(e.target.value) : undefined } })} />
                : <span className={styles.fieldVal}>{draft.spellcasting?.saveDC ?? "-"}</span>}
            </label>
            <label className={styles.fieldLabel}>Attack Bonus
              {editing
                ? <input className={styles.input} type="number" value={draft.spellcasting?.attackBonus ?? ""} onChange={(e) => patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", attackBonus: e.target.value ? Number(e.target.value) : undefined } })} />
                : <span className={styles.fieldVal}>{draft.spellcasting?.attackBonus != null ? (draft.spellcasting.attackBonus >= 0 ? `+${draft.spellcasting.attackBonus}` : `${draft.spellcasting.attackBonus}`) : "-"}</span>}
            </label>
          </div>

          <SectionHead style={{ marginTop: 14 }}>Spells</SectionHead>
          {editing ? (
            <div>
              <textarea
                className={styles.spellTextarea}
                placeholder={"One per line: LEVEL Name (e.g. 1 Magic Missile, 0 Prestidigitation)"}
                value={(draft.spellcasting?.spells ?? []).map((s) => `${s.level} ${s.name}`).join("\n")}
                rows={8}
                onChange={(e) => {
                  const spells = e.target.value.split("\n").filter(Boolean).map((line) => {
                    const [lvl, ...rest] = line.trim().split(" ");
                    return { level: Number(lvl) || 0, name: rest.join(" ") };
                  });
                  patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", spells } });
                }}
              />
            </div>
          ) : (
            <div className={styles.spellList}>
              {(draft.spellcasting?.spells ?? []).length === 0
                ? <em className={styles.empty}>No spells listed</em>
                : Object.entries(
                    (draft.spellcasting?.spells ?? []).reduce<Record<number, string[]>>((acc, s) => {
                      (acc[s.level] ??= []).push(s.name);
                      return acc;
                    }, {}),
                  ).sort(([a], [b]) => Number(a) - Number(b)).map(([level, names]) => (
                    <div key={level} className={styles.spellLevel}>
                      <span className={styles.spellLevelLabel}>{level === "0" ? "Cantrips" : `Level ${level}`}</span>
                      <span className={styles.spellNames}>{names.join(", ")}</span>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      )}

      {/* ── Notes ────────────────────────────────── */}
      {tab === "Notes" && (
        <div className={styles.pane}>
          <SectionHead>Notes</SectionHead>
          {editing
            ? <textarea className={styles.notesTextarea} value={draft.notes ?? ""} rows={10} placeholder="GM notes (markdown supported)" onChange={(e) => patch({ notes: e.target.value || undefined })} />
            : <p className={styles.notesText}>{draft.notes || <em className={styles.empty}>No notes</em>}</p>}

          <SectionHead style={{ marginTop: 16 }}>Legendary Actions</SectionHead>
          <NamedEntryList
            entries={draft.legendaryActions ?? []}
            editing={editing}
            onChange={(e: NamedEntry[]) => patch({ legendaryActions: e })}
          />
        </div>
      )}
    </SheetChrome>
  );
}
