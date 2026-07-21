// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useContext, useEffect, useRef, useState } from "react";
import { VaultContext, useAI, ollamaCheck, ollamaGenerate, openaiGenerate, logWarn, logError } from "@ttcanvas/core";
import type { NpcGeneratorState, GenderType } from "./types";
import {
  generateName, generateOccupation, generateTrait, generateHook, generateVoice, generateAge,
  GENDER_LABELS, GENDER_TYPES, RACES, DND_CLASSES, DND_CLASS_LABELS, createDefaultNpcGeneratorState,
} from "./tables";
import { generateStats } from "./stats";
import { nameToFilename, uniqueNpcFilename, serializeNpcJson, autoAccentColor, npcInitials, ACCENT_PRESETS } from "../npc-library/npcFormat";
import type { ParsedNpc } from "../npc-library/types";
import styles from "./NpcGenerator.module.css";

const ABILITY_LABELS: ["str", "dex", "con", "int", "wis", "cha"] = ["str", "dex", "con", "int", "wis", "cha"];

function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

interface Props {
  state: NpcGeneratorState;
  onChange: (state: NpcGeneratorState) => void;
}

function migrateState(raw: Partial<NpcGeneratorState> & Record<string, unknown>): NpcGeneratorState {
  const defaults = createDefaultNpcGeneratorState();
  return {
    ...defaults,
    ...raw,
    // backward compat: old state had `role` instead of `occupation`
    occupation: (raw.occupation as string) ?? (raw.role as string) ?? defaults.occupation,
    // old state had `description` instead of trait/hook/voice
    trait: (raw.trait as string) ?? defaults.trait,
    hook: (raw.hook as string) ?? defaults.hook,
    voice: (raw.voice as string) ?? defaults.voice,
    locked: {
      ...defaults.locked,
      ...(raw.locked as object ?? {}),
    },
    accentColor: (raw.accentColor as string) ?? autoAccentColor((raw.name as string) ?? ""),
    dndClass: (raw.dndClass as string) ?? "",
    level: (raw.level as number | null) ?? null,
    relationship: (raw.relationship as NpcGeneratorState["relationship"]) ?? null,
  };
}

function campaignPrefix(s: NpcGeneratorState): string {
  const ctx = s.systemPrompt?.trim();
  return ctx ? `Campaign context: ${ctx}\n\n` : "";
}

function buildAIPrompt(s: NpcGeneratorState): string {
  const classInfo = s.dndClass ? `, ${s.dndClass}${s.level ? ` level ${s.level}` : ""}` : "";
  return `${campaignPrefix(s)}You are a creative TTRPG assistant. Generate three short descriptions for an NPC:
Name: ${s.name}
Species: ${s.race}
Occupation: ${s.occupation}${classInfo}
Age: ${s.age}

Return ONLY a JSON object with exactly these three keys (no markdown, no explanation):
{
  "trait": "A brief physical trait or personality quirk (1 sentence)",
  "hook": "A plot hook or secret (1 sentence)",
  "voice": "How they speak - tone, accent, or speech mannerism (1 sentence)"
}`;
}

function buildSingleFieldPrompt(field: "trait" | "hook" | "voice", s: NpcGeneratorState): string {
  const classInfo = s.dndClass ? `, ${s.dndClass}${s.level ? ` level ${s.level}` : ""}` : "";
  const instructions: Record<typeof field, string> = {
    trait: "Write a brief physical trait or personality quirk for this NPC (1 sentence). Do not mention the character's name.",
    hook: "Write a plot hook or secret for this NPC (1 sentence). Do not mention the character's name.",
    voice: "Describe how this NPC speaks - their tone, accent, or speech mannerism (1 sentence). Do not mention the character's name.",
  };
  return `${campaignPrefix(s)}You are a creative TTRPG assistant. ${instructions[field]}
Species: ${s.race}, Occupation: ${s.occupation}${classInfo}, Age: ${s.age}
Return ONLY the description sentence, no extra text.`;
}

export function NpcGenerator({ state: rawState, onChange }: Props) {
  const state = migrateState(rawState as Partial<NpcGeneratorState> & Record<string, unknown>);
  const vault = useContext(VaultContext);
  const { config: aiConfig } = useAI();

  const patch = (fields: Partial<NpcGeneratorState>) => {
    setSavedFilename(null);
    setSaved(false);
    if (saveResetRef.current) {
      clearTimeout(saveResetRef.current);
      saveResetRef.current = null;
    }
    onChange({ ...state, ...fields });
  };
  const toggleLock = (field: keyof NpcGeneratorState["locked"]) =>
    patch({ locked: { ...state.locked, [field]: !state.locked[field] } });

  // Keep a ref to the latest patch so async streaming callbacks never use a stale closure.
  const patchRef = useRef(patch);
  patchRef.current = patch;

  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [generating, setGenerating] = useState<false | "all" | "trait" | "hook" | "voice">(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // The name the collision warning was raised for (not a bare boolean), so any change to the
  // name - typed, gender re-roll, "Re-roll all" - auto-clears a now-stale warning instead of it
  // needing every name-changing code path to remember to reset a separate flag.
  const [collisionName, setCollisionName] = useState<string | null>(null);
  const nameCollision = collisionName !== null && collisionName === state.name;
  // The just-saved file, so "Open in NPC Library" / "Generate another" can follow up. Cleared inside
  // `patch` (every field edit's single choke point) rather than on a timer, so it survives as long as
  // the form still reflects what was saved and disappears the moment the GM changes anything.
  const [savedFilename, setSavedFilename] = useState<string | null>(null);
  // Tracks the pending "Saved ✓" -> idle timeout so a second save (or any edit, via `patch`) can
  // cancel a still-running one instead of layering independent timers that clear `saved` too early.
  const saveResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamBuf = useRef("");
  const cancelGenRef = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    cancelGenRef.current?.();
    if (saveResetRef.current) clearTimeout(saveResetRef.current);
  }, []);

  useEffect(() => {
    // Deliberately unlogged: this probe is expected to reject whenever Ollama isn't running,
    // so logging it would write a line every session for a non-problem.
    ollamaCheck().then(setOllamaAvailable).catch(() => {});
  }, []);

  // Move focus to the safe action (Cancel) when the collision warning appears, and back to
  // Save when it's dismissed - same pattern ConfirmDeleteButton uses for its confirm/cancel
  // swap, since the warning is easy to miss with focus stuck on a now-disabled Save button.
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const collisionCancelRef = useRef<HTMLButtonElement>(null);
  const wasCollision = useRef(nameCollision);
  useEffect(() => {
    if (nameCollision !== wasCollision.current) {
      (nameCollision ? collisionCancelRef : saveBtnRef).current?.focus();
      wasCollision.current = nameCollision;
    }
  }, [nameCollision]);

  const handleRaceChange = (race: string) => {
    const next: Partial<NpcGeneratorState> = { race };
    if (!state.locked.age) next.age = generateAge(race);
    patch(next);
  };

  const handleGenderChange = (gender: GenderType) => {
    const next: Partial<NpcGeneratorState> = { gender };
    if (!state.locked.name) next.name = generateName(gender);
    patch(next);
  };

  const handleRerollAll = () => {
    patch({
      name: state.locked.name ? state.name : generateName(state.gender),
      occupation: state.locked.occupation ? state.occupation : generateOccupation(),
      trait: state.locked.trait ? state.trait : generateTrait(),
      hook: state.locked.hook ? state.hook : generateHook(),
      voice: state.locked.voice ? state.voice : generateVoice(),
      age: state.locked.age ? state.age : generateAge(state.race),
    });
  };

  // Follow-up to a successful save: rolls a new NPC the same way "Re-roll all" does (respecting
  // locks, so a GM bulk-rolling several similar NPCs keeps what they locked), plus clears the
  // relationship badge and rolls fresh stats, since those describe the NPC that was just saved.
  const handleGenerateAnother = () => {
    patch({
      name: state.locked.name ? state.name : generateName(state.gender),
      occupation: state.locked.occupation ? state.occupation : generateOccupation(),
      trait: state.locked.trait ? state.trait : generateTrait(),
      hook: state.locked.hook ? state.hook : generateHook(),
      voice: state.locked.voice ? state.voice : generateVoice(),
      age: state.locked.age ? state.age : generateAge(state.race),
      relationship: null,
      ...(state.generateStats
        ? { stats: generateStats({ dndClass: state.dndClass, level: state.level, race: state.race }) }
        : {}),
    });
  };

  const handleRerollStats = () => {
    patch({ stats: generateStats({ dndClass: state.dndClass, level: state.level, race: state.race }) });
  };

  // Auto-regenerate stats when the toggle, class, level, or species changes.
  useEffect(() => {
    if (!state.generateStats) return;
    patch({ stats: generateStats({ dndClass: state.dndClass, level: state.level, race: state.race }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.generateStats, state.dndClass, state.level, state.race]);

  function stripJsonFences(s: string): string {
    return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  }

  function tryParseAllFields(raw: string) {
    // Deliberately silent: this runs against the partial buffer after every streamed token, so
    // incomplete JSON is the normal case for all but the last one. Logging here would bury the
    // rest of the log under one warning per token. The caller logs once, if the *final* parse
    // fails, which is the only point at which a bad reply is actually a bad reply.
    try { return JSON.parse(stripJsonFences(raw)); } catch { return null; }
  }

  async function runAI(mode: "all" | "trait" | "hook" | "voice") {
    if (generating) return;
    const canRun = !!aiConfig.model && (aiConfig.provider !== "ollama" || ollamaAvailable);
    if (!canRun) return;
    setGenerating(mode);

    const prompt = mode === "all" ? buildAIPrompt(state) : buildSingleFieldPrompt(mode, state);
    streamBuf.current = "";

    const handleChunk = (chunk: { type: string; text?: string }) => {
      if (chunk.type === "token") {
        streamBuf.current += chunk.text ?? "";
        if (mode === "all") {
          const parsed = tryParseAllFields(streamBuf.current);
          if (parsed) {
            patchRef.current({
              trait: parsed.trait ?? undefined,
              hook: parsed.hook ?? undefined,
              voice: parsed.voice ?? undefined,
            });
          }
        } else {
          patchRef.current({ [mode]: streamBuf.current } as Partial<NpcGeneratorState>);
        }
      } else {
        if (mode === "all") {
          const parsed = tryParseAllFields(streamBuf.current);
          // The stream is finished, so this parse is the verdict on the whole reply. A failure
          // here silently falls back to the local generators below, which to the user looks like
          // the AI was never asked - worth one line. An empty buffer means nothing arrived at all,
          // which the request-level catch already covers.
          if (!parsed && streamBuf.current.trim()) {
            logWarn("NPC Generator: the AI reply was not valid JSON, using local generators instead");
          }
          patchRef.current({
            trait: parsed?.trait || generateTrait(),
            hook: parsed?.hook || generateHook(),
            voice: parsed?.voice || generateVoice(),
          });
        }
        setGenerating(false);
      }
    };

    cancelGenRef.current?.();
    try {
      const gen = aiConfig.provider === "ollama"
        ? ollamaGenerate(aiConfig.model!, prompt, handleChunk)
        : openaiGenerate(aiConfig.baseUrl, aiConfig.apiKey, aiConfig.model!, prompt, handleChunk);
      cancelGenRef.current = gen.cancel;
      await gen.promise;
    } catch (err) {
      logError("NPC Generator: AI generation failed", err);
      setGenerating(false);
    } finally {
      cancelGenRef.current = null;
    }
  }

  // `asNewCopy`: bypass the collision check and save under a suffixed filename regardless -
  // used by the "Save as new copy" confirm button once the user has seen the warning.
  const handleSave = async (asNewCopy = false) => {
    if (!vault?.vaultPath) return;
    const includeStats = state.generateStats && !!state.stats;
    try {
      const existing = (await vault.listFiles("json")).filter((f) => f.startsWith("npcs/"));
      const base = nameToFilename(state.name);
      if (!asNewCopy && existing.includes(base)) {
        setCollisionName(state.name);
        return;
      }
      const filename = asNewCopy ? uniqueNpcFilename(state.name, existing) : base;
      const npc: ParsedNpc = {
        filename,
        id: crypto.randomUUID(),
        name: state.name,
        race: state.race === "Any" ? "" : state.race,
        occupation: state.occupation,
        class: state.dndClass || undefined,
        level: state.level ?? undefined,
        age: state.age ?? undefined,
        gender: state.gender !== "any" ? state.gender : undefined,
        accentColor: state.accentColor,
        trait: state.trait || undefined,
        hook: state.hook || undefined,
        voice: state.voice || undefined,
        relationship: state.relationship ?? undefined,
        ...(includeStats && state.stats ? {
          cr: state.stats.cr,
          hp: state.stats.hp,
          hpMax: state.stats.hpMax,
          hpFormula: state.stats.hpFormula,
          ac: state.stats.ac,
          speed: state.stats.speed,
          abilityScores: state.stats.abilityScores,
          actions: state.stats.actions,
        } : {}),
      };
      await vault.writeFile(filename, serializeNpcJson(npc));
      setCollisionName(null);
      setSaved(true);
      setSavedFilename(filename);
      if (saveResetRef.current) clearTimeout(saveResetRef.current);
      saveResetRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      logError("NPC Generator: could not save the NPC to the vault", err);
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
  };

  const avatarColor = state.accentColor || autoAccentColor(state.name);
  const initials = npcInitials(state.name);

  const canAI = !!aiConfig.model && (aiConfig.provider !== "ollama" || ollamaAvailable);

  return (
    <div className={styles.root}>
      {/* ── Accent colour picker ─────────────────── */}
      <div className={styles.accentRow}>
        {ACCENT_PRESETS.map((color) => (
          <button
            key={color}
            className={`${styles.accentDot} ${state.accentColor === color ? styles.accentDotActive : ""}`}
            style={{ background: color }}
            onClick={() => patch({ accentColor: color })}
            title={color}
          />
        ))}
      </div>

      {/* ── Card: avatar + name + dropdowns ─────── */}
      <div className={styles.card}>
        <div className={styles.avatarCircle} style={{ background: avatarColor }}>
          {initials}
        </div>
        <div className={styles.cardBody}>
          <div className={styles.nameRow}>
            <input
              className={styles.nameInput}
              value={state.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
            <button
              className={`${styles.lockBtn} ${state.locked.name ? styles.locked : ""}`}
              onClick={() => toggleLock("name")}
              title={state.locked.name ? "Unlock name" : "Lock name"}
            >🔒</button>
          </div>

          <div className={styles.dropdownRow}>
            <select
              className={styles.select}
              value={state.race}
              onChange={(e) => handleRaceChange(e.target.value)}
              aria-label="Species"
            >
              {RACES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className={styles.select} value={state.occupation} onChange={(e) => patch({ occupation: e.target.value })}>
              {/* allow freeform too */}
              {!["", ...["Alchemist","Animal Trainer","Apothecary","Archivist","Armorer","Artisan","Assassin","Bandit","Beggar","Blacksmith","Bounty Hunter","Brewer","Carpenter","Cartographer","Clerk","Clothier","Commander","Cook","Courier","Cultist","Diplomat","Dockworker","Enforcer","Entertainer","Explorer","Farmer","Ferryman","Fisherman","Fletcher","Forager","Gambler","Gravedigger","Guard","Guild Member","Herbalist","Hunter","Innkeeper","Investigator","Jailer","Jeweler","Knight","Leatherworker","Librarian","Mercenary","Merchant","Midwife","Miller","Miner","Noble","Physician","Pirate","Priest","Ranger","Sailor","Scholar","Scribe","Sheriff","Smuggler","Soldier","Spy","Stablehand","Surgeon","Tax Collector","Thief","Trader","Trapper","Undertaker","Watchman","Weaver"]].includes(state.occupation) && (
                <option value={state.occupation}>{state.occupation}</option>
              )}
              {["Alchemist","Animal Trainer","Apothecary","Archivist","Armorer","Artisan","Assassin","Bandit","Beggar","Blacksmith","Bounty Hunter","Brewer","Carpenter","Cartographer","Clerk","Clothier","Commander","Cook","Courier","Cultist","Diplomat","Dockworker","Enforcer","Entertainer","Explorer","Farmer","Ferryman","Fisherman","Fletcher","Forager","Gambler","Gravedigger","Guard","Guild Member","Herbalist","Hunter","Innkeeper","Investigator","Jailer","Jeweler","Knight","Leatherworker","Librarian","Mercenary","Merchant","Midwife","Miller","Miner","Noble","Physician","Pirate","Priest","Ranger","Sailor","Scholar","Scribe","Sheriff","Smuggler","Soldier","Spy","Stablehand","Surgeon","Tax Collector","Thief","Trader","Trapper","Undertaker","Watchman","Weaver"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div className={styles.dropdownRow}>
            <select className={styles.select} value={state.gender} onChange={(e) => handleGenderChange(e.target.value as GenderType)}>
              {GENDER_TYPES.map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
            </select>
            <select className={styles.select} value={state.dndClass} onChange={(e) => patch({ dndClass: e.target.value, level: e.target.value ? state.level : null })}>
              {DND_CLASSES.map((c) => <option key={c} value={c}>{DND_CLASS_LABELS[c]}</option>)}
            </select>
            {state.dndClass && (
              <input
                className={styles.levelInput}
                type="number"
                min={1} max={20}
                placeholder="Lvl"
                value={state.level ?? ""}
                onChange={(e) => patch({ level: e.target.value ? Math.max(1, Math.min(20, Number(e.target.value))) : null })}
              />
            )}
          </div>

          <div className={styles.ageRow}>
            <span className={styles.ageLabel}>Age</span>
            <input
              className={styles.ageInput}
              type="number"
              value={state.age ?? ""}
              onChange={(e) => patch({ age: e.target.value ? Number(e.target.value) : null })}
            />
            <button
              className={`${styles.lockBtn} ${state.locked.age ? styles.locked : ""}`}
              onClick={() => toggleLock("age")}
            >🔒</button>
          </div>
        </div>
      </div>

      {/* ── Narrative fields ─────────────────────── */}
      {([
        { key: "trait" as const, label: "TRAIT", italic: false },
        { key: "hook"  as const, label: "HOOK",  italic: false },
        { key: "voice" as const, label: "VOICE", italic: true  },
      ]).map(({ key, label, italic }) => (
        <div key={key} className={styles.fieldBlock}>
          <div className={styles.fieldHead}>
            <span className={styles.fieldLabel}>{label}</span>
            <button
              className={styles.rerollBtn}
              onClick={() => canAI ? runAI(key) : patch({ [key]: key === "trait" ? generateTrait() : key === "hook" ? generateHook() : generateVoice() })}
              disabled={!!generating}
              title={canAI ? `AI re-roll ${key}` : `Re-roll ${key}`}
            >↻</button>
            <button
              className={`${styles.lockBtn} ${state.locked[key] ? styles.locked : ""}`}
              onClick={() => toggleLock(key)}
            >🔒</button>
          </div>
          <input
            className={`${styles.fieldInput} ${italic ? styles.italic : ""} ${generating === key ? styles.streaming : ""}`}
            value={state[key]}
            onChange={(e) => patch({ [key]: e.target.value })}
          />
        </div>
      ))}

      {/* ── Combat stats ─────────────────────────── */}
      <div className={styles.statsHead}>
        <span className={styles.sectionLabel}>COMBAT STATS</span>
        <button
          className={`${styles.statsToggle} ${state.generateStats ? styles.statsToggleOn : ""}`}
          onClick={() => patch({ generateStats: !state.generateStats })}
          role="switch"
          aria-checked={state.generateStats}
          title={state.generateStats ? "Disable stat generation" : "Enable stat generation"}
        >
          <span className={styles.statsToggleThumb} />
        </button>
      </div>
      {state.generateStats && state.stats && (
        <div className={styles.statsBlock}>
          <div className={styles.statsTopRow}>
            <span className={styles.statPill} title="Challenge Rating">CR {state.stats.cr}</span>
            <span className={styles.statPill} title={`HP formula: ${state.stats.hpFormula}`}>♥ {state.stats.hp}</span>
            <span className={styles.statPill} title="Armor Class">🛡 {state.stats.ac}</span>
            <span className={styles.statPill} title="Walking speed">↗ {state.stats.speed.walk} ft</span>
            <button
              className={styles.statsReroll}
              onClick={handleRerollStats}
              title="Re-roll stats"
            >↻</button>
          </div>
          <div className={styles.abilityGrid}>
            {ABILITY_LABELS.map((a) => (
              <div key={a} className={styles.abilityCell}>
                <div className={styles.abilityName}>{a.toUpperCase()}</div>
                <div className={styles.abilityScore}>{state.stats!.abilityScores[a]}</div>
                <div className={styles.abilityMod}>{abilityMod(state.stats!.abilityScores[a])}</div>
              </div>
            ))}
          </div>
          <div className={styles.actionList}>
            {state.stats.actions.map((act) => (
              <div key={act.name} className={styles.actionRow}>
                <span className={styles.actionName}>{act.name}</span>
                <span className={styles.actionDesc}>{act.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Campaign context (AI system prompt) ──── */}
      <div className={styles.sectionLabel}>CAMPAIGN CONTEXT</div>
      <textarea
        className={styles.contextTextarea}
        value={state.systemPrompt}
        placeholder="World name, tone, common factions, deities… (prepended to AI prompts)"
        onChange={(e) => patch({ systemPrompt: e.target.value })}
        rows={3}
      />

      {/* ── Relationship ─────────────────────────── */}
      <div className={styles.sectionLabel}>RELATIONSHIP</div>
      <div className={styles.relChips}>
        {(["ally", "neutral", "wary", "hostile"] as const).map((r) => (
          <button
            key={r}
            className={`${styles.relChip} ${state.relationship === r ? styles.relChipActive : ""}`}
            data-rel={r}
            onClick={() => patch({ relationship: state.relationship === r ? null : r })}
          >
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {aiConfig.provider === "ollama" && !ollamaAvailable && (
        <p className={styles.hint}>Start Ollama to enable AI re-roll</p>
      )}

      {nameCollision && (
        <div className={styles.collisionRow} role="alert">
          <span className={styles.collisionText}>An NPC named "{state.name}" already exists.</span>
          <button className={styles.collisionConfirm} onClick={() => handleSave(true)}>Save as new copy</button>
          <button ref={collisionCancelRef} className={styles.collisionCancel} onClick={() => setCollisionName(null)}>Cancel</button>
        </div>
      )}

      {/* ── Actions ──────────────────────────────── */}
      <div className={styles.actions}>
        <button
          className={styles.regenAllBtn}
          onClick={canAI ? () => runAI("all") : handleRerollAll}
          disabled={!!generating}
        >
          {generating === "all" ? "Generating…" : canAI ? "✦ Re-roll all" : "⟳ Re-roll all"}
        </button>
        <button
          ref={saveBtnRef}
          className={`${styles.saveBtn} ${saved ? styles.saveBtnSaved : ""} ${saveError ? styles.saveBtnError : ""}`}
          onClick={() => handleSave()}
          disabled={!vault?.vaultPath || !state.name.trim() || nameCollision}
          title={!vault?.vaultPath ? "Open a vault first" : undefined}
        >
          {saved ? "Saved ✓" : saveError ? "Save failed" : "Save to library"}
        </button>
      </div>

      {savedFilename && (
        <div className={styles.postSaveRow} role="status">
          <button
            className={styles.postSaveBtn}
            onClick={() => window.dispatchEvent(new CustomEvent("ttcanvas:open-npc", { detail: { filename: savedFilename } }))}
          >
            Open in NPC Library
          </button>
          <button className={styles.postSaveBtn} onClick={handleGenerateAnother}>
            Generate another
          </button>
        </div>
      )}
    </div>
  );
}
