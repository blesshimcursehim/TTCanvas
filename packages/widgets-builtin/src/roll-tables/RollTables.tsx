// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useRef, useState } from "react";
import { useVault } from "@ttcanvas/core";
import type { RollTable, RollTableEntry, RollHistoryItem, RollTablesState } from "./types";
import { entryRanges, totalWeight, padValue, formatRange, parseCount, rollTableMultiple } from "./engine";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { ModeToggle } from "../shared/ModeToggle";
import { RouteResultButton } from "../shared/RouteResultButton";
import { dedupe, hashContent, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { CollectionIO } from "../shared/CollectionIO";
import { WidgetSettingsCog } from "../shared/WidgetSettingsCog";
import styles from "./RollTables.module.css";

interface Props {
  state: RollTablesState;
  onChange: (state: RollTablesState) => void;
}

const DIE_PRESETS = [4, 6, 8, 10, 12, 20, 100];
const HISTORY_CAP = 50;

function tableContentKey(t: RollTable): string {
  const { id: _id, ...rest } = t;
  return hashContent(rest);
}

function newEntry(): RollTableEntry {
  return { id: crypto.randomUUID(), text: "", weight: 1 };
}

function validateRollTablesBundle(parsed: unknown): RollTable[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (bundle.type !== "ttcanvas-roll-tables" || !Array.isArray(bundle.tables)) return null;
  return bundle.tables.flatMap((t: unknown): RollTable[] => {
    if (!t || typeof t !== "object") return [];
    const tbl = t as Record<string, unknown>;
    if (typeof tbl.id !== "string" || typeof tbl.name !== "string" || !tbl.name.trim()) return [];
    const die = typeof tbl.die === "number" && tbl.die >= 2 ? Math.floor(tbl.die) : 20;
    const rawEntries = Array.isArray(tbl.entries) ? tbl.entries : [];
    const entries = rawEntries.flatMap((e: unknown): RollTableEntry[] => {
      if (!e || typeof e !== "object") return [];
      const ent = e as Record<string, unknown>;
      if (typeof ent.id !== "string") return [];
      const weight = typeof ent.weight === "number" && ent.weight >= 1 ? Math.floor(ent.weight) : 1;
      return [{
        id: ent.id,
        text: typeof ent.text === "string" ? ent.text : "",
        weight,
        note: typeof ent.note === "string" && ent.note ? ent.note : undefined,
        subtableId: typeof ent.subtableId === "string" ? ent.subtableId : undefined,
      }];
    });
    return [{
      id: tbl.id,
      name: tbl.name,
      description: typeof tbl.description === "string" && tbl.description ? tbl.description : undefined,
      die,
      count: typeof tbl.count === "string" ? tbl.count : undefined,
      entries,
    }];
  });
}

export function RollTables({ state, onChange }: Props) {
  const vault = useVault();
  const { tables, selectedId, mode, history } = state;

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDie, setAddDie] = useState(20);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<RollTable> | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [linkPickerId, setLinkPickerId] = useState<string | null>(null);
  const [confirmDeleteTable, setConfirmDeleteTable] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  // Focus targets for the row-by-row entry editor: text inputs keyed by entry id.
  const rowRefs = useRef(new Map<string, HTMLInputElement>());

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  // ── Table CRUD ────────────────────────────────────────────
  function patchTables(next: RollTable[]) {
    onChange({ ...state, tables: next });
  }

  function updateTable(id: string, patch: Partial<RollTable>) {
    patchTables(tables.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function selectTable(id: string) {
    onChange({ ...state, selectedId: id });
    setAdding(false);
    setRenaming(false);
    setEditing(false);
    setExpandedEntryId(null);
    setLinkPickerId(null);
    setConfirmDeleteTable(false);
  }

  function handleAddTable() {
    const name = addName.trim();
    if (!name) return;
    const table: RollTable = { id: crypto.randomUUID(), name, die: addDie, entries: [] };
    onChange({ ...state, tables: [...tables, table], selectedId: table.id, mode: "browse" });
    setAdding(false);
    setEditing(true); // a fresh table opens straight into editing so entries can be typed
    setAddName("");
    setAddDie(20);
  }

  function handleDeleteTable() {
    if (!selected) return;
    const remaining = tables.filter((t) => t.id !== selected.id);
    onChange({ ...state, tables: remaining, selectedId: remaining[0]?.id ?? null });
    setRenaming(false);
    setConfirmDeleteTable(false);
  }

  function commitRename() {
    if (selected && renameDraft.trim()) updateTable(selected.id, { name: renameDraft.trim() });
    setRenaming(false);
  }

  function setMode(m: "roll" | "browse") {
    if (m === "roll") setEditing(false);
    onChange({ ...state, mode: m });
  }

  // ── Entry editing (Browse mode) ───────────────────────────
  function addEntryRow() {
    if (!selected) return;
    // A new entry adds at least one value; never let the table exceed its die.
    if (totalWeight(selected.entries) >= selected.die) return;
    const entry = newEntry();
    updateTable(selected.id, { entries: [...selected.entries, entry] });
    // Focus the fresh row on the next frame, once it has rendered.
    requestAnimationFrame(() => rowRefs.current.get(entry.id)?.focus());
  }

  function updateEntry(entryId: string, patch: Partial<RollTableEntry>) {
    if (!selected) return;
    updateTable(selected.id, {
      entries: selected.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
    });
  }

  // Clamps a weight so the whole table can never roll past its die: the most this entry may
  // cover is the die minus what every other entry already uses.
  function setEntryWeight(entryId: string, raw: number) {
    if (!selected) return;
    const others = selected.entries.filter((e) => e.id !== entryId).reduce((s, e) => s + Math.max(1, Math.floor(e.weight) || 1), 0);
    const max = Math.max(1, selected.die - others);
    const weight = Math.min(max, Math.max(1, Math.floor(raw) || 1));
    updateEntry(entryId, { weight });
  }

  function deleteEntry(entryId: string) {
    if (!selected) return;
    updateTable(selected.id, { entries: selected.entries.filter((e) => e.id !== entryId) });
  }

  function moveEntry(index: number, dir: -1 | 1) {
    if (!selected) return;
    const target = index + dir;
    if (target < 0 || target >= selected.entries.length) return;
    const next = [...selected.entries];
    [next[index], next[target]] = [next[target], next[index]];
    updateTable(selected.id, { entries: next });
  }

  // Enter in a row's text field commits and steps to the next row, appending one at the end -
  // "add and tab your way through it".
  function onRowKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "Enter" || !selected) return;
    e.preventDefault();
    if (index === selected.entries.length - 1) {
      addEntryRow();
    } else {
      rowRefs.current.get(selected.entries[index + 1].id)?.focus();
    }
  }

  // ── Rolling ───────────────────────────────────────────────
  // A table's `count` (e.g. "2d6") can produce several results per click; every result from one
  // click shares the same `at` so the roll view can group "this pull" apart from older history.
  function handleRoll() {
    if (!selected) return;
    const results = rollTableMultiple(selected, tables);
    if (results.length === 0) return;
    const at = Date.now();
    const items: RollHistoryItem[] = results.map((r) => ({
      id: crypto.randomUUID(),
      tableId: selected.id,
      tableName: selected.name,
      roll: r.steps[0]?.roll ?? 0,
      text: r.text || "(empty entry)",
      note: r.note,
      chain: r.steps.length > 1 ? r.steps.map((s) => s.tableName).join(" → ") : undefined,
      at,
    }));
    onChange({ ...state, history: [...items, ...history].slice(0, HISTORY_CAP) });
  }

  function clearHistory() {
    onChange({ ...state, history: [] });
  }

  // ── Import / export ───────────────────────────────────────
  async function handleExportOne(t: RollTable) {
    const bundle = buildBundle("ttcanvas-roll-tables", { tables: [t] });
    await exportCollection(vault.saveTextFile, bundle, `${t.name.replace(/[^a-z0-9]/gi, "_")}.roll-tables.json`);
  }

  async function handleExportAll() {
    const bundle = buildBundle("ttcanvas-roll-tables", { tables });
    await exportCollection(vault.saveTextFile, bundle, "roll-tables.roll-tables.json");
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("Failed to read import file.");
      return;
    }
    const incoming = readBundle(text, "ttcanvas-roll-tables", validateRollTablesBundle);
    if (!incoming) {
      setImportError("Not a valid Roll Tables file.");
      return;
    }
    const result = dedupe(incoming, tables, { idOf: (t) => t.id, contentKeyOf: tableContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport(result);
    } else {
      applyImport(result, "skip");
    }
  }

  function applyImport(result: DedupeResult<RollTable>, conflictMode: "skip" | "replace") {
    setPendingImport(null);
    let nextTables = tables;
    if (conflictMode === "replace") {
      const byId = new Map(result.idConflicts.map((t) => [t.id, t]));
      nextTables = nextTables.map((t) => byId.get(t.id) ?? t);
    }
    onChange({ ...state, tables: [...nextTables, ...result.clean] });
  }

  // ── Render ────────────────────────────────────────────────
  const ranges = selected ? entryRanges(selected.entries) : [];
  const total = selected ? totalWeight(selected.entries) : 0;
  // Every result from one Roll click shares an `at`, so group them apart from older history.
  const latestAt = history[0]?.at;
  const latestResults =
    selected && latestAt != null
      ? history.filter((h) => h.at === latestAt && h.tableId === selected.id)
      : [];
  const linkTargets = selected ? tables.filter((t) => t.id !== selected.id) : [];
  const countInvalid = !!selected?.count?.trim() && parseCount(selected.count, () => 0) === null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? tables.filter((t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q))
    : tables;

  return (
    <div className={styles.root}>
      {/* ── Left: table list ─────────────────────── */}
      <div className={styles.left}>
        <div className={styles.searchRow}>
          <input
            className={styles.search}
            placeholder="Search tables…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={styles.addIconBtn} onClick={() => { setAdding(true); setAddName(""); setAddDie(20); }} title="New table">+</button>
        </div>

        <div className={styles.listScroll}>
          {tables.length === 0 && (
            <div className={styles.emptyList}>No tables yet. Hit + to add one.</div>
          )}
          {tables.length > 0 && filtered.length === 0 && (
            <div className={styles.emptyList}>No matches.</div>
          )}
          {filtered.map((t) => (
            <div
              key={t.id}
              className={`${styles.listRow} ${t.id === selectedId ? styles.listRowActive : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => selectTable(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectTable(t.id); }}
            >
              <span className={styles.listTitle}>{t.name}</span>
              <span className={styles.dieBadge}>d{t.die}</span>
            </div>
          ))}
        </div>

        <div className={styles.listFooter}>
          <span>{tables.length} table{tables.length !== 1 ? "s" : ""}</span>
        </div>
        <WidgetSettingsCog>
          <CollectionIO onImportFile={handleImportFile} onExportAll={handleExportAll} exportDisabled={tables.length === 0} />
          {importError && (
            <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>
          )}
        </WidgetSettingsCog>
      </div>

      {/* ── Right: detail / add pane ─────────────── */}
      <div className={styles.right}>
        {adding ? (
          <div className={styles.addForm}>
            <div className={styles.addFormTitle}>New Table</div>
            <label className={styles.addLabel}>Name
              <input
                className={styles.addInput}
                value={addName}
                autoFocus
                placeholder="e.g. Wilderness weather"
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddTable(); }}
              />
            </label>
            <div className={styles.addLabel}>Die
              <div className={styles.dieRow}>
                {DIE_PRESETS.map((d) => (
                  <button
                    key={d}
                    className={`${styles.dieBtn} ${addDie === d ? styles.dieBtnActive : ""}`}
                    onClick={() => setAddDie(d)}
                  >d{d}</button>
                ))}
                <input
                  className={styles.dieCustom}
                  type="number"
                  min={2}
                  value={addDie}
                  title="Custom die size"
                  onChange={(e) => setAddDie(Math.max(2, Math.floor(Number(e.target.value) || 2)))}
                />
              </div>
            </div>
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAddTable} disabled={!addName.trim()}>Create</button>
            </div>
          </div>
        ) : selected ? (
          <div className={styles.detail}>
            {/* Header: name + mode toggle + actions */}
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
                <span className={styles.detailSub}>d{selected.die} · {selected.entries.length} entr{selected.entries.length !== 1 ? "ies" : "y"}</span>
              </div>
              <div className={styles.detailActions}>
                {!confirmDeleteTable && (
                  <>
                    <ModeToggle
                      value={mode}
                      onChange={setMode}
                      options={[{ value: "roll", label: "Roll" }, { value: "browse", label: "Browse" }]}
                    />
                    {mode === "browse" && (
                      <button
                        className={`${styles.editBtn} ${editing ? styles.editBtnActive : ""}`}
                        onClick={() => { setEditing((v) => !v); setExpandedEntryId(null); setLinkPickerId(null); }}
                      >{editing ? "Done" : "Edit"}</button>
                    )}
                    <button className={styles.iconBtn} onClick={() => handleExportOne(selected)} title="Export this table">↓</button>
                  </>
                )}
                <ConfirmDeleteButton
                  confirming={confirmDeleteTable}
                  trigger="🗑"
                  triggerLabel="Delete table"
                  confirmQuestion={`Delete "${selected.name}"?`}
                  confirmLabel="Yes, delete"
                  className={styles.iconBtn}
                  onRequestConfirm={() => setConfirmDeleteTable(true)}
                  onConfirm={handleDeleteTable}
                  onCancel={() => setConfirmDeleteTable(false)}
                />
              </div>
            </div>

            {mode === "roll" ? (
              <div className={styles.rollView}>
                {selected.description?.trim() && (
                  <p className={styles.tableDescRead}>{selected.description}</p>
                )}
                <button className={styles.rollBtn} onClick={handleRoll} disabled={total === 0}>
                  Roll d{selected.die}{selected.count?.trim() ? ` × ${selected.count}` : ""}
                </button>
                {total === 0 && <p className={styles.emptyHint}>Add entries in Browse mode first.</p>}
                {latestResults.length > 0 && (
                  <div className={styles.rollResultGroup}>
                    {latestResults.map((r) => (
                      <div key={r.id} className={styles.rollResult}>
                        <span className={styles.rollResultNum}>{padValue(r.roll, selected.die)}</span>
                        <div className={styles.rollResultBody}>
                          <span className={styles.rollResultText}>{r.text}</span>
                          {r.chain && <span className={styles.rollResultChain}>via {r.chain}</span>}
                          {r.note && <span className={styles.rollResultNote}>{r.note}</span>}
                        </div>
                        <RouteResultButton title={r.tableName} body={r.text} />
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.historyHead}>
                  <span>History</span>
                  {history.length > 0 && <button className={styles.clearBtn} onClick={clearHistory}>Clear</button>}
                </div>
                <div className={styles.historyList}>
                  {history.length === 0 && <div className={styles.emptyHint}>No rolls yet.</div>}
                  {history.map((h) => (
                    <div key={h.id} className={styles.historyRow}>
                      <span className={styles.historyNum}>{h.roll}</span>
                      <span className={styles.historyText}>{h.text}{h.chain ? ` (via ${h.chain})` : ""}</span>
                      <span className={styles.historyTable}>{h.tableName}</span>
                      <RouteResultButton title={h.tableName} body={h.text} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.browseView}>
                {editing ? (
                  <>
                    <textarea
                      className={styles.tableDesc}
                      value={selected.description ?? ""}
                      rows={2}
                      placeholder="Describe this table or how to use it (optional)…"
                      onChange={(e) => updateTable(selected.id, { description: e.target.value || undefined })}
                    />
                    <div className={styles.browseMeta}>
                      <label className={styles.countField} title="How many results one Roll produces, e.g. 2d6 (optional)">
                        Count
                        <input
                          className={`${styles.countInput} ${countInvalid ? styles.countInputInvalid : ""}`}
                          value={selected.count ?? ""}
                          placeholder="1"
                          onChange={(e) => updateTable(selected.id, { count: e.target.value || undefined })}
                        />
                      </label>
                      <span className={styles.fillHint}>
                        {total >= selected.die ? `Full · d${selected.die}` : `${total} / ${selected.die} values`}
                      </span>
                    </div>
                    {countInvalid && <span className={styles.countError}>Invalid count - try "3" or "2d6"</span>}
                    <div className={styles.entryList}>
                      {selected.entries.length === 0 && <div className={styles.emptyHint}>No entries. Add one below.</div>}
                      {selected.entries.map((entry, i) => {
                        const expanded = expandedEntryId === entry.id;
                        const hasNote = !!entry.note?.trim();
                        const linked = entry.subtableId;
                        return (
                          <div key={entry.id} className={styles.entryItem}>
                            <div className={styles.entryRow}>
                              <span className={styles.entryRange}>{formatRange(ranges[i], selected.die)}</span>
                              {linked ? (
                                <span className={styles.entryLinkText} title="Rolls another table">
                                  → {tables.find((t) => t.id === entry.subtableId)?.name ?? "missing table"}
                                </span>
                              ) : (
                                <input
                                  ref={(el) => { if (el) rowRefs.current.set(entry.id, el); else rowRefs.current.delete(entry.id); }}
                                  className={styles.entryText}
                                  value={entry.text}
                                  placeholder="Result…"
                                  onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
                                  onKeyDown={(e) => onRowKeyDown(e, i)}
                                />
                              )}
                              <input
                                className={styles.entryWeight}
                                type="number"
                                min={1}
                                value={entry.weight}
                                title="Span - how many die values this entry covers"
                                onChange={(e) => setEntryWeight(entry.id, Number(e.target.value))}
                              />
                              <div className={styles.entryBtns}>
                                <button
                                  className={`${styles.rowBtn} ${linked ? styles.rowBtnActive : ""}`}
                                  onClick={() => setLinkPickerId(linkPickerId === entry.id ? null : entry.id)}
                                  title={linked ? "Change linked table" : "Roll another table instead"}
                                >🔗</button>
                                <button
                                  className={`${styles.rowBtn} ${hasNote || expanded ? styles.rowBtnActive : ""}`}
                                  onClick={() => setExpandedEntryId(expanded ? null : entry.id)}
                                  title={hasNote ? "Edit note" : "Add note"}
                                >≡</button>
                                <button className={styles.rowBtn} onClick={() => moveEntry(i, -1)} disabled={i === 0} title="Move up">↑</button>
                                <button className={styles.rowBtn} onClick={() => moveEntry(i, 1)} disabled={i === selected.entries.length - 1} title="Move down">↓</button>
                                <button className={styles.rowBtn} onClick={() => deleteEntry(entry.id)} title="Delete">×</button>
                              </div>
                            </div>
                            {linkPickerId === entry.id && (
                              <select
                                className={styles.entryLinkSelect}
                                value={entry.subtableId ?? ""}
                                autoFocus
                                onChange={(e) => { updateEntry(entry.id, { subtableId: e.target.value || undefined }); setLinkPickerId(null); }}
                              >
                                <option value="">— plain text (no link) —</option>
                                {linkTargets.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            )}
                            {expanded && (
                              <textarea
                                className={styles.entryNote}
                                value={entry.note ?? ""}
                                autoFocus
                                rows={2}
                                placeholder="Notes / description (e.g. roll twice, location detail)…"
                                onChange={(e) => updateEntry(entry.id, { note: e.target.value || undefined })}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button className={styles.addRowBtn} onClick={addEntryRow} disabled={total >= selected.die}>
                      {total >= selected.die ? `Table full (d${selected.die})` : "+ Add entry"}
                    </button>
                  </>
                ) : (
                  <>
                    {selected.description?.trim() && (
                      <p className={styles.tableDescRead}>{selected.description}</p>
                    )}
                    <div className={styles.readList}>
                      {selected.entries.length === 0 ? (
                        <div className={styles.emptyHint}>No entries yet. Hit Edit to build this table.</div>
                      ) : (
                        selected.entries.map((entry, i) => (
                          <div key={entry.id} className={styles.readRow}>
                            <span className={styles.entryRange}>{formatRange(ranges[i], selected.die)}</span>
                            <div className={styles.readBody}>
                              <span className={styles.readText}>
                                {entry.subtableId
                                  ? `→ ${tables.find((t) => t.id === entry.subtableId)?.name ?? "missing table"}`
                                  : entry.text || "—"}
                              </span>
                              {entry.note?.trim() && <span className={styles.readNote}>{entry.note}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptyDetail}>Select a table, or hit + to create one.</div>
        )}
      </div>

      {/* Hidden file input for import */}

      {/* Import conflict dialog */}
      {pendingImport && (
        <ImportConflictDialog
          title="Import Roll Tables"
          noun="table"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((t) => ({ id: t.id, label: t.name }))}
          contentDuplicates={pendingImport.contentDuplicates.map((t) => ({ id: t.id, label: t.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}
    </div>
  );
}
