// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useRef, useEffect } from "react";
import { useCalendar, useChronicle, useVault, useAI, ollamaGenerate, openaiGenerate } from "@ttcanvas/core";
import type { SessionRecorderState, SessionEntry } from "./types";
import { formatCalDate, formatTime } from "../calendar/utils";
import { RouteResultButton } from "../shared/RouteResultButton";
import styles from "./SessionRecorder.module.css";

interface Props {
  state: SessionRecorderState;
  onChange: (s: SessionRecorderState) => void;
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function wallTimeLabel(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SessionRecorder({ state, onChange }: Props) {
  const { entries } = state;
  const calCtx = useCalendar();
  const { addChronicleEntry } = useChronicle();
  const vault = useVault();
  const { config: aiConfig } = useAI();

  const [input, setInput] = useState("");
  const [exportFlash, setExportFlash] = useState(false);
  const [summarising, setSummarising] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryFlash, setSummaryFlash] = useState(false);
  const [addedToChronicle, setAddedToChronicle] = useState(false);
  const [recapping, setRecapping] = useState(false);
  const [recapText, setRecapText] = useState("");
  const [recapVisible, setRecapVisible] = useState(false);
  const [recapError, setRecapError] = useState("");
  const [recapFlash, setRecapFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const summaryBuf = useRef("");
  const recapBuf = useRef("");
  const cancelGenRef = useRef<(() => void) | null>(null);
  const cancelRecapGenRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { cancelGenRef.current?.(); cancelRecapGenRef.current?.(); }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  function currentInGameTime(): string | undefined {
    const { def, currentDate, currentHour, currentMinute } = calCtx;
    if (!def || !currentDate) return undefined;
    return `${formatCalDate(currentDate, def)} ${formatTime(currentHour, currentMinute)}`;
  }

  function handleLog() {
    const text = input.trim();
    if (!text) return;
    const entry: SessionEntry = {
      id: uid(),
      text,
      inGameTime: currentInGameTime(),
      wallTime: Date.now(),
    };
    onChange({ ...state, entries: [...entries, entry] });
    setInput("");
    inputRef.current?.focus();
  }

  async function handleExport() {
    if (entries.length === 0) return;
    const today = todayIso();
    const inGameDate = currentInGameTime();

    const frontmatter = [
      "---",
      `date: ${today}`,
      inGameDate ? `in_game_date: "${inGameDate}"` : null,
      "---",
      "",
    ].filter((l) => l !== null).join("\n");

    const body = entries
      .map((e) => `- ${wallTimeLabel(e.wallTime)} - ${e.text}`)
      .join("\n");

    const content = frontmatter + body + "\n";
    const defaultName = `${today}-session.md`;

    const saved = await vault.saveTextFile(content, defaultName);
    if (saved) {
      setExportFlash(true);
      setTimeout(() => setExportFlash(false), 1800);
    }
  }

  function handleClear() {
    if (entries.length === 0) return;
    if (!confirm("Clear all session log entries? This cannot be undone.")) return;
    onChange({ ...state, entries: [] });
  }

  async function handleSummarise() {
    if (summarising || entries.length === 0 || !aiConfig.model) return;
    setSummarising(true);
    setSummaryText("");
    setSummaryError("");
    setSummaryVisible(true);
    setAddedToChronicle(false); // a fresh summary can be added again
    summaryBuf.current = "";

    const logLines = entries
      .map((e) => {
        const prefix = e.inGameTime ? `[${e.inGameTime}] ` : "";
        return `${prefix}${wallTimeLabel(e.wallTime)} - ${e.text}`;
      })
      .join("\n");

    const prompt =
      "Summarise the following TTRPG session log as a clean narrative. " +
      "Write 2-4 short paragraphs, past tense, third person. Do not include timestamps or bullet points - write prose only.\n\n" +
      "Session log:\n" + logLines;

    const handleChunk = (chunk: { type: string; text?: string }) => {
      if (chunk.type === "token") {
        summaryBuf.current += chunk.text ?? "";
        setSummaryText(summaryBuf.current);
      } else {
        setSummarising(false);
      }
    };

    cancelGenRef.current?.();
    try {
      const gen = aiConfig.provider === "ollama"
        ? ollamaGenerate(aiConfig.model, prompt, handleChunk)
        : openaiGenerate(aiConfig.baseUrl, aiConfig.apiKey, aiConfig.model, prompt, handleChunk);
      cancelGenRef.current = gen.cancel;
      await gen.promise;
    } catch {
      setSummaryError("AI request failed. Check your AI settings in Preferences.");
      setSummarising(false);
    } finally {
      cancelGenRef.current = null;
    }
  }

  async function handleSaveSummary() {
    if (!summaryText) return;
    const today = todayIso();
    const saved = await vault.saveTextFile(summaryText, `${today}-summary.md`);
    if (saved) {
      setSummaryFlash(true);
      setTimeout(() => setSummaryFlash(false), 1800);
    }
  }

  // Drop the summary into the Campaign Timeline's Chronicle as a dated "recap" entry. Needs an in-game
  // date to pin to (the entry model requires one), so the button is disabled without one. Editable and
  // renameable afterwards in the Campaign Timeline itself.
  function handleAddToChronicle() {
    if (!summaryText || !calCtx.currentDate) return;
    addChronicleEntry({ title: "Session recap", body: summaryText, category: "recap", date: calCtx.currentDate });
    setAddedToChronicle(true);
  }

  async function handleRecap() {
    if (recapping || entries.length === 0 || !aiConfig.model) return;
    setRecapping(true);
    setRecapText("");
    setRecapError("");
    setRecapVisible(true);
    recapBuf.current = "";

    const logLines = entries
      .map((e) => {
        const prefix = e.inGameTime ? `[${e.inGameTime}] ` : "";
        return `${prefix}${wallTimeLabel(e.wallTime)} - ${e.text}`;
      })
      .join("\n");

    const prompt =
      "Write a \"Previously on...\" recap of the following TTRPG session log, the way a TV show recaps " +
      "the last episode before the next one starts. Dramatic and evocative, 2-3 short sentences. " +
      "Players will hear this read aloud, so include only what they already know - leave out dice " +
      "mechanics, meta-game notes, and anything secret the GM has not revealed to them. Write prose only, " +
      "no bullet points.\n\n" +
      "Session log:\n" + logLines;

    const handleChunk = (chunk: { type: string; text?: string }) => {
      if (chunk.type === "token") {
        recapBuf.current += chunk.text ?? "";
        setRecapText(recapBuf.current);
      } else {
        setRecapping(false);
      }
    };

    cancelRecapGenRef.current?.();
    try {
      const gen = aiConfig.provider === "ollama"
        ? ollamaGenerate(aiConfig.model, prompt, handleChunk)
        : openaiGenerate(aiConfig.baseUrl, aiConfig.apiKey, aiConfig.model, prompt, handleChunk);
      cancelRecapGenRef.current = gen.cancel;
      await gen.promise;
    } catch {
      setRecapError("AI request failed. Check your AI settings in Preferences.");
      setRecapping(false);
    } finally {
      cancelRecapGenRef.current = null;
    }
  }

  async function handleSaveRecap() {
    if (!recapText) return;
    const today = todayIso();
    const saved = await vault.saveTextFile(recapText, `${today}-recap.md`);
    if (saved) {
      setRecapFlash(true);
      setTimeout(() => setRecapFlash(false), 1800);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <button
          className={styles.summariseBtn}
          onClick={handleSummarise}
          disabled={entries.length === 0 || !aiConfig.model || summarising}
          title={!aiConfig.model ? "Configure an AI model in Preferences to use this" : "Summarise session log with AI"}
        >
          {summarising ? "Summarising…" : "AI Summary"}
        </button>
        <button
          className={styles.summariseBtn}
          onClick={handleRecap}
          disabled={entries.length === 0 || !aiConfig.model || recapping}
          title={!aiConfig.model ? "Configure an AI model in Preferences to use this" : "Generate a player-facing recap to read aloud or cast"}
        >
          {recapping ? "Recapping…" : "Previously On…"}
        </button>
        <button
          className={`${styles.exportBtn} ${exportFlash ? styles.exportBtnSaved : ""}`}
          onClick={handleExport}
          disabled={entries.length === 0}
          title="Save session log as .md file"
        >
          {exportFlash ? "Saved ✓" : "Export .md"}
        </button>
        <button
          className={styles.clearBtn}
          onClick={handleClear}
          disabled={entries.length === 0}
          title="Clear session log"
        >
          Clear
        </button>
      </div>

      <div className={styles.list} ref={listRef}>
        {entries.length === 0 && (
          <div className={styles.empty}>
            No entries yet. Start typing below and press Enter or Log.
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={styles.entry}>
            <div className={styles.entryMain}>
              {entry.inGameTime && (
                <span className={styles.inGameTime}>{entry.inGameTime}</span>
              )}
              <span className={styles.entryText}>{entry.text}</span>
            </div>
            <div className={styles.entryWall}>{wallTimeLabel(entry.wallTime)}</div>
          </div>
        ))}
      </div>

      {summaryVisible && (
        <div className={styles.summaryPanel}>
          <div className={styles.summaryHeader}>
            <span className={styles.summaryLabel}>
              {summarising ? "AI SUMMARY - generating…" : "AI SUMMARY"}
            </span>
            <div className={styles.summaryActions}>
              {!summarising && summaryText && (
                <>
                  <button
                    className={styles.chronicleBtn}
                    onClick={handleAddToChronicle}
                    disabled={!calCtx.currentDate || addedToChronicle}
                    title={calCtx.currentDate
                      ? "Add this summary to the Campaign Timeline's Chronicle, dated to the current in-game date"
                      : "Set an in-game date on the Calendar to add this to the Chronicle"}
                  >
                    {addedToChronicle ? "Added ✓" : "Add to Chronicle"}
                  </button>
                  <button
                    className={`${styles.saveSummaryBtn} ${summaryFlash ? styles.saveSummaryBtnSaved : ""}`}
                    onClick={handleSaveSummary}
                    title="Save summary as .md file"
                  >
                    {summaryFlash ? "Saved ✓" : "Save .md"}
                  </button>
                </>
              )}
              <button
                className={styles.summaryDismiss}
                onClick={() => { setSummaryVisible(false); setSummaryText(""); setSummaryError(""); setAddedToChronicle(false); }}
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
          {summaryError ? (
            <div className={styles.summaryError}>{summaryError}</div>
          ) : (
            <div className={styles.summaryText}>
              {summaryText || (summarising ? <span className={styles.summaryPlaceholder}>Generating…</span> : null)}
            </div>
          )}
        </div>
      )}

      {recapVisible && (
        <div className={styles.recapPanel}>
          <div className={styles.recapHeader}>
            <span className={styles.recapLabel}>
              {recapping ? "PREVIOUSLY ON… - generating…" : "PREVIOUSLY ON…"}
            </span>
            <div className={styles.recapActions}>
              {!recapping && recapText && (
                <>
                  <RouteResultButton title="Previously on…" body={recapText} className={styles.castRecapBtn} />
                  <button
                    className={`${styles.saveRecapBtn} ${recapFlash ? styles.saveRecapBtnSaved : ""}`}
                    onClick={handleSaveRecap}
                    title="Save recap as .md file"
                  >
                    {recapFlash ? "Saved ✓" : "Save .md"}
                  </button>
                </>
              )}
              <button
                className={styles.recapDismiss}
                onClick={() => { setRecapVisible(false); setRecapText(""); setRecapError(""); }}
                title="Dismiss"
                aria-label="Dismiss recap"
              >
                ×
              </button>
            </div>
          </div>
          {recapError ? (
            <div className={styles.recapError}>{recapError}</div>
          ) : (
            <textarea
              className={styles.recapBody}
              value={recapText}
              onChange={(e) => setRecapText(e.target.value)}
              readOnly={recapping}
              placeholder={recapping ? "Generating…" : ""}
              aria-label="Player-facing recap, editable before casting to the player window"
            />
          )}
        </div>
      )}

      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          placeholder="Log a note…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleLog(); }}
          autoFocus
        />
        <button
          className={styles.logBtn}
          onClick={handleLog}
          disabled={!input.trim()}
        >
          Log
        </button>
      </div>
    </div>
  );
}
