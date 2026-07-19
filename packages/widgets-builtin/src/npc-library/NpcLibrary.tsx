// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useCallback, useRef } from "react";
import { useVault, useGazetteerLocations, pushCharacterScene, type GazetteerLocationRef } from "@ttcanvas/core";
import { CropModal } from "../party-tracker/CropModal";
import type { NpcLibraryState, ParsedNpc, NpcRelationship } from "./types";
import {
  parseNpcJson, parseLegacyMd, serializeNpcJson,
  uniqueNpcFilename, mdFilenameToJson,
  makeBlankNpc, autoAccentColor, npcInitials,
} from "./npcFormat";
import { setActiveTokenDrag, clearActiveTokenDrag } from "../shared/tokenDrag";
import { renderMarkdown } from "../shared/markdownRenderer";
import { mimeForImageExt } from "../shared/mime";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { NPCSheetModal } from "../shared/NPCSheetModal";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import { dedupe, hashContent, parseImportFile, exportCollection, type DedupeResult } from "../shared/importExport";
import styles from "./NpcLibrary.module.css";

function npcContentKey(npc: ParsedNpc): string {
  const { id: _id, filename: _filename, ...rest } = npc;
  return hashContent(rest);
}

// Wikilink clicks in an NPC's notes use the cross-entity channel, so [[A Place]] / [[Another NPC]]
// resolve to that entity (and [[A Note]] still opens the note). An NPC body may link out to entities.
function onNpcWikilinkClick(e: React.MouseEvent) {
  const link = (e.target as HTMLElement).closest("[data-wikilink]") as HTMLElement | null;
  if (!link) return;
  e.preventDefault();
  const name = link.dataset.wikilink;
  if (name) window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", { detail: { name } }));
}

function validateNpcBundle(parsed: unknown): ParsedNpc[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (bundle.type !== "ttcanvas-npc-library" || !Array.isArray(bundle.npcs)) return null;
  // Keep only entries with the string fields the importer dereferences (id for
  // dedupe, name for the filename); drop malformed ones rather than letting a
  // non-string name crash nameToFilename mid-import. Mirrors the Rule Cards validator.
  return bundle.npcs.flatMap((n: unknown): ParsedNpc[] => {
    if (!n || typeof n !== "object") return [];
    const npc = n as Record<string, unknown>;
    if (typeof npc.id !== "string" || typeof npc.name !== "string" || !npc.name.trim()) return [];
    return [npc as unknown as ParsedNpc];
  });
}

interface Props {
  state: NpcLibraryState;
  onChange: (state: NpcLibraryState) => void;
}

type RelFilter = "all" | NpcRelationship;

const REL_LABELS: Record<NpcRelationship, string> = {
  ally: "Ally", neutral: "Neutral", wary: "Wary", hostile: "Hostile",
};

const EMPTY_ADD = { name: "", race: "", occupation: "" };

function AvatarCircle({ npc, size = 36, onClick, onDragStart, onDragEnd }: {
  npc: ParsedNpc; size?: number;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const vault = useVault();
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!npc.portrait || !vault.vaultPath) { setPortraitUrl(null); return; }
    const fileName = npc.portrait.split("/").pop()!;
    const mime = mimeForImageExt(fileName);
    vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
      .then((b64) => setPortraitUrl(`data:${mime};base64,${b64}`))
      .catch(() => setPortraitUrl(null));
    // vault's context value is a fresh object every render (tracked in
    // tracking/phase6-fixes.md) - depending on the whole object instead of
    // its stable fields would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npc.portrait, vault.vaultPath, vault.vaultVersion]);
  const color = npc.accentColor ?? autoAccentColor(npc.name || "?");
  const isDraggable = !!onDragStart;
  return (
    <div
      className={[styles.avatar, onClick ? styles.avatarClickable : "", isDraggable ? styles.avatarDraggable : ""].filter(Boolean).join(" ")}
      style={{ width: size, height: size, background: portraitUrl ? "transparent" : color, fontSize: size * 0.33 }}
      onClick={onClick}
      draggable={isDraggable}
      title={onClick ? "Click to change portrait" : isDraggable ? "Drag onto map" : undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {portraitUrl
        ? <img src={portraitUrl} alt="" className={styles.avatarPortrait} />
        : npcInitials(npc.name)}
      {isDraggable && (
        <div className={styles.avatarDragHint} aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="10" cy="2" r="1.2"/>
            <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="10" cy="6" r="1.2"/>
            <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/>
          </svg>
          map
        </div>
      )}
    </div>
  );
}

function RelBadge({ rel }: { rel?: NpcRelationship }) {
  if (!rel) return null;
  return <span className={styles.relBadge} data-rel={rel}>{REL_LABELS[rel]}</span>;
}

export function NpcLibrary({ state, onChange }: Props) {
  const vault = useVault();

  const [npcs, setNpcs] = useState<ParsedNpc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [relFilter, setRelFilter] = useState<RelFilter>("all");
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ParsedNpc | null>(null);
  // The id (not a bare boolean) the delete confirmation was armed for, so switching the
  // selection through any path (list click, external open, add, delete) auto-invalidates a
  // stale confirmation instead of it silently reappearing armed for a different NPC.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Raw text for the Tags input, kept separate from draft.tags so the input reflects exactly what
  // was typed - deriving it from the parsed array on every keystroke strips a trailing comma before
  // the user can finish typing the next tag.
  const [tagsText, setTagsText] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<DedupeResult<ParsedNpc> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    if (!vault.vaultPath) return;

    // Migration: read any .md NPC files and write .json equivalents
    try {
      const mdFiles = (await vault.listFiles("md")).filter((f) => f.startsWith("npcs/"));
      const jsonFiles = new Set((await vault.listFiles("json")).filter((f) => f.startsWith("npcs/")));

      for (const mdFile of mdFiles) {
        const jsonFile = mdFilenameToJson(mdFile);
        if (!jsonFiles.has(jsonFile)) {
          try {
            const content = await vault.readFile(mdFile);
            const npc = parseLegacyMd(mdFile, content);
            await vault.writeFile(jsonFile, serializeNpcJson({ ...npc, filename: jsonFile }));
            jsonFiles.add(jsonFile);
          } catch {
            // skip failed migrations silently
          }
        }
      }

      // Load all .json NPCs
      const loaded: ParsedNpc[] = [];
      for (const f of jsonFiles) {
        try {
          const content = await vault.readFile(f);
          loaded.push(parseNpcJson(f, content));
        } catch {
          loaded.push(makeBlankNpc(f));
        }
      }
      loaded.sort((a, b) => a.name.localeCompare(b.name));
      setNpcs(loaded);
    } catch {
      setNpcs([]);
    }
  }, [vault]);

  useEffect(() => {
    loadAll();
  }, [loadAll, vault.vaultVersion]);

  // keep selectedId valid when list changes
  useEffect(() => {
    if (selectedId && !npcs.find((n) => n.id === selectedId)) {
      setSelectedId(npcs[0]?.id ?? null);
    }
    if (!selectedId && npcs.length > 0) {
      setSelectedId(npcs[0].id);
    }
  }, [npcs, selectedId]);

  // Honour an incoming selection: App.handleOpenNpc sets the singleton's selectedFile when an NPC is
  // opened from elsewhere (a Gazetteer chip, an [[npc:...]] link, a backlink). Because user clicks keep
  // selectedFile in sync (selectNpc), a divergence here means a genuine external open, so this never
  // fights normal clicking and re-opening the same NPC works (state points elsewhere after you browse).
  useEffect(() => {
    const file = state?.selectedFile ?? null;
    if (!file) return;
    const target = npcs.find((n) => n.filename === file);
    if (!target || target.id === selectedId) return; // absent (not loaded), or already selected
    setSelectedId(target.id);
    setEditing(false);
    setDraft(null);
    setAdding(false);
  }, [state, npcs, selectedId]);

  const selectedNpc = npcs.find((n) => n.id === selectedId) ?? null;
  const confirmingDelete = !!selectedNpc && confirmDeleteId === selectedNpc.id;

  // User-driven selection: also write selectedFile so state tracks the current NPC (keeps the external
  // -open sync above honest, and persists the open NPC across reloads).
  function selectNpc(npc: ParsedNpc) {
    setSelectedId(npc.id);
    setEditing(false);
    setDraft(null);
    setAdding(false);
    onChange({ selectedFile: npc.filename });
  }

  // filter tabs counts
  const counts: Record<RelFilter, number> = {
    all: npcs.length,
    ally: npcs.filter((n) => n.relationship === "ally").length,
    neutral: npcs.filter((n) => n.relationship === "neutral").length,
    wary: npcs.filter((n) => n.relationship === "wary").length,
    hostile: npcs.filter((n) => n.relationship === "hostile").length,
  };

  const filteredNpcs = npcs.filter((n) => {
    const matchSearch = n.name.toLowerCase().includes(search.toLowerCase())
      || (n.occupation ?? "").toLowerCase().includes(search.toLowerCase())
      || (n.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchRel = relFilter === "all" || n.relationship === relFilter;
    return matchSearch && matchRel;
  });

  const encounterCount = npcs.filter((n) => n.encountered).length;

  async function saveNpc(npc: ParsedNpc) {
    if (!vault.vaultPath) return;
    setSaving(true);
    try {
      await vault.writeFile(npc.filename, serializeNpcJson(npc));
      setNpcs((prev) => prev.map((n) => n.id === npc.id ? npc : n).sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDetailDone() {
    if (draft) await saveNpc(draft);
    setEditing(false);
    setDraft(null);
  }

  function handleDetailEdit() {
    if (editing) {
      handleDetailDone();
    } else {
      setDraft(selectedNpc ? { ...selectedNpc } : null);
      setTagsText((selectedNpc?.tags ?? []).join(", "));
      setEditing(true);
    }
  }

  function patchDraft(p: Partial<ParsedNpc>) {
    setDraft((d) => d ? { ...d, ...p } : d);
  }

  function setNpc<K extends keyof ParsedNpc>(key: K, val: ParsedNpc[K]) {
    setDraft((d) => {
      if (!d) return d;
      const n = { ...d };
      n[key] = val;
      return n;
    });
  }

  async function handleAdd() {
    const name = addForm.name.trim();
    if (!name) return;
    const finalFilename = uniqueNpcFilename(name, npcs.map((n) => n.filename));

    const npc: ParsedNpc = {
      filename: finalFilename,
      id: crypto.randomUUID(),
      name,
      race: addForm.race.trim(),
      occupation: addForm.occupation.trim(),
    };
    setSaving(true);
    try {
      await vault.writeFile(finalFilename, serializeNpcJson(npc));
      setNpcs((prev) => [...prev, npc].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(npc.id);
      onChange({ selectedFile: npc.filename });
      setAdding(false);
      setAddForm(EMPTY_ADD);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedNpc) return;
    await vault.deleteFile(selectedNpc.filename);
    const remaining = npcs.filter((n) => n.id !== selectedNpc.id);
    setNpcs(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    onChange({ selectedFile: remaining[0]?.filename ?? null });
    setEditing(false);
    setDraft(null);
    setConfirmDeleteId(null);
  }

  async function handleShowPlayers(npc: ParsedNpc) {
    const color = npc.accentColor ?? autoAccentColor(npc.name || "?");
    const subtitle = [npc.occupation, npc.race].filter(Boolean).join(" · ");
    const tags: string[] = [];
    if (npc.class) tags.push(npc.class + (npc.level ? ` ${npc.level}` : ""));
    if (npc.cr) tags.push(`CR ${npc.cr}`);

    let portraitSrc: string | undefined;
    let portraitFullSrc: string | undefined;
    if (npc.portrait && vault.vaultPath) {
      const fileName = npc.portrait.split("/").pop()!;
      portraitSrc = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
        .then((b64) => `data:image/jpeg;base64,${b64}`)
        .catch(() => undefined);
    }
    if (npc.portraitFull && vault.vaultPath) {
      const fileName = npc.portraitFull.split("/").pop()!;
      portraitFullSrc = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName)
        .then((b64) => `data:image/jpeg;base64,${b64}`)
        .catch(() => undefined);
    }

    await pushCharacterScene({
      kind: "npc",
      name: npc.name,
      subtitle: subtitle || undefined,
      portraitSrc,
      portraitFullSrc,
      accentColor: color,
      tags: tags.length > 0 ? tags : undefined,
    });
  }

  async function handlePortraitPick() {
    const src = await vault.pickImageFile();
    if (!src) return;
    const b64 = await vault.readBinaryFile(src);
    const mime = mimeForImageExt(src);
    setCropDataUrl(`data:${mime};base64,${b64}`);
  }

  async function handleCropConfirm(croppedDataUrl: string, fullDataUrl: string) {
    setCropDataUrl(null);
    if (!selectedNpc || !vault.vaultPath) return;
    const fileName = `npc-${selectedNpc.id}.jpg`;
    const fullFileName = `npc-${selectedNpc.id}-full.jpg`;
    await vault.writeFileBase64(`${vault.vaultPath}/portraits`, fileName, croppedDataUrl.split(",")[1]);
    await vault.writeFileBase64(`${vault.vaultPath}/portraits`, fullFileName, fullDataUrl.split(",")[1]);
    const portrait = `portraits/${fileName}`;
    const portraitFull = `portraits/${fullFileName}`;
    const updated = { ...selectedNpc, portrait, portraitFull };
    await saveNpc(updated);
    if (editing) setDraft((d) => d ? { ...d, portrait, portraitFull } : d);
  }

  async function handleExportOne(npc: ParsedNpc) {
    const bundle = { type: "ttcanvas-npc-library", version: 1, npcs: [npc] };
    await exportCollection(vault.saveTextFile, bundle, `${npc.name.replace(/[^a-z0-9]/gi, "_")}.npc-library.json`);
  }

  async function handleExportAll() {
    const bundle = { type: "ttcanvas-npc-library", version: 1, npcs };
    await exportCollection(vault.saveTextFile, bundle, "npcs.npc-library.json");
  }

  function handleImportClick() {
    setImportError(null);
    importFileRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("Failed to read import file.");
      return;
    }
    const incoming = parseImportFile(text, validateNpcBundle);
    if (!incoming) {
      setImportError("Not a valid NPC library file.");
      return;
    }
    const result = dedupe(incoming, npcs, { idOf: (n) => n.id, contentKeyOf: npcContentKey });
    if (result.idConflicts.length > 0 || result.contentDuplicates.length > 0) {
      setPendingImport(result);
    } else {
      await applyImport(result, "skip");
    }
  }

  async function applyImport(result: DedupeResult<ParsedNpc>, conflictMode: "skip" | "replace") {
    setPendingImport(null);
    setSaving(true);
    try {
      if (conflictMode === "replace") {
        for (const npc of result.idConflicts) {
          const existing = npcs.find((n) => n.id === npc.id);
          if (existing) await vault.writeFile(existing.filename, serializeNpcJson({ ...npc, filename: existing.filename }));
        }
      }
      const usedFilenames = new Set(npcs.map((n) => n.filename));
      for (const npc of result.clean) {
        const finalFilename = uniqueNpcFilename(npc.name, usedFilenames);
        usedFilenames.add(finalFilename);
        await vault.writeFile(finalFilename, serializeNpcJson({ ...npc, filename: finalFilename }));
      }
    } finally {
      setSaving(false);
    }
    await loadAll();
  }

  const displayNpc = editing && draft ? draft : selectedNpc;

  if (!vault.vaultPath) {
    return (
      <div className={styles.noVault}>
        <p className={styles.noVaultText}>No vault selected.</p>
        <button className={styles.selectVaultBtn} onClick={vault.openVault}>Choose Vault Folder</button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* ── Left: list pane ─────────────────────── */}
      <div className={styles.left}>
        <div className={styles.searchRow}>
          <input
            className={styles.search}
            placeholder="Search by name, role, tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className={styles.addIconBtn} onClick={() => { setAdding(true); setAddForm(EMPTY_ADD); }} title="Add NPC">+</button>
        </div>

        <div className={styles.filterTabs}>
          {(["all", "ally", "neutral", "wary", "hostile"] as RelFilter[]).map((r) => (
            <button
              key={r}
              className={`${styles.filterTab} ${relFilter === r ? styles.filterTabActive : ""}`}
              onClick={() => setRelFilter(r)}
            >
              {r === "all" ? `All ${counts.all}` : `${REL_LABELS[r]} ${counts[r]}`}
            </button>
          ))}
        </div>

        <div className={styles.listScroll}>
          {filteredNpcs.length === 0 && (
            <div className={styles.emptyList}>
              {npcs.length === 0 ? "No NPCs yet. Hit + to add." : "No matches."}
            </div>
          )}
          {filteredNpcs.map((npc) => (
            <div
              key={npc.id}
              className={`${styles.listRow} ${npc.id === selectedId ? styles.listRowActive : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => selectNpc(npc)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectNpc(npc); }}
            >
              <AvatarCircle
                npc={npc}
                size={36}
                onDragStart={(e) => {
                  const color = npc.accentColor ?? autoAccentColor(npc.name || "?");
                  setActiveTokenDrag({ sourceId: npc.id, label: npc.name, color, portraitPath: npc.portrait, kind: "npc" });
                  e.dataTransfer.setData("text/plain", "ttcanvas-token");
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={clearActiveTokenDrag}
              />
              <div className={styles.listRowText}>
                <span className={styles.listName}>{npc.name}</span>
                <span className={styles.listMeta}>{[npc.race, npc.occupation].filter(Boolean).join(" · ")}</span>
              </div>
              <RelBadge rel={npc.relationship} />
            </div>
          ))}
        </div>

        {importError && (
          <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>
        )}
        <div className={styles.listFooter}>
          <span>{npcs.length} NPC{npcs.length !== 1 ? "s" : ""} · {encounterCount} encountered</span>
          <div className={styles.footerBtns}>
            <button className={styles.footerBtn} onClick={handleImportClick}>Import</button>
            <button className={styles.footerBtn} onClick={handleExportAll} disabled={npcs.length === 0}>Export all</button>
          </div>
        </div>
      </div>

      {/* ── Right: detail / add pane ────────────── */}
      <div className={styles.right}>
        {adding ? (
          <div className={styles.addForm}>
            <div className={styles.addFormTitle}>New NPC</div>
            <label className={styles.addLabel}>Name
              <input className={styles.addInput} value={addForm.name} autoFocus onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} />
            </label>
            <label className={styles.addLabel}>Race
              <input className={styles.addInput} value={addForm.race} placeholder="e.g. Human" onChange={(e) => setAddForm((f) => ({ ...f, race: e.target.value }))} />
            </label>
            <label className={styles.addLabel}>Occupation
              <input className={styles.addInput} value={addForm.occupation} placeholder="e.g. Guard" onChange={(e) => setAddForm((f) => ({ ...f, occupation: e.target.value }))} />
            </label>
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAdd} disabled={saving || !addForm.name.trim()}>
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        ) : displayNpc ? (
          <div className={styles.detail}>
            {/* Header */}
            <div className={styles.detailHeader}>
              <AvatarCircle npc={displayNpc} size={52} onClick={handlePortraitPick} />
              <div className={styles.detailHeaderText}>
                <span className={styles.detailName}>{displayNpc.name}</span>
                <span className={styles.detailMeta}>
                  {[displayNpc.race, displayNpc.class ? `${displayNpc.class}${displayNpc.level ? ` ${displayNpc.level}` : ""}` : null, displayNpc.occupation, displayNpc.age ? `Age ${displayNpc.age}` : null].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className={styles.detailActions}>
                <button className={styles.sheetBtn} onClick={() => setSheetOpen(true)} title="Open full sheet">↗</button>
                <button className={styles.sheetBtn} onClick={() => handleExportOne(displayNpc)} title="Export this NPC">↓</button>
                <button className={styles.playersBtn} onClick={() => handleShowPlayers(displayNpc)} title="Show to players">▶</button>
                <button
                  className={`${styles.editBtn} ${editing ? styles.editBtnActive : ""}`}
                  onClick={handleDetailEdit}
                >
                  {editing ? "Done" : "Edit"}
                </button>
              </div>
            </div>

            {/* Relationship */}
            <div className={styles.section}>
              <div className={styles.sectionHead}>Relationship</div>
              {editing ? (
                <div className={styles.relChips}>
                  {(["ally", "neutral", "wary", "hostile"] as NpcRelationship[]).map((r) => (
                    <button
                      key={r}
                      className={`${styles.relChip} ${draft?.relationship === r ? styles.relChipActive : ""}`}
                      data-rel={r}
                      onClick={() => patchDraft({ relationship: draft?.relationship === r ? undefined : r })}
                    >{REL_LABELS[r]}</button>
                  ))}
                </div>
              ) : (
                <div className={styles.relBarRow}>
                  <RelBadge rel={displayNpc.relationship} />
                  {displayNpc.relationship && (
                    <div className={styles.relBar}>
                      <div
                        className={styles.relBarFill}
                        data-rel={displayNpc.relationship}
                        style={{ width: { ally: "100%", neutral: "67%", wary: "33%", hostile: "10%" }[displayNpc.relationship] }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Location */}
            <LocationField
              npc={displayNpc}
              editing={editing}
              onPick={(loc) => patchDraft({ location: loc.name, locationRef: loc.filename })}
              onUnlink={(liveName) => patchDraft({ locationRef: undefined, location: liveName })}
              onTextChange={(v) => setNpc("location", v || undefined)}
            />

            {/* Last seen */}
            <div className={styles.metaField}>
              <div className={styles.sectionHead}>Last seen</div>
              {editing
                ? <input className={styles.metaInput} value={draft?.lastSeen ?? ""} onChange={(e) => setNpc("lastSeen", e.target.value || undefined)} placeholder="-" />
                : <span className={styles.metaVal}>{displayNpc.lastSeen || "-"}</span>}
            </div>

            {/* Custom fields */}
            {editing ? (
              <div className={styles.section}>
                {(draft?.customFields ?? []).map((f, i) => (
                  <div key={i} className={styles.customFieldRow}>
                    <input
                      className={styles.customLabelInput}
                      value={f.label}
                      placeholder="Label"
                      onChange={(e) => {
                        const fields = [...(draft?.customFields ?? [])];
                        fields[i] = { ...f, label: e.target.value };
                        patchDraft({ customFields: fields });
                      }}
                    />
                    <div className={styles.customFieldRowBody}>
                      <input
                        className={styles.metaInput}
                        value={f.value}
                        placeholder="-"
                        onChange={(e) => {
                          const fields = [...(draft?.customFields ?? [])];
                          fields[i] = { ...f, value: e.target.value };
                          patchDraft({ customFields: fields });
                        }}
                      />
                      <button
                        className={styles.removeFieldBtn}
                        onClick={() => patchDraft({ customFields: (draft?.customFields ?? []).filter((_, j) => j !== i) })}
                      >×</button>
                    </div>
                  </div>
                ))}
                <button
                  className={styles.addFieldBtn}
                  onClick={() => patchDraft({ customFields: [...(draft?.customFields ?? []), { label: "", value: "" }] })}
                >+ Add field</button>
              </div>
            ) : (
              (displayNpc.customFields ?? []).filter((f) => f.label).map((f, i) => (
                <div key={i} className={styles.metaField}>
                  <div className={styles.sectionHead}>{f.label}</div>
                  <span className={styles.metaVal}>{f.value || "-"}</span>
                </div>
              ))
            )}

            {/* Narrative */}
            {(["trait", "hook", "voice"] as const).map((key) => (
              <div key={key} className={styles.narrativeField}>
                <div className={styles.sectionHead}>{key.toUpperCase()}</div>
                {editing
                  ? <input className={styles.metaInput} value={draft?.[key] ?? ""} onChange={(e) => setNpc(key, e.target.value || undefined)} placeholder={key === "trait" ? "Physical or personality quirk" : key === "hook" ? "Plot hook or secret" : "How they speak"} />
                  : <p className={`${styles.narrativeVal} ${key === "voice" ? styles.italic : ""}`}>{displayNpc[key] || "-"}</p>}
              </div>
            ))}

            {/* Tags */}
            <div className={styles.section}>
              <div className={styles.sectionHead}>Tags</div>
              {editing ? (
                <input
                  className={styles.metaInput}
                  value={tagsText}
                  placeholder="comma-separated"
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    patchDraft({ tags: e.target.value ? e.target.value.split(",").map((t) => t.trim()).filter(Boolean) : [] });
                  }}
                />
              ) : (
                <div className={styles.tagList}>
                  {(displayNpc.tags ?? []).length > 0
                    ? (displayNpc.tags ?? []).map((t) => <span key={t} className={styles.tag}>{t}</span>)
                    : <span className={styles.emptyVal}>-</span>}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className={styles.section}>
              <div className={styles.sectionHead}>Notes</div>
              {editing
                ? <textarea className={styles.notesTextarea} rows={4} value={draft?.notes ?? ""} onChange={(e) => patchDraft({ notes: e.target.value || undefined })} placeholder="GM notes… [[Place]] and [[NPC]] links work" />
                : displayNpc.notes?.trim()
                  ? <div className={styles.notesProse} dangerouslySetInnerHTML={{ __html: renderMarkdown(displayNpc.notes) }} onClick={onNpcWikilinkClick} />
                  : <p className={styles.notesText}>-</p>}
            </div>

            {/* Encountered */}
            <label className={styles.encounteredRow}>
              <input
                type="checkbox"
                checked={editing ? (draft?.encountered ?? false) : (displayNpc.encountered ?? false)}
                onChange={(e) => {
                  const newVal = e.target.checked;
                  if (editing) { patchDraft({ encountered: newVal }); }
                  else { saveNpc({ ...displayNpc, encountered: newVal }); }
                }}
              />
              <span>Party has met this NPC</span>
            </label>

            {/* Footer */}
            <div className={styles.detailFooter}>
              <ConfirmDeleteButton
                confirming={confirmingDelete}
                trigger="🗑 Remove"
                confirmQuestion={`Delete "${displayNpc.name}"?`}
                confirmLabel="Yes, delete"
                className={styles.removeBtn}
                rowClassName={styles.confirmRow}
                questionClassName={styles.confirmText}
                confirmClassName={styles.confirmYes}
                cancelClassName={styles.confirmNo}
                onRequestConfirm={() => setConfirmDeleteId(displayNpc.id)}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDeleteId(null)}
              />
            </div>
          </div>
        ) : (
          <div className={styles.emptyDetail}>Select an NPC or hit + to add.</div>
        )}
      </div>

      {/* Sheet modal */}
      {sheetOpen && selectedNpc && (
        <NPCSheetModal
          npc={selectedNpc}
          onSave={async (updated) => { await saveNpc(updated); }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* Portrait crop */}
      {cropDataUrl && (
        <CropModal
          imgDataUrl={cropDataUrl}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropDataUrl(null)}
        />
      )}

      {/* Hidden file input for import */}
      <input ref={importFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />

      {/* Import conflict dialog */}
      {pendingImport && (
        <ImportConflictDialog
          title="Import NPC Library"
          noun="NPC"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((n) => ({ id: n.id, label: n.name }))}
          contentDuplicates={pendingImport.contentDuplicates.map((n) => ({ id: n.id, label: n.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}
    </div>
  );
}

// Location field: free text, or - once linked to a real Gazetteer place (locationRef) - a chip
// showing the place's live name (falls back to the cached `location` string if the ref is dangling
// or hasn't loaded yet), clickable to open Gazetteer. Mirrors Gazetteer's own linked-NPC chip
// convention. Unlinking is edit-gated like every other mutable field here; opening the chip isn't,
// since it's navigation rather than an edit.
function LocationField({ npc, editing, onPick, onUnlink, onTextChange }: {
  npc: ParsedNpc; editing: boolean;
  onPick: (loc: GazetteerLocationRef) => void;
  /** Passed the currently-displayed live name, so unlinking after a Gazetteer rename keeps the name
   *  the GM was just looking at instead of reverting to whatever `location` was cached at link time. */
  onUnlink: (liveName: string | undefined) => void;
  onTextChange: (v: string) => void;
}) {
  const { locations } = useGazetteerLocations();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  const linked = npc.locationRef ? locations.find((l) => l.filename === npc.locationRef) : undefined;
  const liveName = linked?.name ?? npc.location;

  function openGazetteer() {
    if (npc.locationRef) window.dispatchEvent(new CustomEvent("ttcanvas:open-location", { detail: { filename: npc.locationRef } }));
  }

  const q = query.trim().toLowerCase();
  const results = locations.filter((l) => !q || l.name.toLowerCase().includes(q));

  return (
    <div className={styles.metaField}>
      <div className={styles.sectionHead}>Location</div>
      {npc.locationRef ? (
        <span className={styles.locationChip}>
          <button type="button" className={styles.locationChipBody} onClick={openGazetteer} title={`Open ${liveName ?? "place"} in Gazetteer`}>
            {liveName || "(missing place)"}
          </button>
          {editing && <button className={styles.locationChipRemove} onClick={() => onUnlink(liveName)} aria-label="Unlink location">×</button>}
        </span>
      ) : editing ? (
        <div className={styles.locationEditRow}>
          <input className={styles.metaInput} value={npc.location ?? ""} onChange={(e) => onTextChange(e.target.value)} placeholder="-" />
          <button type="button" className={styles.locationLinkBtn} onClick={() => { setPicking((v) => !v); setQuery(""); }}>Link…</button>
        </div>
      ) : (
        <span className={styles.metaVal}>{npc.location || "-"}</span>
      )}
      {editing && picking && (
        <div className={styles.locationPicker}>
          <input
            className={styles.metaInput} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search places" aria-label="Search Gazetteer places" autoFocus
          />
          <div className={styles.locationPickerList}>
            {results.length === 0
              ? <p className={styles.locationPickerEmpty}>No places to link.</p>
              : results.map((l) => (
                  <button key={l.filename} className={styles.locationPickerRow} onClick={() => { onPick(l); setPicking(false); }}>
                    {l.name}
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}
