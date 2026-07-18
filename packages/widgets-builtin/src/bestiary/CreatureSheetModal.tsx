// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import type { AbilityScores, SpellSlots } from "@ttcanvas/core";
import type { BestiaryEntry, BestiaryFolder, CreatureSize } from "./types";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { SheetChrome } from "../shared/sheet-primitives/SheetChrome";
import { SectionHead } from "../shared/sheet-primitives/SectionHead";
import { AbilityGrid } from "../shared/sheet-primitives/AbilityGrid";
import { RollableStat } from "../shared/sheet-primitives/RollableStat";
import { NamedEntryList } from "../shared/sheet-primitives/NamedEntryList";
import { CropModal } from "../party-tracker/CropModal";
import { renderMarkdown } from "../shared/markdownRenderer";
import { mimeForImageExt } from "../shared/mime";
import { useVault, pushCharacterScene } from "@ttcanvas/core";
import styles from "./CreatureSheetModal.module.css";

const TABS = ["Overview", "Abilities", "Combat", "Legendary", "Spellcasting", "Notes"] as const;
type Tab = typeof TABS[number];

const SIZES: CreatureSize[] = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

const ABILITY_KEYS: (keyof AbilityScores)[] = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABELS: Record<keyof AbilityScores, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
};

const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SPELL_ABILITIES: (keyof AbilityScores)[] = ["str", "dex", "con", "int", "wis", "cha"];

const DEFAULT_SCORES: AbilityScores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

function fmtBonus(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function formatSkills(skills?: Record<string, number>): string {
  if (!skills) return "";
  return Object.entries(skills).map(([k, v]) => `${k} ${fmtBonus(v)}`).join(", ");
}

function parseSkills(text: string): Record<string, number> | undefined {
  const result: Record<string, number> = {};
  for (const part of text.split(",")) {
    const m = part.trim().match(/^(.+?)\s+([+-]?\d+)$/);
    if (m) result[m[1].trim()] = parseInt(m[2], 10);
  }
  return Object.keys(result).length ? result : undefined;
}

interface Props {
  entry: BestiaryEntry;
  isNew: boolean;
  folders: BestiaryFolder[];
  onSave: (e: BestiaryEntry) => void;
  onDelete: () => void;
  onClose: () => void;
  onAddToIT: (e: BestiaryEntry) => void;
}

export function CreatureSheetModal({ entry, isNew, folders, onSave, onDelete, onClose, onAddToIT }: Props) {
  const vault = useVault();
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState<BestiaryEntry>(entry);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Raw text for the Tags / Skills inputs, kept separate from the parsed draft fields so the
  // input reflects exactly what was typed - deriving it from the parsed value on every keystroke
  // strips trailing commas / incomplete entries before the user can finish typing them.
  const [tagsText, setTagsText] = useState(entry.tags.join(", "));
  const [skillsText, setSkillsText] = useState(formatSkills(entry.skillBonuses));

  function patch(p: Partial<BestiaryEntry>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function handleEditToggle() {
    if (editing) onSave(draft);
    setEditing((e) => !e);
  }

  async function handlePickPortrait() {
    const src = await vault.pickImageFile();
    if (!src) return;
    const b64 = await vault.readBinaryFile(src);
    const mime = mimeForImageExt(src);
    setCropDataUrl(`data:${mime};base64,${b64}`);
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

  function patchSave(k: keyof AbilityScores, val: string) {
    const saves = { ...(draft.savingThrows ?? {}) };
    if (val === "") {
      delete saves[k];
    } else {
      saves[k] = parseInt(val, 10) || 0;
    }
    patch({ savingThrows: Object.keys(saves).length ? saves : undefined });
  }

  function flattenFolders(pId: string | null, depth: number): Array<{ folder: BestiaryFolder; depth: number }> {
    return folders
      .filter((f) => f.parentId === pId)
      .flatMap((f) => [{ folder: f, depth }, ...flattenFolders(f.id, depth + 1)]);
  }
  const flatFolders = flattenFolders(null, 0);

  const subtitle = [draft.size, draft.creatureType || null, draft.alignment || null].filter(Boolean).join(", ");

  function handleCastToPlayers() {
    const sub = [draft.creatureType, draft.cr ? `CR ${draft.cr}` : null].filter(Boolean).join(" · ");
    pushCharacterScene({
      kind: "creature",
      name: draft.name,
      subtitle: sub || undefined,
      portraitSrc: draft.portrait,
      portraitFullSrc: draft.portraitFull,
      tags: draft.tags?.length ? draft.tags : undefined,
    });
  }

  const footer = (
    <>
      <button className={styles.castBtn} onClick={handleCastToPlayers} title="Show to players">
        ▶ Cast
      </button>
      <button className={styles.itBtn} onClick={() => onAddToIT(draft)}>
        + Add to Initiative Tracker
      </button>
    </>
  );

  return (
    <>
      <SheetChrome
        title={draft.name || (isNew ? "New Creature" : "Creature")}
        subtitle={subtitle || undefined}
        tabs={[...TABS]}
        activeTab={tab}
        editing={editing}
        onTabChange={(t) => setTab(t as Tab)}
        onEditToggle={handleEditToggle}
        onClose={onClose}
        footer={footer}
      >
        {/* ── Overview ─────────────────────────────── */}
        {tab === "Overview" && (
          <div className={styles.pane}>
            <div className={styles.hero}>
              {editing ? (
                <button className={styles.portraitBtn} onClick={handlePickPortrait} title="Pick portrait">
                  {draft.portrait
                    ? <img src={draft.portrait} className={styles.portraitImg} alt="" draggable={false} />
                    : <span className={styles.portraitPlaceholder}>📷</span>
                  }
                </button>
              ) : (
                <div className={styles.portrait}>
                  {draft.portrait
                    ? <img src={draft.portrait} className={styles.portraitImg} alt="" draggable={false} />
                    : <span className={styles.portraitFallback}>{(draft.name || "?").charAt(0).toUpperCase()}</span>
                  }
                </div>
              )}
              <div className={styles.identityBlock}>
                {editing ? (
                  <>
                    <input
                      className={styles.nameInput}
                      value={draft.name}
                      placeholder="Name *"
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                    <div className={styles.identityRow}>
                      <select
                        className={styles.select}
                        value={draft.size ?? ""}
                        onChange={(e) => patch({ size: (e.target.value as CreatureSize) || undefined })}
                      >
                        <option value="">- Size -</option>
                        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input
                        className={styles.input}
                        value={draft.creatureType}
                        placeholder="Type (e.g. Dragon)"
                        onChange={(e) => patch({ creatureType: e.target.value })}
                      />
                    </div>
                    <input
                      className={styles.input}
                      value={draft.alignment ?? ""}
                      placeholder="Alignment"
                      onChange={(e) => patch({ alignment: e.target.value || undefined })}
                    />
                  </>
                ) : (
                  <>
                    <div className={styles.heroName}>{draft.name || "-"}</div>
                    <div className={styles.heroSub}>
                      {subtitle || <span className={styles.empty}>No type set</span>}
                    </div>
                  </>
                )}
              </div>
            </div>

            <SectionHead>Stats</SectionHead>
            <div className={styles.statsGrid}>
              {[
                { label: "CR",        field: "cr"       as const, type: "text",   placeholder: "-" },
                { label: "HP",        field: "hp"       as const, type: "number", placeholder: "0" },
                { label: "AC",        field: "ac"       as const, type: "number", placeholder: "0" },
                { label: "Hit Dice",  field: "hitDice"  as const, type: "text",   placeholder: "10d8+20" },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field} className={styles.statCell}>
                  <span className={styles.statLabel}>{label}</span>
                  {editing ? (
                    <input
                      className={styles.statInput}
                      type={type}
                      min={type === "number" ? 0 : undefined}
                      placeholder={placeholder}
                      value={draft[field] ?? ""}
                      onChange={(e) => patch({
                        [field]: type === "number" ? (parseInt(e.target.value, 10) || 0) : (e.target.value || undefined),
                      })}
                    />
                  ) : (
                    <span className={styles.statValue}>{draft[field] ?? "-"}</span>
                  )}
                </div>
              ))}
            </div>

            {[
              { label: "Speed",     field: "speed"     as const, placeholder: "30 ft., fly 60 ft." },
              { label: "Senses",    field: "senses"    as const, placeholder: "Darkvision 60 ft., passive Perception 15" },
              { label: "Languages", field: "languages" as const, placeholder: "Common, Draconic" },
            ].map(({ label, field, placeholder }) => (
              <div key={field} className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{label}</label>
                {editing
                  ? <input className={styles.fieldInput} value={draft[field] ?? ""} placeholder={placeholder} onChange={(e) => patch({ [field]: e.target.value || undefined })} />
                  : <span className={styles.fieldValue}>{draft[field] || "-"}</span>
                }
              </div>
            ))}

            {editing && (
              <>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Tags</label>
                  <input
                    className={styles.fieldInput}
                    value={tagsText}
                    placeholder="Comma-separated tags"
                    onChange={(e) => {
                      setTagsText(e.target.value);
                      patch({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) });
                    }}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Folder</label>
                  <select
                    className={styles.select}
                    value={draft.folderId ?? ""}
                    onChange={(e) => patch({ folderId: e.target.value || null })}
                  >
                    <option value="">- No folder -</option>
                    {flatFolders.map(({ folder, depth }) => (
                      <option key={folder.id} value={folder.id}>{"  ".repeat(depth)}{folder.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {!editing && draft.tags.length > 0 && (
              <div className={styles.tagRow}>
                {draft.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
              </div>
            )}

            {editing && !isNew && (
              <div className={styles.dangerZone}>
                <ConfirmDeleteButton
                  confirming={confirmDelete}
                  trigger="Delete creature…"
                  confirmQuestion="Delete this creature?"
                  confirmLabel="Yes, delete"
                  className={styles.deleteBtn}
                  rowClassName={styles.confirmRow}
                  questionClassName={styles.confirmText}
                  confirmClassName={styles.confirmYes}
                  cancelClassName={styles.confirmNo}
                  onRequestConfirm={() => setConfirmDelete(true)}
                  onConfirm={onDelete}
                  onCancel={() => setConfirmDelete(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Abilities ────────────────────────────── */}
        {tab === "Abilities" && (
          <div className={styles.pane}>
            <SectionHead>Ability Scores</SectionHead>
            <AbilityGrid
              scores={draft.abilityScores ?? DEFAULT_SCORES}
              editing={editing}
              onChange={(scores) => patch({ abilityScores: scores })}
              subject={draft.name}
            />

            <SectionHead style={{ marginTop: 14 }}>Saving Throws</SectionHead>
            <div className={styles.savesGrid}>
              {ABILITY_KEYS.map((k) => (
                <div key={k} className={styles.saveCell}>
                  <span className={styles.saveLabel}>{ABILITY_LABELS[k]}</span>
                  {editing ? (
                    <input
                      className={styles.saveInput}
                      type="number"
                      placeholder="-"
                      value={draft.savingThrows?.[k] !== undefined ? draft.savingThrows[k] : ""}
                      onChange={(e) => patchSave(k, e.target.value)}
                    />
                  ) : draft.savingThrows?.[k] !== undefined ? (
                    <RollableStat
                      className={styles.saveValue}
                      bonus={draft.savingThrows[k]!}
                      label={`${ABILITY_LABELS[k]} save`}
                      subject={draft.name}
                    />
                  ) : (
                    <span className={styles.saveValue}>-</span>
                  )}
                </div>
              ))}
            </div>

            <SectionHead style={{ marginTop: 14 }}>Skills</SectionHead>
            {editing ? (
              <div className={styles.fieldGroup}>
                <textarea
                  className={styles.fieldInput}
                  rows={3}
                  value={skillsText}
                  placeholder="Perception +17, Stealth +12"
                  onChange={(e) => {
                    setSkillsText(e.target.value);
                    patch({ skillBonuses: parseSkills(e.target.value) });
                  }}
                />
                <span className={styles.hint}>Comma-separated: Skill +bonus</span>
              </div>
            ) : draft.skillBonuses && Object.keys(draft.skillBonuses).length > 0 ? (
              <div className={styles.skillList}>
                {Object.entries(draft.skillBonuses).map(([s, b]) => (
                  <RollableStat key={s} className={styles.fieldValue} bonus={b} label={s} subject={draft.name}>
                    {s} {fmtBonus(b)}
                  </RollableStat>
                ))}
              </div>
            ) : (
              <p className={styles.fieldValue}>-</p>
            )}

            <SectionHead style={{ marginTop: 14 }}>Resistances &amp; Immunities</SectionHead>
            {([
              ["damageResistances",    "Damage Resistances"],
              ["damageImmunities",     "Damage Immunities"],
              ["damageVulnerabilities","Damage Vulnerabilities"],
              ["conditionImmunities",  "Condition Immunities"],
            ] as const).map(([field, label]) => (
              <div key={field} className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{label}</label>
                {editing
                  ? <input className={styles.fieldInput} value={draft[field] ?? ""} placeholder="-" onChange={(e) => patch({ [field]: e.target.value || undefined })} />
                  : <span className={styles.fieldValue}>{draft[field] || "-"}</span>
                }
              </div>
            ))}
          </div>
        )}

        {/* ── Combat ───────────────────────────────── */}
        {tab === "Combat" && (
          <div className={styles.pane}>
            <SectionHead>Special Traits</SectionHead>
            <NamedEntryList
              entries={draft.specialTraits ?? []}
              editing={editing}
              onChange={(v) => patch({ specialTraits: v.length ? v : undefined })}
            />
            <SectionHead style={{ marginTop: 14 }}>Actions</SectionHead>
            <NamedEntryList
              entries={draft.actions ?? []}
              editing={editing}
              onChange={(v) => patch({ actions: v.length ? v : undefined })}
            />
            <SectionHead style={{ marginTop: 14 }}>Bonus Actions</SectionHead>
            <NamedEntryList
              entries={draft.bonusActions ?? []}
              editing={editing}
              onChange={(v) => patch({ bonusActions: v.length ? v : undefined })}
            />
            <SectionHead style={{ marginTop: 14 }}>Reactions</SectionHead>
            <NamedEntryList
              entries={draft.reactions ?? []}
              editing={editing}
              onChange={(v) => patch({ reactions: v.length ? v : undefined })}
            />
          </div>
        )}

        {/* ── Legendary ────────────────────────────── */}
        {tab === "Legendary" && (
          <div className={styles.pane}>
            <SectionHead>Legendary Resistance</SectionHead>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Uses per day</label>
              {editing ? (
                <input
                  className={styles.statInput}
                  type="number"
                  min={0}
                  value={draft.legendaryResistances ?? ""}
                  placeholder="-"
                  onChange={(e) => patch({ legendaryResistances: parseInt(e.target.value, 10) || undefined })}
                />
              ) : (
                <span className={styles.fieldValue}>{draft.legendaryResistances ?? "-"}</span>
              )}
            </div>
            <SectionHead style={{ marginTop: 14 }}>Legendary Actions</SectionHead>
            <NamedEntryList
              entries={draft.legendaryActions ?? []}
              editing={editing}
              onChange={(v) => patch({ legendaryActions: v.length ? v : undefined })}
            />
            <SectionHead style={{ marginTop: 14 }}>Mythic Actions</SectionHead>
            <NamedEntryList
              entries={draft.mythicActions ?? []}
              editing={editing}
              onChange={(v) => patch({ mythicActions: v.length ? v : undefined })}
            />
            <SectionHead style={{ marginTop: 14 }}>Lair Actions</SectionHead>
            <NamedEntryList
              entries={draft.lairActions ?? []}
              editing={editing}
              onChange={(v) => patch({ lairActions: v.length ? v : undefined })}
            />
          </div>
        )}

        {/* ── Spellcasting ─────────────────────────── */}
        {tab === "Spellcasting" && (
          <div className={styles.pane}>
            <SectionHead>Spellcasting</SectionHead>
            <div className={styles.spellHeader}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Ability</label>
                {editing ? (
                  <select
                    className={styles.select}
                    value={draft.spellcasting?.ability ?? "int"}
                    onChange={(e) => patch({ spellcasting: { ...draft.spellcasting, ability: e.target.value as keyof AbilityScores } })}
                  >
                    {SPELL_ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_LABELS[a]}</option>)}
                  </select>
                ) : (
                  <span className={styles.fieldValue}>{ABILITY_LABELS[draft.spellcasting?.ability ?? "int"]}</span>
                )}
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Save DC</label>
                {editing ? (
                  <input
                    className={styles.statInput}
                    type="number"
                    min={0}
                    value={draft.spellcasting?.saveDC ?? ""}
                    placeholder="-"
                    onChange={(e) => patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", saveDC: parseInt(e.target.value, 10) || undefined } })}
                  />
                ) : (
                  <span className={styles.fieldValue}>{draft.spellcasting?.saveDC ?? "-"}</span>
                )}
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Atk Bonus</label>
                {editing ? (
                  <input
                    className={styles.statInput}
                    type="number"
                    value={draft.spellcasting?.attackBonus ?? ""}
                    placeholder="-"
                    onChange={(e) => patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", attackBonus: parseInt(e.target.value, 10) || undefined } })}
                  />
                ) : (
                  <span className={styles.fieldValue}>
                    {draft.spellcasting?.attackBonus !== undefined ? fmtBonus(draft.spellcasting.attackBonus) : "-"}
                  </span>
                )}
              </div>
            </div>

            <SectionHead style={{ marginTop: 14 }}>Spell Slots</SectionHead>
            <div className={styles.slotTable}>
              {SPELL_LEVELS.map((level) => {
                const slot = draft.spellcasting?.slots?.[level] ?? { total: 0, used: 0 };
                if (!editing && slot.total === 0) return null;
                return (
                  <div key={level} className={styles.slotRow}>
                    <span className={styles.slotLevel}>{level}</span>
                    {editing ? (
                      <>
                        <input
                          className={styles.slotInput}
                          type="number"
                          min={0}
                          max={9}
                          value={slot.total}
                          onChange={(e) => patchSlots(level, { total: Math.max(0, Math.min(9, parseInt(e.target.value, 10) || 0)) })}
                        />
                        <span className={styles.slotOf}>slots</span>
                      </>
                    ) : (
                      <div className={styles.slotPips}>
                        {Array.from({ length: slot.total }, (_, i) => (
                          <button
                            key={i}
                            className={`${styles.slotPip} ${i < slot.used ? styles.slotPipUsed : ""}`}
                            onClick={() => toggleSlotUsed(level, i)}
                            title={i < slot.used ? "Mark unused" : "Mark used"}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!editing && !SPELL_LEVELS.some((l) => (draft.spellcasting?.slots?.[l]?.total ?? 0) > 0) && (
                <p className={styles.empty}>No spell slots.</p>
              )}
            </div>

            <SectionHead style={{ marginTop: 14 }}>Spells</SectionHead>
            <div className={styles.spellList}>
              {SPELL_LEVELS.map((level) => {
                const spells = (draft.spellcasting?.spells ?? []).filter((s) => s.level === level);
                if (!editing && spells.length === 0) return null;
                return (
                  <div key={level} className={styles.spellLevelGroup}>
                    <span className={styles.spellLevelLabel}>Level {level}</span>
                    {spells.map((s, i) => (
                      <div key={i} className={styles.spellEntry}>
                        {editing ? (
                          <>
                            <input
                              className={styles.spellNameInput}
                              value={s.name}
                              placeholder="Spell name"
                              onChange={(e) => {
                                const updated = (draft.spellcasting?.spells ?? []).map((sp) => sp === s ? { ...sp, name: e.target.value } : sp);
                                patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", spells: updated } });
                              }}
                            />
                            <button
                              className={styles.spellRemoveBtn}
                              onClick={() => {
                                const updated = (draft.spellcasting?.spells ?? []).filter((sp) => sp !== s);
                                patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", spells: updated } });
                              }}
                            >×</button>
                          </>
                        ) : (
                          <span className={styles.spellName}>{s.name}</span>
                        )}
                      </div>
                    ))}
                    {editing && (
                      <button
                        className={styles.addSmallBtn}
                        onClick={() => {
                          const updated = [...(draft.spellcasting?.spells ?? []), { level, name: "" }];
                          patch({ spellcasting: { ...draft.spellcasting, ability: draft.spellcasting?.ability ?? "int", spells: updated } });
                        }}
                      >+ Add spell</button>
                    )}
                  </div>
                );
              })}
              {!editing && !(draft.spellcasting?.spells?.length) && <p className={styles.empty}>No spells.</p>}
            </div>
          </div>
        )}

        {/* ── Notes ────────────────────────────────── */}
        {tab === "Notes" && (
          <div className={styles.pane}>
            {editing ? (
              <textarea
                className={styles.notesTextarea}
                value={draft.notes}
                placeholder="Notes (Markdown supported)"
                onChange={(e) => patch({ notes: e.target.value })}
              />
            ) : draft.notes ? (
              <div
                className={styles.notesRendered}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.notes) }}
              />
            ) : (
              <p className={styles.empty}>No notes.</p>
            )}
          </div>
        )}
      </SheetChrome>

      {cropDataUrl && (
        <CropModal
          imgDataUrl={cropDataUrl}
          onConfirm={(cropped, full) => { patch({ portrait: cropped, portraitFull: full }); setCropDataUrl(null); }}
          onCancel={() => setCropDataUrl(null)}
        />
      )}
    </>
  );
}
