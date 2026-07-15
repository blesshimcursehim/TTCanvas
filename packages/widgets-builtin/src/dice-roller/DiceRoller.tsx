// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { pushDiceOverlay } from "@ttcanvas/core";
import type { DiceRollerState, RollEntry, RollMacro } from "./types";
import { evaluate, parseExpression, formatBreakdown } from "./dice";
import styles from "./DiceRoller.module.css";

interface Props {
  state: DiceRollerState;
  onChange: (state: DiceRollerState) => void;
}

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_HISTORY = 30;

// Shown in the "?" help panel so the expression syntax is discoverable without leaving the app.
const SYNTAX_HELP: ReadonlyArray<{ code: string; desc: string }> = [
  { code: "2d6", desc: "Roll two six-sided dice." },
  { code: "2d6+1d8+4", desc: "Combine dice and a flat bonus (- also works)." },
  { code: "4d6kh3", desc: "Keep the highest 3 dice. kl keeps the lowest." },
  { code: "d6!", desc: "Explode: a max face rolls again and adds on." },
  { code: "d20", desc: "A lone d20 flags a crit (nat 20) or fumble (nat 1)." },
];

export function DiceRoller({ state, onChange }: Props) {
  // Manage mode, the new-macro draft, and the syntax-help panel are ephemeral UI, not persisted.
  const [managing, setManaging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [draft, setDraft] = useState<{ label: string; expr: string }>({ label: "", expr: "" });

  const latest = state.history[0] ?? null;
  const inputValid = parseExpression(state.input.trim()) !== null;

  function roll(expr: string, label: string) {
    const outcome = evaluate(expr, state.adv);
    if (!outcome) return;
    const { breakdown, alt } = outcome;
    const entry: RollEntry = {
      id: crypto.randomUUID(),
      label,
      expr,
      total: breakdown.total,
      breakdown: formatBreakdown(breakdown),
      altTotal: alt ? alt.total : null,
      adv: outcome.adv,
      crit: breakdown.crit,
      fumble: breakdown.fumble,
      at: Date.now(),
    };
    onChange({ ...state, history: [entry, ...state.history].slice(0, MAX_HISTORY) });
  }

  function rollInput() {
    const expr = state.input.trim();
    if (expr) roll(expr, expr);
  }

  function toggleAdv(val: "advantage" | "disadvantage") {
    onChange({ ...state, adv: state.adv === val ? null : val });
  }

  // Cast toggles the current result on/off the player-window overlay (lower-middle).
  function toggleCast(entry: RollEntry) {
    if (state.castId === entry.id) {
      void pushDiceOverlay(null);
      onChange({ ...state, castId: null });
    } else {
      void pushDiceOverlay({
        label: entry.label,
        total: entry.total,
        breakdown: entry.breakdown,
        crit: entry.crit,
        fumble: entry.fumble,
      });
      onChange({ ...state, castId: entry.id });
    }
  }

  // ── Macro CRUD ──
  function addDraftMacro() {
    const label = draft.label.trim();
    const expr = draft.expr.trim();
    if (!label || !parseExpression(expr)) return;
    const macro: RollMacro = { id: crypto.randomUUID(), label, expr };
    onChange({ ...state, macros: [...state.macros, macro] });
    setDraft({ label: "", expr: "" });
  }

  function saveInputAsMacro() {
    const expr = state.input.trim();
    if (!parseExpression(expr)) return;
    onChange({ ...state, macros: [...state.macros, { id: crypto.randomUUID(), label: expr, expr }] });
  }

  function updateMacro(id: string, patch: Partial<RollMacro>) {
    onChange({ ...state, macros: state.macros.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }

  function deleteMacro(id: string) {
    onChange({ ...state, macros: state.macros.filter((m) => m.id !== id) });
  }

  function clearHistory() {
    // Also drop a lingering cast so the player overlay doesn't outlive its history entry.
    if (state.castId) void pushDiceOverlay(null);
    onChange({ ...state, history: [], castId: null });
  }

  function moveMacro(id: string, dir: -1 | 1) {
    const i = state.macros.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.macros.length) return;
    const next = [...state.macros];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...state, macros: next });
  }

  const query = state.query.trim().toLowerCase();
  const visibleMacros = query
    ? state.macros.filter((m) => m.label.toLowerCase().includes(query) || m.expr.toLowerCase().includes(query))
    : state.macros;

  const resultTone = latest?.crit ? styles.critText : latest?.fumble ? styles.fumbleText : "";

  return (
    <div className={styles.root}>
      {/* Result hero (result-first, Hybrid layout) */}
      <div className={styles.result}>
        {latest ? (
          <>
            <div className={styles.resultHead}>
              <span className={styles.resultLabel}>{latest.label}</span>
              <button
                className={`${styles.castBtn} ${state.castId === latest.id ? styles.castActive : ""}`}
                onClick={() => toggleCast(latest)}
                title={state.castId === latest.id ? "Clear from player screen" : "Cast to player screen"}
                aria-pressed={state.castId === latest.id}
              >
                {state.castId === latest.id ? "Casting" : "Cast"}
              </button>
            </div>
            <span className={`${styles.resultTotal} ${resultTone}`}>{latest.total}</span>
            <span className={styles.resultBreakdown}>
              {latest.breakdown}
              {latest.altTotal !== null && (
                <span className={styles.altNote}>
                  {" "}· {latest.adv === "advantage" ? "adv" : "dis"} {latest.total}/{latest.altTotal}
                </span>
              )}
            </span>
            {(latest.crit || latest.fumble) && (
              <span className={`${styles.flag} ${resultTone}`}>{latest.crit ? "CRIT" : "FUMBLE"}</span>
            )}
          </>
        ) : (
          <span className={styles.resultEmpty}>Roll a die</span>
        )}
      </div>

      {/* Command line */}
      <div className={styles.commandRow}>
        <input
          className={styles.commandInput}
          value={state.input}
          onChange={(e) => onChange({ ...state, input: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") rollInput(); }}
          placeholder="2d6+1d8+4, 4d6kh3, d6!"
          title="Dice notation, e.g. 2d6+1d8+4, 4d6kh3, d6! - press ? for the full syntax"
          spellCheck={false}
          aria-label="Dice expression"
        />
        <button
          className={`${styles.helpBtn} ${showHelp ? styles.helpActive : ""}`}
          onClick={() => setShowHelp((h) => !h)}
          title="Dice syntax help"
          aria-label="Dice syntax help"
          aria-expanded={showHelp}
          aria-controls="dice-syntax-help"
        >
          ?
        </button>
        <button className={styles.rollBtn} onClick={rollInput} disabled={!inputValid}>Roll</button>
      </div>

      {showHelp && (
        <dl className={styles.help} id="dice-syntax-help">
          {SYNTAX_HELP.map(({ code, desc }) => (
            <div key={code} className={styles.helpRow}>
              <dt className={styles.helpCode}>{code}</dt>
              <dd className={styles.helpDesc}>{desc}</dd>
            </div>
          ))}
          <p className={styles.helpNote}>ADV / DIS roll the whole expression twice and keep the higher / lower total.</p>
        </dl>
      )}

      {/* Advantage / disadvantage (generalised - applies to any expression) */}
      <div className={styles.advRow}>
        <button
          className={`${styles.advBtn} ${state.adv === "advantage" ? styles.advActive : ""}`}
          onClick={() => toggleAdv("advantage")}
          title="Advantage: roll the whole expression twice, keep the higher total"
          aria-pressed={state.adv === "advantage"}
        >
          ADV
        </button>
        <button
          className={`${styles.advBtn} ${state.adv === "disadvantage" ? styles.disActive : ""}`}
          onClick={() => toggleAdv("disadvantage")}
          title="Disadvantage: roll the whole expression twice, keep the lower total"
          aria-pressed={state.adv === "disadvantage"}
        >
          DIS
        </button>
        <button
          className={styles.saveMacroBtn}
          onClick={saveInputAsMacro}
          disabled={!inputValid}
          title="Save the current expression as a macro"
        >
          + Save
        </button>
      </div>

      {/* Quick dice */}
      <div className={styles.diceRow}>
        {QUICK_DICE.map((sides) => (
          <button key={sides} className={styles.dieBtn} onClick={() => roll(`1d${sides}`, `d${sides}`)} title={`Roll d${sides}`}>
            {`d${sides}`}
          </button>
        ))}
      </div>

      {/* Macros */}
      <div className={styles.macrosHead}>
        <input
          className={styles.macroSearch}
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
          placeholder="Search macros"
          aria-label="Search macros"
        />
        <button
          className={`${styles.manageBtn} ${managing ? styles.manageActive : ""}`}
          onClick={() => setManaging((m) => !m)}
          aria-pressed={managing}
        >
          {managing ? "Done" : "Manage"}
        </button>
      </div>

      {managing ? (
        <div className={styles.macroEditor}>
          {state.macros.map((m) => (
            <div key={m.id} className={styles.macroEditRow}>
              <input
                className={styles.macroEditLabel}
                value={m.label}
                onChange={(e) => updateMacro(m.id, { label: e.target.value })}
                placeholder="Label"
                aria-label="Macro label"
              />
              <input
                className={`${styles.macroEditExpr} ${parseExpression(m.expr.trim()) ? "" : styles.invalid}`}
                value={m.expr}
                onChange={(e) => updateMacro(m.id, { expr: e.target.value })}
                placeholder="1d20+7"
                spellCheck={false}
                aria-label="Macro expression"
              />
              <button className={styles.iconBtn} onClick={() => moveMacro(m.id, -1)} title="Move up" aria-label="Move up">↑</button>
              <button className={styles.iconBtn} onClick={() => moveMacro(m.id, 1)} title="Move down" aria-label="Move down">↓</button>
              <button className={styles.iconBtn} onClick={() => deleteMacro(m.id)} title="Delete macro" aria-label="Delete macro">🗑</button>
            </div>
          ))}
          <div className={styles.macroAddRow}>
            <input
              className={styles.macroEditLabel}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="New label"
              aria-label="New macro label"
            />
            <input
              className={styles.macroEditExpr}
              value={draft.expr}
              onChange={(e) => setDraft({ ...draft, expr: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") addDraftMacro(); }}
              placeholder="1d20+7"
              spellCheck={false}
              aria-label="New macro expression"
            />
            <button
              className={styles.addBtn}
              onClick={addDraftMacro}
              disabled={!draft.label.trim() || !parseExpression(draft.expr.trim())}
            >
              Add
            </button>
          </div>
        </div>
      ) : state.macros.length === 0 ? (
        <p className={styles.macroEmpty}>No macros yet. Roll an expression and hit “+ Save”, or use Manage.</p>
      ) : (
        <div className={styles.macroGrid}>
          {visibleMacros.map((m) => (
            <button key={m.id} className={styles.macroCard} onClick={() => roll(m.expr, m.label)} title={`Roll ${m.expr}`}>
              <span className={styles.macroCardLabel}>{m.label}</span>
              <span className={styles.macroCardExpr}>{m.expr}</span>
            </button>
          ))}
          {visibleMacros.length === 0 && <p className={styles.macroEmpty}>No macros match “{state.query}”.</p>}
        </div>
      )}

      {/* History */}
      {state.history.length > 0 && (
        <div className={styles.historySection}>
          <div className={styles.historyHead}>
            <span className={styles.historyHeadLabel}>History</span>
            <button className={styles.clearBtn} onClick={clearHistory} title="Clear roll history">Clear</button>
          </div>
          {state.history.length > 1 && (
            <ol className={styles.history}>
              {state.history.slice(1).map((r) => (
                <li key={r.id} className={styles.historyRow}>
                  <span className={`${styles.historyTotal} ${r.crit ? styles.critText : r.fumble ? styles.fumbleText : ""}`}>{r.total}</span>
                  <span className={styles.historyLabel}>{r.label}</span>
                  <span className={styles.historyBreakdown}>{r.breakdown}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
