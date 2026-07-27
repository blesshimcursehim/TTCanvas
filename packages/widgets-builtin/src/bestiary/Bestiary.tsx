// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useRef, useCallback, useEffect } from "react";
import { useIT, useVault, pushCharacterScene, logError } from "@ttcanvas/core";
import type { BestiaryState, BestiaryEntry, BestiaryFolder } from "./types";
import { CreatureSheetModal } from "./CreatureSheetModal";
import { setActiveTokenDrag, clearActiveTokenDrag, placeTokenAtCenter } from "../shared/tokenDrag";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { dedupe, hashContent, readBundle, buildBundle, exportCollection, type DedupeResult } from "../shared/importExport";
import { pullSingletonBundle } from "../shared/crossVaultPull";
import { CollectionIO } from "../shared/CollectionIO";
import { VaultPullControl } from "../shared/VaultPullControl";
import { WidgetSettingsCog } from "../shared/WidgetSettingsCog";
import styles from "./Bestiary.module.css";

const FOE_COLOR = "oklch(0.55 0.20 25)";

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function parseCR(cr: string): number {
  if (cr === "0") return 0;
  if (cr === "1/8") return 0.125;
  if (cr === "1/4") return 0.25;
  if (cr === "1/2") return 0.5;
  const n = parseFloat(cr);
  return isNaN(n) ? -1 : n;
}

function creatureContentKey(entry: BestiaryEntry): string {
  const { id: _id, folderId: _folderId, ...rest } = entry;
  return hashContent(rest);
}

interface ImportedBundle {
  entries: BestiaryEntry[];
  folders: BestiaryFolder[];
  skipped: number;
}

function validateCreatureBundle(parsed: unknown): ImportedBundle | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  const rawEntries = bundle.entries;
  if (!Array.isArray(rawEntries)) return null;
  const entries = rawEntries.filter((entry: unknown): entry is BestiaryEntry => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return typeof e.name === "string" && e.name.trim() !== "" && typeof e.creatureType === "string";
  });
  const folders = Array.isArray(bundle.folders) ? (bundle.folders as BestiaryFolder[]) : [];
  return { entries, folders, skipped: rawEntries.length - entries.length };
}

const CREATURE_TYPES = [
  "Aberration", "Beast", "Celestial", "Construct", "Dragon",
  "Elemental", "Fey", "Fiend", "Giant", "Humanoid",
  "Monstrosity", "Ooze", "Plant", "Undead",
];

interface Props {
  state: BestiaryState;
  onChange: (s: BestiaryState) => void;
}

export function Bestiary({ state, onChange }: Props) {
  const { entries, folders } = state;
  const itCtx = useIT();
  const vault = useVault();

  // Modal
  const [modalEntry, setModalEntry] = useState<BestiaryEntry | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Open a creature's sheet when a [[creature:...]] link requests it, then clear the one-shot id so it
  // fires once and never reopens on reload. Runs only when the request changes.
  useEffect(() => {
    if (!state.openRequestId) return;
    const entry = entries.find((e) => e.id === state.openRequestId);
    if (entry) { setModalEntry(entry); setIsNew(false); }
    onChange({ ...state, openRequestId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on the request id alone
  }, [state.openRequestId]);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [crMin, setCrMin] = useState("");
  const [crMax, setCrMax] = useState("");

  // Folder UI
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportFlashId, setExportFlashId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    result: DedupeResult<BestiaryEntry>; newFolders: BestiaryFolder[]; skipped: number;
  } | null>(null);

  // ── Export / Import ───────────────────────────────────

  const exportEntries = useCallback(async (
    entriesToExport: BestiaryEntry[],
    foldersToExport: BestiaryFolder[],
    filename: string,
    flashId: string,
  ) => {
    const payload = buildBundle("ttcanvas-bestiary", {
      entries: entriesToExport,
      folders: foldersToExport,
    });
    const saved = await exportCollection(vault.saveTextFile, payload, filename);
    if (saved) {
      setExportFlashId(flashId);
      setTimeout(() => setExportFlashId((id) => id === flashId ? null : id), 1800);
    }
  }, [vault]);

  function exportEntry(entry: BestiaryEntry) {
    exportEntries([entry], [], `${entry.name.replace(/\s+/g, "-").toLowerCase()}.creature.json`, entry.id);
  }

  function exportFolder(folder: BestiaryFolder) {
    const descIds = collectDescendants(folder.id, folders);
    descIds.add(folder.id);
    const foldersToExport = folders.filter((f) => descIds.has(f.id));
    const entriesToExport = entries.filter((e) => e.folderId && descIds.has(e.folderId));
    exportEntries(entriesToExport, foldersToExport, `${folder.name.replace(/\s+/g, "-").toLowerCase()}.creature.json`, folder.id);
  }

  function exportAll() {
    // Empty flashId: no per-row button to flash for a whole-library export.
    exportEntries(entries, folders, "bestiary.creature.json", "");
  }

  async function handleImport(file: File) {
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      logError("Bestiary: could not read the import file", err);
      setImportError("Failed to read import file.");
      return;
    }
    handleImportText(text);
  }

  // Pull this widget's content from another vault: rebuild the export bundle from the
  // source vault's singleton state and run it through the same import path as a file.
  async function handlePull(sourceVault: string): Promise<boolean> {
    setImportError(null);
    return pullSingletonBundle(
      vault.readForeignSingleton,
      sourceVault,
      "bestiary",
      "ttcanvas-bestiary",
      (foreign) => {
        const s = foreign as BestiaryState | undefined;
        if (!s?.entries?.length) return null;
        return { entries: s.entries, folders: s.folders ?? [] };
      },
      handleImportText,
    );
  }

  function handleImportText(text: string) {
    setImportError(null);
    const parsed = readBundle(text, "ttcanvas-bestiary", validateCreatureBundle);
    if (!parsed) {
      setImportError("Not a valid creature file - missing entries array or invalid JSON.");
      return;
    }
    const { entries: validEntries, folders: importedFolders, skipped } = parsed;
    if (skipped > 0 && validEntries.length === 0) {
      setImportError(`Import failed: no valid entries found (${skipped} skipped due to missing name/type).`);
      return;
    }

    const folderIdMap = new Map<string, string>();
    const newFolders: BestiaryFolder[] = [];
    for (const f of importedFolders) {
      const mappedParentId = f.parentId !== null ? (folderIdMap.get(f.parentId) ?? null) : null;
      const existing = state.folders.find(
        (sf) => sf.name === f.name && sf.parentId === mappedParentId,
      );
      if (existing) {
        folderIdMap.set(f.id, existing.id);
      } else {
        const newId = uid();
        folderIdMap.set(f.id, newId);
        newFolders.push({ ...f, id: newId, parentId: mappedParentId });
      }
    }

    const remapped: BestiaryEntry[] = validEntries.map((entry) => ({
      ...entry,
      folderId: entry.folderId ? (folderIdMap.get(entry.folderId) ?? null) : null,
    }));

    const result = dedupe(remapped, state.entries, { idOf: (en) => en.id, contentKeyOf: creatureContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport({ result, newFolders, skipped });
    } else {
      applyImport(result, newFolders, skipped, "skip");
    }
  }

  function applyImport(
    result: DedupeResult<BestiaryEntry>,
    newFolders: BestiaryFolder[],
    skipped: number,
    conflictMode: "skip" | "replace",
  ) {
    setPendingImport(null);

    let nextEntries = entries;
    if (conflictMode === "replace") {
      const byId = new Map(result.idConflicts.map((en) => [en.id, en]));
      nextEntries = nextEntries.map((existing) => {
        const incoming = byId.get(existing.id);
        return incoming ? { ...incoming, id: existing.id, folderId: existing.folderId } : existing;
      });
    }

    const added: BestiaryEntry[] = result.clean.map((entry) => {
      const conflictsInFolder = nextEntries.filter((se) => se.folderId === entry.folderId);
      let name = entry.name;
      let suffix = 2;
      while (conflictsInFolder.some((se) => se.name === name)) name = `${entry.name} (${suffix++})`;
      return { ...entry, name };
    });

    onChange({ ...state, entries: [...nextEntries, ...added], folders: [...folders, ...newFolders] });
    if (skipped > 0) setImportError(`${skipped} entr${skipped !== 1 ? "ies" : "y"} skipped (missing name or type). Click to dismiss.`);
  }

  // ── Filter logic ──────────────────────────────────────

  const filtersActive = !!(search.trim() || typeFilters.length > 0 || crMin.trim() || crMax.trim());
  const q = search.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (q && !(e.name.toLowerCase().includes(q) || e.creatureType.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)))) return false;
    if (typeFilters.length > 0 && !typeFilters.some((t) => e.creatureType.toLowerCase() === t.toLowerCase())) return false;
    if (crMin.trim() && parseCR(e.cr) < parseCR(crMin.trim())) return false;
    if (crMax.trim() && parseCR(e.cr) > parseCR(crMax.trim())) return false;
    return true;
  });

  // ── CRUD ─────────────────────────────────────────────

  function saveEntry(entry: BestiaryEntry) {
    const exists = entries.find((e) => e.id === entry.id);
    onChange({
      ...state,
      entries: exists
        ? entries.map((e) => (e.id === entry.id ? entry : e))
        : [...entries, entry],
    });
  }

  function deleteEntry(id: string) {
    onChange({ ...state, entries: entries.filter((e) => e.id !== id) });
    setModalEntry(null);
  }

  function openEntry(entry: BestiaryEntry) {
    setModalEntry(entry);
    setIsNew(false);
  }

  function castEntry(entry: BestiaryEntry) {
    const subtitle = [entry.creatureType, entry.cr ? `CR ${entry.cr}` : null].filter(Boolean).join(" · ");
    pushCharacterScene({
      kind: "creature",
      name: entry.name,
      subtitle: subtitle || undefined,
      portraitSrc: entry.portrait,
      portraitFullSrc: entry.portraitFull,
      tags: entry.tags?.length ? entry.tags : undefined,
    });
  }

  function handleAddNew() {
    const stub: BestiaryEntry = { id: uid(), name: "", creatureType: "", tags: [], cr: "", hp: 0, ac: 0, notes: "", folderId: null };
    setModalEntry(stub);
    setIsNew(true);
  }

  function handleAddToIT(entry: BestiaryEntry) {
    // No sourceId here - it's the Bestiary *template*'s id, shared by every instance of this
    // creature. Leaving it unset lets CombatantRow fall back to the combatant's own unique id, so
    // adding "Goblin" twice yields two independently map-linkable combatants instead of one shared
    // identity (which broke map-token dedup and the initiative spotlight for repeated creatures).
    itCtx.addCombatant({ name: entry.name, initiative: 0, hp: entry.hp, maxHp: entry.hp, ac: entry.ac, kind: "foe", portraitPath: entry.portrait });
  }

  // ── Folder ops ────────────────────────────────────────

  function addFolder(parentId: string | null) {
    const folder: BestiaryFolder = { id: uid(), name: "New folder", parentId };
    onChange({ ...state, folders: [...folders, folder] });
    startRename(folder.id, folder.name);
  }

  function deleteFolder(id: string) {
    const folder = folders.find((f) => f.id === id);
    const childIds = collectDescendants(id, folders);
    onChange({
      ...state,
      folders: folders.filter((f) => !childIds.has(f.id) && f.id !== id),
      entries: entries.map((e) =>
        e.folderId === id || (e.folderId && childIds.has(e.folderId))
          ? { ...e, folderId: folder?.parentId ?? null }
          : e,
      ),
    });
  }

  function commitRename(id: string) {
    const name = renameVal.trim();
    if (name) onChange({ ...state, folders: folders.map((f) => (f.id === id ? { ...f, name } : f)) });
    setRenamingId(null);
  }

  function startRename(id: string, current: string) {
    setRenamingId(id);
    setRenameVal(current);
    setTimeout(() => renameRef.current?.select(), 0);
  }

  function toggleCollapse(id: string) {
    setCollapsed((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const toggleType = (t: string) => setTypeFilters((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);

  const clearFilters = () => { setTypeFilters([]); setCrMin(""); setCrMax(""); };

  // ── Render ────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="5" cy="5" r="3.5" /><line x1="8" y1="8" x2="11" y2="11" />
          </svg>
          <input
            className={styles.search}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className={styles.addBtn} onClick={handleAddNew}>+ Add</button>
      </div>

      <WidgetSettingsCog>
        <CollectionIO onImportFile={handleImport} onExportAll={exportAll} exportDisabled={entries.length === 0} onError={setImportError} />
        <VaultPullControl otherVaults={vault.otherVaults} onPull={handlePull} onError={setImportError} />
        {importError && (
          <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>
        )}
      </WidgetSettingsCog>

      {/* Type filter chips */}
      <div className={styles.typeChips}>
        {CREATURE_TYPES.map((t) => (
          <button
            key={t}
            className={`${styles.typeChip} ${typeFilters.includes(t) ? styles.typeChipActive : ""}`}
            onClick={() => toggleType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* CR filter */}
      <div className={styles.crFilter}>
        <span className={styles.crLabel}>CR</span>
        <input
          className={styles.crInput}
          placeholder="Min"
          value={crMin}
          onChange={(e) => setCrMin(e.target.value)}
          title="Minimum CR (e.g. 1/4, 1, 5)"
        />
        <span className={styles.crDash}>-</span>
        <input
          className={styles.crInput}
          placeholder="Max"
          value={crMax}
          onChange={(e) => setCrMax(e.target.value)}
          title="Maximum CR (e.g. 10, 20, 30)"
        />
        {(typeFilters.length > 0 || crMin || crMax) && (
          <button className={styles.clearBtn} onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Body */}
      <div className={styles.body}>
        {filtersActive ? (
          filtered.length === 0 ? (
            <div className={styles.emptyFilter}>No creatures match the current filters.</div>
          ) : (
            <div className={styles.flatList}>
              {[...filtered].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                <FlatRow
                  key={e.id}
                  entry={e}
                  exportFlash={exportFlashId === e.id}
                  onOpen={() => openEntry(e)}
                  onExport={() => exportEntry(e)}
                  onCast={() => castEntry(e)}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {renderFolder(null, 0)}
            <button className={styles.newFolderBtn} onClick={() => addFolder(null)}>+ New folder</button>
          </>
        )}
      </div>

      {/* Modal */}
      {modalEntry && (
        <CreatureSheetModal
          entry={modalEntry}
          isNew={isNew}
          folders={folders}
          onSave={(updated) => { saveEntry(updated); setModalEntry(updated); setIsNew(false); }}
          onDelete={() => deleteEntry(modalEntry.id)}
          onClose={() => setModalEntry(null)}
          onAddToIT={(e) => handleAddToIT(e)}
        />
      )}

      {/* Import conflict dialog */}
      {pendingImport && (
        <ImportConflictDialog
          title="Import Creatures"
          noun="creature"
          totalCount={pendingImport.result.idConflicts.length + pendingImport.result.contentDuplicates.length + pendingImport.result.clean.length}
          idConflicts={pendingImport.result.idConflicts.map((en) => ({ id: en.id, label: en.name }))}
          contentDuplicates={pendingImport.result.contentDuplicates.map((en) => ({ id: en.id, label: en.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport.result, pendingImport.newFolders, pendingImport.skipped, "skip")}
          onReplace={() => applyImport(pendingImport.result, pendingImport.newFolders, pendingImport.skipped, "replace")}
        />
      )}
    </div>
  );

  // ── Folder tree renderer ──────────────────────────────

  function renderFolder(parentId: string | null, depth: number) {
    const directFolders = folders.filter((f) => f.parentId === parentId);
    const rootEntries = parentId === null ? entries.filter((e) => e.folderId === null) : [];

    return (
      <div key={parentId ?? "root"}>
        {parentId === null && rootEntries.length > 0 && (
          <div className={styles.cardGrid}>
            {rootEntries.map((e) => (
              <BestiaryCard
                key={e.id}
                entry={e}
                exportFlash={exportFlashId === e.id}
                onSelect={() => openEntry(e)}
                onExport={() => exportEntry(e)}
                onCast={() => castEntry(e)}
              />
            ))}
          </div>
        )}

        {directFolders.map((folder) => {
          const folderEntries = entries.filter((e) => e.folderId === folder.id);
          const isCollapsed = collapsed.has(folder.id);
          const isRenaming = renamingId === folder.id;

          return (
            <div key={folder.id} className={styles.folderSection} style={{ paddingLeft: depth * 12 }}>
              <div className={styles.folderHeader}>
                <button className={styles.collapseBtn} onClick={() => toggleCollapse(folder.id)}>
                  {isCollapsed ? "▶" : "▾"}
                </button>
                {isRenaming ? (
                  <input
                    ref={renameRef}
                    className={styles.renameInput}
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => commitRename(folder.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(folder.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <span className={styles.folderName} onDoubleClick={() => startRename(folder.id, folder.name)}>
                    {folder.name}
                  </span>
                )}
                <span className={styles.folderCount}>{folderEntries.length}</span>
                <button className={styles.folderIconBtn} title="Add subfolder" onClick={() => addFolder(folder.id)}>+</button>
                <button
                  className={`${styles.folderIconBtn} ${exportFlashId === folder.id ? styles.folderIconBtnSaved : ""}`}
                  title={exportFlashId === folder.id ? "Saved ✓" : "Export folder as .creature.json"}
                  onClick={() => exportFolder(folder)}
                >
                  {exportFlashId === folder.id ? "✓" : "⬇"}
                </button>
                <button className={styles.folderIconBtn} title="Rename" onClick={() => startRename(folder.id, folder.name)}>✎</button>
                <button className={styles.folderIconBtn} title="Delete folder" onClick={() => deleteFolder(folder.id)}>×</button>
              </div>

              {!isCollapsed && (
                <div>
                  {folderEntries.length > 0 && (
                    <div className={styles.cardGrid}>
                      {folderEntries.map((e) => (
                        <BestiaryCard
                          key={e.id}
                          entry={e}
                          exportFlash={exportFlashId === e.id}
                          onSelect={() => openEntry(e)}
                          onExport={() => exportEntry(e)}
                          onCast={() => castEntry(e)}
                        />
                      ))}
                    </div>
                  )}
                  {renderFolder(folder.id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
}

// ── Helpers ───────────────────────────────────────────────

function collectDescendants(id: string, folders: BestiaryFolder[]): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop()!;
    folders.filter((f) => f.parentId === cur).forEach((f) => { result.add(f.id); queue.push(f.id); });
  }
  return result;
}

// ── BestiaryCard ──────────────────────────────────────────

interface CardProps { entry: BestiaryEntry; exportFlash: boolean; onSelect: () => void; onExport: () => void; onCast: () => void; }

function BestiaryCard({ entry, exportFlash, onSelect, onExport, onCast }: CardProps) {
  function handleDragStart(e: React.DragEvent) {
    setActiveTokenDrag({ sourceId: entry.id, label: entry.name, color: FOE_COLOR, portraitPath: entry.portrait, kind: "enemy" });
    e.dataTransfer.setData("text/plain", "ttcanvas-token");
    e.dataTransfer.effectAllowed = "copy";
    e.stopPropagation();
  }

  // The keyboard equivalent of dragging the portrait onto the map - same data as handleDragStart.
  function handlePlaceAtCenter() {
    placeTokenAtCenter({ sourceId: entry.id, label: entry.name, color: FOE_COLOR, portraitPath: entry.portrait, kind: "enemy" });
  }

  return (
    <div className={styles.cardWrap}>
      <button className={styles.card} onClick={onSelect}>
        <div
          className={styles.cardPortrait}
          draggable
          title={`Drag ${entry.name} onto map`}
          onDragStart={handleDragStart}
          onDragEnd={clearActiveTokenDrag}
        >
          {entry.portrait
            ? <img src={entry.portrait} className={styles.cardPortraitImg} alt={entry.name} draggable={false} />
            : <span className={styles.cardPortraitFallback}>{entry.name.charAt(0).toUpperCase()}</span>
          }
          <div className={styles.dragHint} aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="10" cy="2" r="1.2"/>
              <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="10" cy="6" r="1.2"/>
              <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/>
            </svg>
            map
          </div>
        </div>
        <span className={styles.cardName}>{entry.name}</span>
        <div className={styles.cardStats}>
          <span title="Challenge Rating">CR {entry.cr || "-"}</span>
          <span title="Hit Points">♥ {entry.hp}</span>
          <span title="Armor Class">🛡 {entry.ac}</span>
        </div>
      </button>
      <button
        className={styles.cardCastBtn}
        onClick={(e) => { e.stopPropagation(); onCast(); }}
        title="Show to players"
      >
        ▶
      </button>
      <button
        className={`${styles.cardExportBtn} ${exportFlash ? styles.cardExportBtnSaved : ""}`}
        onClick={(e) => { e.stopPropagation(); onExport(); }}
        title={exportFlash ? "Saved ✓" : "Export as .creature.json"}
      >
        {exportFlash ? "✓" : "⬇"}
      </button>
      <button
        className={styles.cardMapBtn}
        onClick={(e) => { e.stopPropagation(); handlePlaceAtCenter(); }}
        title={`Place ${entry.name} at map center`}
        aria-label={`Place ${entry.name} at map center`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="4" />
          <path d="M12 14v6M9 20h6" />
        </svg>
      </button>
    </div>
  );
}

// ── FlatRow ───────────────────────────────────────────────

interface FlatRowProps { entry: BestiaryEntry; exportFlash: boolean; onOpen: () => void; onExport: () => void; onCast: () => void; }

function FlatRow({ entry, exportFlash, onOpen, onExport, onCast }: FlatRowProps) {
  function handleDragStart(e: React.DragEvent) {
    setActiveTokenDrag({ sourceId: entry.id, label: entry.name, color: FOE_COLOR, portraitPath: entry.portrait, kind: "enemy" });
    e.dataTransfer.setData("text/plain", "ttcanvas-token");
    e.dataTransfer.effectAllowed = "copy";
    e.stopPropagation();
  }

  // The keyboard equivalent of dragging the portrait onto the map - same data as handleDragStart.
  function handlePlaceAtCenter() {
    placeTokenAtCenter({ sourceId: entry.id, label: entry.name, color: FOE_COLOR, portraitPath: entry.portrait, kind: "enemy" });
  }

  return (
    <div className={styles.flatRow}>
      <button className={styles.flatRowMain} onClick={onOpen}>
        <div
          className={styles.flatRowPortrait}
          draggable
          title={`Drag ${entry.name} onto map`}
          onDragStart={handleDragStart}
          onDragEnd={clearActiveTokenDrag}
        >
          {entry.portrait
            ? <img src={entry.portrait} className={styles.flatRowPortraitImg} alt="" draggable={false} />
            : <span className={styles.flatRowInitial}>{entry.name.charAt(0).toUpperCase()}</span>
          }
          <div className={styles.dragHint} aria-hidden="true">
            <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="10" cy="2" r="1.2"/>
              <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="10" cy="6" r="1.2"/>
              <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/>
            </svg>
            map
          </div>
        </div>
        <div className={styles.flatRowInfo}>
          <span className={styles.flatRowName}>{entry.name || "(unnamed)"}</span>
          <span className={styles.flatRowMeta}>
            {[entry.creatureType, entry.cr ? `CR ${entry.cr}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className={styles.flatRowStats}>
          <span>♥ {entry.hp}</span>
          <span>🛡 {entry.ac}</span>
        </div>
      </button>
      <button
        className={styles.flatRowCast}
        onClick={(e) => { e.stopPropagation(); onCast(); }}
        title="Show to players"
      >
        ▶
      </button>
      <button
        className={`${styles.flatRowExport} ${exportFlash ? styles.flatRowExportSaved : ""}`}
        onClick={(e) => { e.stopPropagation(); onExport(); }}
        title={exportFlash ? "Saved ✓" : "Export as .creature.json"}
      >
        {exportFlash ? "✓" : "⬇"}
      </button>
      <button
        className={styles.flatRowMap}
        onClick={(e) => { e.stopPropagation(); handlePlaceAtCenter(); }}
        title={`Place ${entry.name} at map center`}
        aria-label={`Place ${entry.name} at map center`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="4" />
          <path d="M12 14v6M9 20h6" />
        </svg>
      </button>
    </div>
  );
}
