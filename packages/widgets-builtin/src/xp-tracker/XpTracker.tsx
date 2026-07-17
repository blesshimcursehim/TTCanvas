// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { useParty } from "@ttcanvas/core";
import type { XpTrackerState, XpAward } from "./types";
import { DEFAULT_XP_THRESHOLDS, levelForXp, splitXp, levelProgress, applyEncounterAward, XP_HISTORY_CAP } from "./xpMath";
import styles from "./XpTracker.module.css";

interface Props {
  state: XpTrackerState;
  onChange: (state: XpTrackerState) => void;
}

function levelLabel(level: number | null): string {
  return level === null ? "-" : `Lv ${level}`;
}

export function XpTracker({ state, onChange }: Props) {
  const { members, patchMembers } = useParty();
  const { mode, partyXp, perPc, thresholds } = state;
  const history = state.history ?? [];
  const effectiveThresholds = thresholds ?? DEFAULT_XP_THRESHOLDS;

  const [awardAmount, setAwardAmount] = useState("");
  // Local draft for the number inputs (per-PC XP, thresholds) while focused, so
  // clearing the field to retype isn't parsed to 0 and persisted mid-edit.
  // Committed on blur/Enter; a blank field keeps the previous value. Only one
  // input is focused at a time, so a single {key, value} draft suffices.
  const [numDraft, setNumDraft] = useState<{ key: string; value: string } | null>(null);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // PCs unticked from split awards (absent players). Not persisted - resets to "everyone" per session.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // The pending-level-up signature the GM has dismissed. The banner reappears if the set changes.
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);

  function snapshot(label: string): XpAward {
    return { id: crypto.randomUUID(), label, at: Date.now(), prevPartyXp: partyXp, prevPerPc: perPc };
  }

  function setMode(next: XpTrackerState["mode"]) {
    onChange({ ...state, mode: next });
  }

  function handleAwardParty() {
    const n = parseInt(awardAmount, 10);
    if (isNaN(n) || n === 0) return;
    const nextXp = Math.max(0, partyXp + n);
    const entry = snapshot(`${n > 0 ? "+" : ""}${n.toLocaleString()} XP`);
    onChange({ ...state, partyXp: nextXp, history: [entry, ...history].slice(0, XP_HISTORY_CAP) });
    setAwardAmount("");
  }

  // "split" divides the entered amount across the ticked PCs (enter the encounter total);
  // "each" gives the entered amount to every ticked PC as-is (enter the per-head share).
  function handlePerPcAward(kind: "split" | "each") {
    const n = parseInt(awardAmount, 10);
    const recipients = members.filter((m) => !excluded.has(m.id));
    if (isNaN(n) || n === 0 || recipients.length === 0) return;
    const recipientIds = recipients.map((m) => m.id);
    const pcs = `${recipients.length} PC${recipients.length !== 1 ? "s" : ""}`;
    if (kind === "split") {
      // Same split-across-recipients operation as an encounter reward, so it shares that logic.
      const share = splitXp(Math.abs(n), recipients.length) * Math.sign(n);
      if (share === 0) return;
      const label = `${n > 0 ? "+" : ""}${n.toLocaleString()} XP → ${pcs} (${share > 0 ? "+" : ""}${share.toLocaleString()} each)`;
      onChange(applyEncounterAward(state, { total: n, recipientIds, label, id: crypto.randomUUID(), at: Date.now() }));
    } else {
      const next = { ...perPc };
      for (const id of recipientIds) next[id] = Math.max(0, (next[id] ?? 0) + n);
      const label = `${n > 0 ? "+" : ""}${n.toLocaleString()} XP each → ${pcs}`;
      onChange({ ...state, perPc: next, history: [snapshot(label), ...history].slice(0, XP_HISTORY_CAP) });
    }
    setAwardAmount("");
  }

  function undoTo(idx: number) {
    const entry = history[idx];
    if (!entry) return;
    onChange({ ...state, partyXp: entry.prevPartyXp, perPc: entry.prevPerPc, history: history.slice(idx + 1) });
  }

  function toggleExcluded(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function setPcXp(id: string, xp: number) {
    onChange({ ...state, perPc: { ...perPc, [id]: Math.max(0, xp) } });
  }

  function setThreshold(idx: number, value: number) {
    const next = [...effectiveThresholds];
    next[idx] = Math.max(0, value);
    onChange({ ...state, thresholds: next });
  }

  // Value shown by a number input: the live draft while it is focused,
  // otherwise the committed state value.
  function numDraftValue(key: string, actual: number): string {
    return numDraft && numDraft.key === key ? numDraft.value : String(actual);
  }

  function commitNumDraft() {
    if (!numDraft) return;
    const { key, value } = numDraft;
    setNumDraft(null);
    const raw = value.trim();
    if (raw === "") return; // left blank -> keep previous value
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return; // invalid -> keep previous value
    if (key.startsWith("pc:")) setPcXp(key.slice(3), n);
    else if (key.startsWith("th:")) setThreshold(Number(key.slice(3)), n);
  }

  function addThresholdLevel() {
    const last = effectiveThresholds[effectiveThresholds.length - 1] ?? 0;
    onChange({ ...state, thresholds: [...effectiveThresholds, last + 20000] });
  }

  function removeThresholdLevel() {
    if (effectiveThresholds.length === 0) return;
    onChange({ ...state, thresholds: effectiveThresholds.slice(0, -1) });
  }

  function resetThresholds() {
    onChange({ ...state, thresholds: undefined });
  }

  const recipientCount = members.filter((m) => !excluded.has(m.id)).length;
  const partyProg = levelProgress(partyXp, effectiveThresholds);

  // The sheet level lags its XP whenever an award crossed a threshold - including awards made from
  // the end-combat review, which never pass through this widget's handlers. Derived from state (not
  // an award event) so it survives a reload and works no matter who awarded. Level-ups only; never
  // offer to demote a PC whose GM lowered their XP.
  const pendingLevelUps = members.flatMap((m) => {
    const xp = mode === "party" ? partyXp : (perPc[m.id] ?? 0);
    const derived = levelForXp(xp, effectiveThresholds);
    return derived !== null && derived > m.level ? [{ id: m.id, name: m.name, from: m.level, to: derived }] : [];
  });
  const pendingSig = pendingLevelUps.map((p) => `${p.id}:${p.to}`).join(",");
  const showLevelBanner = pendingLevelUps.length > 0 && pendingSig !== dismissedSig;

  function applyLevelUps() {
    patchMembers(pendingLevelUps.map((p) => ({ id: p.id, level: p.to })));
  }

  return (
    <div className={styles.root}>
      <div className={styles.modeTabs}>
        <button className={`${styles.modeTab} ${mode === "party" ? styles.modeTabActive : ""}`} onClick={() => setMode("party")}>Party</button>
        <button className={`${styles.modeTab} ${mode === "perPc" ? styles.modeTabActive : ""}`} onClick={() => setMode("perPc")}>Per PC</button>
      </div>

      {showLevelBanner && (
        <div className={styles.levelBanner}>
          <span className={styles.levelBannerText}>
            ▲ Sheet levels behind XP: {pendingLevelUps.map((p) => `${p.name} (${p.from} → ${p.to})`).join(", ")}
          </span>
          <div className={styles.levelBannerActions}>
            <button className={styles.levelBannerApply} onClick={applyLevelUps}>Apply to Party Tracker</button>
            <button className={styles.levelBannerDismiss} onClick={() => setDismissedSig(pendingSig)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className={styles.body}>
        {mode === "party" ? (
          <div className={styles.partyView}>
            <div className={styles.bigXp}>{partyXp.toLocaleString()} XP</div>
            <div className={styles.levelBadge}>{levelLabel(partyProg.level)}</div>
            {partyProg.level !== null && (
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${Math.round(partyProg.fraction * 100)}%` }} />
                </div>
                <div className={styles.progressLabel}>
                  {partyProg.next !== null
                    ? `${(partyProg.next - partyXp).toLocaleString()} XP to Lv ${partyProg.level + 1}`
                    : "Max level"}
                </div>
              </div>
            )}
            <div className={styles.awardRow}>
              <input
                className={styles.awardInput}
                type="number"
                placeholder="Amount (+/-)"
                value={awardAmount}
                onChange={(e) => setAwardAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAwardParty(); }}
              />
              <button className={styles.awardBtn} onClick={handleAwardParty} disabled={!awardAmount.trim()}>Award</button>
            </div>
            <div className={styles.modeHint}>
              Shared total per character - the whole party levels together
            </div>
          </div>
        ) : (
          <div className={styles.perPcView}>
            <div className={styles.awardRow}>
              <input
                className={styles.awardInput}
                type="number"
                placeholder="Amount (+/-)"
                value={awardAmount}
                onChange={(e) => setAwardAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handlePerPcAward("split"); }}
                disabled={members.length === 0}
              />
              <button
                className={styles.awardBtn}
                onClick={() => handlePerPcAward("split")}
                disabled={!awardAmount.trim() || recipientCount === 0}
                title={recipientCount > 0 ? `Divide the amount evenly across the ${recipientCount} ticked PC${recipientCount !== 1 ? "s" : ""}, rounded down - enter the encounter total` : "Tick at least one PC to award XP"}
              >
                Split ({recipientCount})
              </button>
              <button
                className={styles.awardBtn}
                onClick={() => handlePerPcAward("each")}
                disabled={!awardAmount.trim() || recipientCount === 0}
                title={recipientCount > 0 ? `Give the full amount to each ticked PC - enter the per-character share` : "Tick at least one PC to award XP"}
              >
                Each
              </button>
            </div>

            {members.length === 0 ? (
              <div className={styles.emptyHint}>No party members yet - add some in Party Tracker.</div>
            ) : (
              <div className={styles.pcList}>
                {members.map((m) => {
                  const xp = perPc[m.id] ?? 0;
                  const prog = levelProgress(xp, effectiveThresholds);
                  return (
                    <div key={m.id} className={styles.pcRow}>
                      <input
                        type="checkbox"
                        className={styles.pcCheck}
                        checked={!excluded.has(m.id)}
                        onChange={() => toggleExcluded(m.id)}
                        title="Include in split awards"
                      />
                      <div className={styles.pcMain}>
                        <span className={styles.pcName}>{m.name}</span>
                        {prog.level !== null && (
                          <div className={styles.pcBar} title={prog.next !== null ? `${(prog.next - xp).toLocaleString()} XP to Lv ${prog.level + 1}` : "Max level"}>
                            <div className={styles.pcBarFill} style={{ width: `${Math.round(prog.fraction * 100)}%` }} />
                          </div>
                        )}
                      </div>
                      <input
                        className={styles.pcXpInput}
                        type="number"
                        min={0}
                        value={numDraftValue(`pc:${m.id}`, xp)}
                        onFocus={() => setNumDraft({ key: `pc:${m.id}`, value: String(xp) })}
                        onChange={(e) => setNumDraft({ key: `pc:${m.id}`, value: e.target.value })}
                        onBlur={commitNumDraft}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                      <span className={styles.pcLevel}>{levelLabel(prog.level)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History (collapsible) */}
      <div className={styles.sectionHeader} onClick={() => setHistoryOpen((o) => !o)}>
        <span className={styles.sectionToggle}>{historyOpen ? "▾" : "▸"} History</span>
        {history.length > 0 && <span className={styles.sectionCount}>{history.length}</span>}
      </div>
      {historyOpen && (
        <div className={styles.sectionList}>
          {history.length === 0 && <div className={styles.emptyHint}>No awards yet</div>}
          {history.map((entry, i) => (
            <div key={entry.id} className={styles.historyItem}>
              <span
                className={styles.historyLabel}
                title={entry.at ? new Date(entry.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", hour12: false }) : undefined}
              >
                {entry.label}
              </span>
              <button className={styles.undoBtn} onClick={() => undoTo(i)} title="Undo to before this award">↩</button>
            </div>
          ))}
        </div>
      )}

      {/* Level thresholds (collapsible) */}
      <div className={styles.sectionHeader} onClick={() => setThresholdsOpen((o) => !o)}>
        <span className={styles.sectionToggle}>{thresholdsOpen ? "▾" : "▸"} Level thresholds</span>
        {!thresholds && <span className={styles.sectionCount}>5e defaults</span>}
      </div>
      {thresholdsOpen && (
        <div className={styles.sectionList}>
          {effectiveThresholds.length === 0 && (
            <div className={styles.emptyHint}>No thresholds set - levels won't be shown.</div>
          )}
          {effectiveThresholds.map((t, i) => (
            <div key={i} className={styles.thresholdRow}>
              <span className={styles.thresholdLevel}>Lv {i + 1}</span>
              <input
                className={styles.thresholdInput}
                type="number"
                min={0}
                value={numDraftValue(`th:${i}`, t)}
                onFocus={() => setNumDraft({ key: `th:${i}`, value: String(t) })}
                onChange={(e) => setNumDraft({ key: `th:${i}`, value: e.target.value })}
                onBlur={commitNumDraft}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          ))}
          <div className={styles.thresholdsActions}>
            <button className={styles.thresholdsBtn} onClick={addThresholdLevel}>+ Level</button>
            <button className={styles.thresholdsBtn} onClick={removeThresholdLevel} disabled={effectiveThresholds.length === 0}>- Level</button>
            <button className={styles.thresholdsBtn} onClick={resetThresholds} disabled={!thresholds}>Reset to defaults</button>
          </div>
        </div>
      )}
    </div>
  );
}
