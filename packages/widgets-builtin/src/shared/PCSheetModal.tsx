// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import type { PartyMember, PCCurrency } from "../party-tracker/types";
import { SheetChrome } from "./sheet-primitives/SheetChrome";
import { SectionHead } from "./sheet-primitives/SectionHead";
import { AbilityGrid } from "./sheet-primitives/AbilityGrid";
import { RollableStat } from "./sheet-primitives/RollableStat";
import { NamedEntryList } from "./sheet-primitives/NamedEntryList";
import type { AbilityScores, SpellSlots } from "@ttcanvas/core";
import { useVault, pushCharacterScene } from "@ttcanvas/core";
import { portraitColor } from "../party-tracker/CharacterCard";
import styles from "./PCSheetModal.module.css";

const TABS = ["Overview", "Abilities", "Combat", "Spellcasting", "Features", "Inventory"] as const;
type Tab = typeof TABS[number];

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

const CURRENCY_KEYS: (keyof PCCurrency)[] = ["cp", "sp", "ep", "gp", "pp"];
const CURRENCY_LABELS: Record<keyof PCCurrency, string> = {
  cp: "Copper", sp: "Silver", ep: "Electrum", gp: "Gold", pp: "Platinum",
};

const DEFAULT_SCORES: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
const DEFAULT_CURRENCY: PCCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function mod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

interface Props {
  member: PartyMember;
  onSave: (member: PartyMember) => void;
  onClose: () => void;
}

export function PCSheetModal({ member, onSave, onClose }: Props) {
  const vault = useVault();
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PartyMember>(member);
  const [newEquipItem, setNewEquipItem] = useState("");

  function patch(p: Partial<PartyMember>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function set<K extends keyof PartyMember>(key: K, val: PartyMember[K]) {
    setDraft((d) => {
      const n = { ...d };
      n[key] = val;
      return n;
    });
  }

  function handleEditToggle() {
    if (editing) onSave(draft);
    setEditing((e) => !e);
  }

  function patchSlots(level: number, fields: Partial<{ total: number; used: number }>) {
    const slots: SpellSlots = { ...(draft.spellcasting?.slots ?? {}) };
    slots[level] = { total: slots[level]?.total ?? 0, used: slots[level]?.used ?? 0, ...fields };
    patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", slots } });
  }

  function toggleSlotUsed(level: number, idx: number) {
    const slot = draft.spellcasting?.slots?.[level] ?? { total: 0, used: 0 };
    const used = idx < slot.used ? idx : idx + 1;
    patchSlots(level, { used: Math.min(used, slot.total) });
  }

  function patchDeathSaves(field: "successes" | "failures", idx: number) {
    const saves = draft.deathSaves ?? { successes: 0, failures: 0 };
    const current = saves[field];
    const next = current > idx ? idx : idx + 1;
    patch({ deathSaves: { ...saves, [field]: Math.min(3, next) } });
  }

  const subtitle = [
    draft.race,
    draft.cls
      ? `${draft.cls}${draft.subclass ? ` (${draft.subclass})` : ""}${draft.level ? ` ${draft.level}` : ""}`
      : null,
  ].filter(Boolean).join(" · ");

  async function handleCastToPlayers() {
    let portraitSrc: string | undefined;
    let portraitFullSrc: string | undefined;
    if (member.portraitPath && vault.vaultPath) {
      const fileName = member.portraitPath.split("/").pop()!;
      portraitSrc = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
        .then((b64) => `data:image/jpeg;base64,${b64}`)
        .catch(() => undefined);
    }
    if (member.portraitFullPath && vault.vaultPath) {
      const fileName = member.portraitFullPath.split("/").pop()!;
      portraitFullSrc = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
        .then((b64) => `data:image/jpeg;base64,${b64}`)
        .catch(() => undefined);
    }
    await pushCharacterScene({
      kind: "pc",
      name: draft.name,
      subtitle: subtitle || undefined,
      portraitSrc,
      portraitFullSrc,
      accentColor: portraitColor(member.id),
    });
  }

  return (
    <SheetChrome
      title={draft.name || "Character"}
      subtitle={subtitle}
      tabs={[...TABS]}
      activeTab={tab}
      editing={editing}
      onTabChange={(t) => setTab(t as Tab)}
      onEditToggle={handleEditToggle}
      onClose={onClose}
      footer={
        <button className={styles.castBtn} onClick={handleCastToPlayers}>
          ▶ Show to players
        </button>
      }
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
              <label className={styles.fieldLabel}>Class
                <input className={styles.input} value={draft.cls} onChange={(e) => patch({ cls: e.target.value })} />
              </label>
              <label className={styles.fieldLabel}>Subclass
                <input className={styles.input} value={draft.subclass ?? ""} onChange={(e) => patch({ subclass: e.target.value || undefined })} placeholder="-" />
              </label>
              <label className={styles.fieldLabel}>Level
                <input className={styles.input} type="number" min={1} max={20} value={draft.level} onChange={(e) => patch({ level: Number(e.target.value) || 1 })} />
              </label>
            </div>
          ) : (
            <div className={styles.identityBlock}>
              <div className={styles.identityName}>{draft.name}</div>
              {subtitle && <div className={styles.identitySubtitle}>{subtitle}</div>}
            </div>
          )}

          <SectionHead style={{ marginTop: editing ? 14 : 8 }}>Notes</SectionHead>
          {editing
            ? <textarea className={styles.notesTextarea} value={draft.notes} rows={10} placeholder="GM notes (markdown supported)" onChange={(e) => patch({ notes: e.target.value })} />
            : <p className={styles.notesText}>{draft.notes || <em className={styles.empty}>No notes</em>}</p>}
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
                    {draft.abilityScores && (
                      <span className={styles.saveBonus}>{mod(draft.abilityScores[key])}</span>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className={styles.saveThrowText}>
              {draft.savingThrows?.length
                ? draft.savingThrows.map((s) => ABILITY_LABELS[s as keyof AbilityScores] ?? s).join(", ")
                : <em className={styles.empty}>None</em>}
            </p>
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
              { key: "hp" as const, label: "HP" },
              { key: "maxHp" as const, label: "Max HP" },
              { key: "ac" as const, label: "AC" },
              { key: "initiative" as const, label: "Initiative" },
              { key: "pp" as const, label: "Pass. Perc." },
              { key: "speed" as const, label: "Speed (ft)" },
            ]).map(({ key, label }) => (
              <label key={key} className={styles.statCell}>
                <span className={styles.statLabel}>{label}</span>
                {editing
                  ? <input
                      className={styles.statInput}
                      type="number"
                      value={draft[key] ?? ""}
                      onChange={(e) => {
                        if (key === "speed") set("speed", e.target.value === "" ? undefined : Number(e.target.value));
                        else set(key, e.target.value === "" ? 0 : Number(e.target.value));
                      }}
                    />
                  : <span className={styles.statValue}>{draft[key] != null ? draft[key] : "-"}</span>}
              </label>
            ))}
          </div>

          <SectionHead style={{ marginTop: 14 }}>Death Saves</SectionHead>
          {(() => {
            const saves = draft.deathSaves ?? { successes: 0, failures: 0 };
            return (
              <div className={styles.deathSavesBlock}>
                <div className={styles.deathSaveRow}>
                  <span className={styles.deathSaveLabel}>Successes</span>
                  <div className={styles.pipRow}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <button
                        key={i}
                        className={`${styles.pip} ${styles.successPip} ${i < saves.successes ? styles.pipFilled : ""}`}
                        onClick={() => patchDeathSaves("successes", i)}
                        title={`Success ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles.deathSaveRow}>
                  <span className={styles.deathSaveLabel}>Failures</span>
                  <div className={styles.pipRow}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <button
                        key={i}
                        className={`${styles.pip} ${styles.failurePip} ${i < saves.failures ? styles.pipFilled : ""}`}
                        onClick={() => patchDeathSaves("failures", i)}
                        title={`Failure ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
                {saves.failures >= 3 && (
                  <div className={styles.deathStateRow}>
                    <span className={styles.fallenLabel}>Fallen</span>
                    <button className={styles.resetBtn} onClick={() => patch({ hp: 1, deathSaves: { successes: 0, failures: 0 } })}>Reset</button>
                  </div>
                )}
                {saves.successes >= 3 && saves.failures < 3 && (
                  <div className={styles.deathStateRow}>
                    <span className={styles.stabilisedLabel}>Stabilised</span>
                    <button className={styles.resetBtn} onClick={() => patch({ hp: 1, deathSaves: { successes: 0, failures: 0 } })}>Reset</button>
                  </div>
                )}
              </div>
            );
          })()}
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

          <SectionHead style={{ marginTop: 14 }}>Spell Slots</SectionHead>
          <div className={styles.slotRows}>
            {SPELL_LEVELS.map((level) => {
              const slot = draft.spellcasting?.slots?.[level];
              if (!editing && (!slot || slot.total === 0)) return null;
              const total = slot?.total ?? 0;
              const used = slot?.used ?? 0;
              return (
                <div key={level} className={styles.slotRow}>
                  <span className={styles.slotLevel}>Lv {level}</span>
                  {editing && (
                    <input
                      className={styles.slotTotalInput}
                      type="number"
                      min={0}
                      max={9}
                      value={total}
                      onChange={(e) => patchSlots(level, { total: Number(e.target.value) || 0 })}
                    />
                  )}
                  <div className={styles.slotPips}>
                    {Array.from({ length: total }).map((_, i) => (
                      <button
                        key={i}
                        className={`${styles.slotPip} ${i < used ? styles.slotPipUsed : ""}`}
                        onClick={() => toggleSlotUsed(level, i)}
                        title={i < used ? "Mark unused" : "Mark used"}
                      />
                    ))}
                    {total === 0 && !editing && <span className={styles.empty}>-</span>}
                  </div>
                  <span className={styles.slotCount}>{used}/{total}</span>
                </div>
              );
            })}
            {!editing && !SPELL_LEVELS.some((l) => (draft.spellcasting?.slots?.[l]?.total ?? 0) > 0) && (
              <em className={styles.empty}>No spell slots configured</em>
            )}
          </div>

          <SectionHead style={{ marginTop: 14 }}>Spells Known</SectionHead>
          {editing ? (
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

      {/* ── Features ─────────────────────────────── */}
      {tab === "Features" && (
        <div className={styles.pane}>
          <SectionHead>Class Features &amp; Feats</SectionHead>
          <NamedEntryList
            entries={draft.features ?? []}
            editing={editing}
            onChange={(e) => patch({ features: e })}
          />

          <SectionHead style={{ marginTop: 14 }}>Racial Traits</SectionHead>
          <NamedEntryList
            entries={draft.traits ?? []}
            editing={editing}
            onChange={(e) => patch({ traits: e })}
          />

          <SectionHead style={{ marginTop: 14 }}>Reactions</SectionHead>
          <NamedEntryList
            entries={draft.reactions ?? []}
            editing={editing}
            onChange={(e) => patch({ reactions: e })}
          />
        </div>
      )}

      {/* ── Inventory ────────────────────────────── */}
      {tab === "Inventory" && (
        <div className={styles.pane}>
          <SectionHead>Currency</SectionHead>
          <div className={styles.currencyRow}>
            {CURRENCY_KEYS.map((key) => (
              <label key={key} className={styles.currencyCell}>
                <span className={styles.currencyLabel}>{key.toUpperCase()}</span>
                {editing ? (
                  <input
                    className={styles.currencyInput}
                    type="number"
                    min={0}
                    value={draft.currency?.[key] ?? 0}
                    onChange={(e) => patch({ currency: { ...(draft.currency ?? DEFAULT_CURRENCY), [key]: Number(e.target.value) || 0 } })}
                  />
                ) : (
                  <span className={styles.currencyValue}>{draft.currency?.[key] ?? 0}</span>
                )}
                <span className={styles.currencyName}>{CURRENCY_LABELS[key]}</span>
              </label>
            ))}
          </div>

          <SectionHead style={{ marginTop: 14 }}>Equipment</SectionHead>
          <div className={styles.equipList}>
            {(draft.equipment ?? []).map((item, i) => (
              <div key={i} className={styles.equipRow}>
                {editing ? (
                  <>
                    <input
                      className={styles.equipInput}
                      value={item}
                      onChange={(e) => {
                        const eq = [...(draft.equipment ?? [])];
                        eq[i] = e.target.value;
                        patch({ equipment: eq });
                      }}
                    />
                    <button
                      className={styles.equipRemoveBtn}
                      onClick={() => patch({ equipment: (draft.equipment ?? []).filter((_, j) => j !== i) })}
                      title="Remove"
                    >×</button>
                  </>
                ) : (
                  <span className={styles.equipItem}>{item}</span>
                )}
              </div>
            ))}
            {(draft.equipment ?? []).length === 0 && !editing && (
              <em className={styles.empty}>No equipment listed</em>
            )}
          </div>
          {editing && (
            <div className={styles.equipAddRow}>
              <input
                className={styles.equipInput}
                value={newEquipItem}
                placeholder="Add item…"
                onChange={(e) => setNewEquipItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newEquipItem.trim()) {
                    patch({ equipment: [...(draft.equipment ?? []), newEquipItem.trim()] });
                    setNewEquipItem("");
                  }
                }}
              />
              <button
                className={styles.equipAddBtn}
                onClick={() => {
                  if (!newEquipItem.trim()) return;
                  patch({ equipment: [...(draft.equipment ?? []), newEquipItem.trim()] });
                  setNewEquipItem("");
                }}
              >+</button>
            </div>
          )}
        </div>
      )}
    </SheetChrome>
  );
}
