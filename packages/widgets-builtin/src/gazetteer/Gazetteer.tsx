// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVault, useNpcs, useMapPins, pushLocationScene, logWarn, logError, type NpcRef } from "@ttcanvas/core";
import { autoAccentColor, npcInitials } from "../npc-library/npcFormat";
import { renderMarkdown } from "../shared/markdownRenderer";
import { mimeForImageExt } from "../shared/mime";
import { dedupe, exportCollection, readBundle, buildBundle, hashContent, type DedupeResult } from "../shared/importExport";
import { copyVaultAssets } from "../shared/crossVaultPull";
import { CollectionIO } from "../shared/CollectionIO";
import { VaultPullControl } from "../shared/VaultPullControl";
import { WidgetSettingsCog } from "../shared/WidgetSettingsCog";
import { ConfirmDeleteButton as SharedConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ImportConflictDialog } from "../shared/ImportConflictDialog";
import type { GazetteerState, GazetteerLocation, LinkedEntity, LocationKind } from "./types";
import { KIND_META, KIND_ORDER, kindLabel } from "./types";
import { parseLocationJson, serializeLocationJson, nameToFilename, slugFromFilename } from "./gazetteerFormat";
import { buildLocationTree, breadcrumbTrail, childrenOf, descendantIds, type LocationTreeNode } from "./hierarchy";
import styles from "./Gazetteer.module.css";

interface Props {
  state: GazetteerState;
  onChange: (state: GazetteerState) => void;
}

/** Structural key for import dedupe: the location minus its transient filename. */
function locationContentKey(loc: GazetteerLocation): string {
  const { filename: _f, ...rest } = loc;
  return hashContent(rest);
}

function validateGazetteerBundle(parsed: unknown): GazetteerLocation[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const b = parsed as Record<string, unknown>;
  if (b.type !== "ttcanvas-gazetteer" || !Array.isArray(b.items)) return null;
  // Re-run each item through the file parser so imports get the same defensive backfill as a load.
  return b.items.map((item) => parseLocationJson("locations/import.json", JSON.stringify(item)));
}

export function Gazetteer({ state, onChange }: Props) {
  const vault = useVault();
  const { npcs } = useNpcs();
  const { pinnedLocationRefs } = useMapPins();
  const [locations, setLocations] = useState<GazetteerLocation[]>([]);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GazetteerLocation | null>(null);
  const [adding, setAdding] = useState<null | { parentId: string | null }>(null);
  const [addName, setAddName] = useState("");
  const [addKind, setAddKind] = useState<LocationKind>("region");
  const [linkPicker, setLinkPicker] = useState<null | "npc" | "faction">(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [pendingImport, setPendingImport] = useState<DedupeResult<GazetteerLocation> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Load places (NPC names for link labels and the picker come from useNpcs) ──
  const loadAll = useCallback(async () => {
    if (!vault.vaultPath) { setLocations([]); return; }
    try {
      const files = (await vault.listFiles("json")).filter((f) => f.startsWith("locations/"));
      const loaded = await Promise.all(files.map(async (f) => {
        try { return parseLocationJson(f, await vault.readFile(f)); }
        catch (err) {
          logWarn(`Gazetteer: could not read place "${f}", showing a blank entry`, err);
          return parseLocationJson(f, "{}");
        }
      }));
      loaded.sort((a, b) => a.name.localeCompare(b.name));
      setLocations(loaded);
    } catch (err) {
      logError("Gazetteer: could not scan the locations folder", err);
      setLocations([]);
    }
  }, [vault]);

  useEffect(() => { void loadAll(); }, [loadAll, vault.vaultVersion]);

  const npcByFile = useMemo(() => new Map(npcs.map((n) => [n.filename, n])), [npcs]);

  const selected = locations.find((l) => l.filename === state.selectedFile) ?? null;
  const displayLoc = editing && draft ? draft : selected;

  // ── Establishing-image loading (mount-ref guard: a StrictMode remount must not wedge it off) ──
  const loadedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadImage = useCallback(async (path: string): Promise<string | null> => {
    if (path.startsWith("data:")) return path;
    if (!vault.vaultPath) return null;
    try {
      const fileName = path.split("/").pop()!;
      const b64 = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName);
      return `data:${mimeForImageExt(fileName)};base64,${b64}`;
    } catch (err) {
      logWarn(`Gazetteer: could not load image "${path}"`, err);
      return null;
    }
  }, [vault]);

  useEffect(() => {
    for (const loc of locations) {
      const path = loc.imagePath;
      if (!path || loadedRef.current.has(path)) continue;
      loadedRef.current.add(path);
      void loadImage(path).then((src) => {
        if (src && mountedRef.current) setImages((prev) => ({ ...prev, [path]: src }));
      });
    }
  }, [locations, loadImage]);

  // ── Vault mutations ──
  async function saveLocation(loc: GazetteerLocation) {
    if (!vault.vaultPath) return;
    await vault.writeFile(loc.filename, serializeLocationJson(loc));
    setLocations((prev) => prev.map((l) => (l.id === loc.id ? loc : l)).sort((a, b) => a.name.localeCompare(b.name)));
  }

  function select(loc: GazetteerLocation | null) {
    onChange({ selectedFile: loc?.filename ?? null });
    setEditing(false); setDraft(null); setLinkPicker(null);
  }

  function patchDraft(p: Partial<GazetteerLocation>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  function handleEditToggle() {
    if (editing) { if (draft) void saveLocation(draft); setEditing(false); setDraft(null); }
    else if (selected) { setDraft({ ...selected }); setEditing(true); }
  }

  async function handleAdd() {
    const name = addName.trim();
    if (!name || !vault.vaultPath) return;
    let filename = nameToFilename(name);
    let suffix = 1;
    const slug = slugFromFilename(filename);
    while (locations.some((l) => l.filename === filename)) filename = `locations/${slug}-${suffix++}.json`;
    const loc: GazetteerLocation = {
      filename, id: crypto.randomUUID(), name, kind: addKind, parentId: adding?.parentId ?? null, links: [],
    };
    await vault.writeFile(filename, serializeLocationJson(loc));
    setLocations((prev) => [...prev, loc].sort((a, b) => a.name.localeCompare(b.name)));
    onChange({ selectedFile: filename });
    setAdding(null); setAddName(""); setEditing(false); setDraft(null);
  }

  async function handleDelete() {
    if (!selected || !vault.vaultPath) return;
    await vault.deleteFile(selected.filename);
    // Children keep their now-dangling parentId and float to the top level (see hierarchy guards);
    // no cascade delete, so a mis-click never wipes a whole region.
    setLocations((prev) => prev.filter((l) => l.id !== selected.id));
    select(null);
  }

  // Parent re-parent: immediate in view mode, into the draft while editing.
  function onParentChange(parentId: string | null) {
    if (editing) patchDraft({ parentId });
    else if (selected) void saveLocation({ ...selected, parentId });
  }

  function addLink(link: LinkedEntity) {
    if (!displayLoc) return;
    const next = { ...displayLoc, links: [...displayLoc.links, link] };
    if (editing) patchDraft({ links: next.links }); else void saveLocation(next);
    setLinkPicker(null); setLinkQuery("");
  }

  function removeLink(idx: number) {
    if (!displayLoc) return;
    const links = displayLoc.links.filter((_, i) => i !== idx);
    if (editing) patchDraft({ links }); else void saveLocation({ ...displayLoc, links });
  }

  // ── Establishing image ──
  async function handleImagePick() {
    if (!selected || !vault.vaultPath) return;
    const src = await vault.pickImageFile();
    if (!src) return;
    const saved = await vault.savePortraitToVault(selected.id, src);
    if (!saved) return;
    const imagePath = saved.portraitRelativePath;
    loadedRef.current.delete(imagePath);
    const dataUrl = await loadImage(imagePath);
    if (dataUrl && mountedRef.current) setImages((prev) => ({ ...prev, [imagePath]: dataUrl }));
    // While editing, only touch the draft (Done persists it); otherwise write straight through.
    if (editing) patchDraft({ imagePath }); else await saveLocation({ ...selected, imagePath });
  }

  function handleImageRemove() {
    if (!displayLoc) return;
    if (editing) patchDraft({ imagePath: undefined }); else void saveLocation({ ...displayLoc, imagePath: undefined });
  }

  async function handleCast(loc: GazetteerLocation) {
    const parent = loc.parentId ? locations.find((l) => l.id === loc.parentId) : null;
    const subtitle = [kindLabel(loc), parent?.name].filter(Boolean).join(" - ");
    const imgSrc = loc.imagePath ? images[loc.imagePath] ?? (await loadImage(loc.imagePath)) ?? undefined : undefined;
    await pushLocationScene({ name: loc.name, subtitle: subtitle || undefined, blurb: loc.playerBlurb?.trim() || undefined, imgSrc });
  }

  // ── Import / export ──
  async function handleExportAll() {
    await exportCollection(vault.saveTextFile, buildBundle("ttcanvas-gazetteer", { items: locations }), "gazetteer.json");
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    let text: string;
    try { text = await file.text(); } catch (err) {
      logError("Gazetteer: could not read the import file", err);
      setImportError("Could not read that file.");
      return;
    }
    await handleImportText(text);
  }

  // Pull places from another vault: read its locations/*.json, copy the images they
  // reference, then merge through the same import path as a file (one json per place).
  async function handlePull(sourceVault: string): Promise<boolean> {
    setImportError(null);
    const files = (await vault.listFolderFiles(sourceVault, "json")).filter((f) => f.startsWith("locations/"));
    const foreign: GazetteerLocation[] = [];
    for (const f of files) {
      try {
        foreign.push(parseLocationJson(f, await vault.readFolderFile(sourceVault, f)));
      } catch (err) {
        logWarn(`Gazetteer: skipping unreadable place "${f}" during pull`, err);
      }
    }
    if (foreign.length === 0) return false;
    const imgs = foreign.flatMap((l) => (l.imagePath ? [l.imagePath] : []));
    await copyVaultAssets(sourceVault, imgs, vault.readFileBase64, vault.writeFileBase64);
    await handleImportText(JSON.stringify(buildBundle("ttcanvas-gazetteer", { items: foreign })));
    return true;
  }

  async function handleImportText(text: string) {
    setImportError(null);
    const incoming = readBundle(text, "ttcanvas-gazetteer", validateGazetteerBundle);
    if (!incoming) { setImportError("That is not a Gazetteer export."); return; }
    const result = dedupe(incoming, locations, { idOf: (l) => l.id, contentKeyOf: locationContentKey });
    if (result.idConflicts.length || result.contentDuplicates.length) setPendingImport(result);
    else await applyImport(result, "skip");
  }

  async function applyImport(result: DedupeResult<GazetteerLocation>, mode: "skip" | "replace") {
    setPendingImport(null);
    if (!vault.vaultPath) return;
    if (mode === "replace") {
      for (const loc of result.idConflicts) {
        const existing = locations.find((l) => l.id === loc.id);
        if (existing) await vault.writeFile(existing.filename, serializeLocationJson({ ...loc, filename: existing.filename }));
      }
    }
    const used = new Set(locations.map((l) => l.filename));
    for (const loc of result.clean) {
      let filename = nameToFilename(loc.name);
      let suffix = 1;
      const slug = slugFromFilename(filename);
      while (used.has(filename)) filename = `locations/${slug}-${suffix++}.json`;
      used.add(filename);
      await vault.writeFile(filename, serializeLocationJson({ ...loc, filename }));
    }
    await loadAll();
  }

  // ── Derived view data ──
  function npcName(link: LinkedEntity): string {
    return link.kind === "npc" ? npcByFile.get(link.ref ?? "")?.name ?? link.label : link.label;
  }

  const tree = useMemo(() => buildLocationTree(locations), [locations]);
  const q = search.trim().toLowerCase();
  const searchResults = q
    ? locations.filter((l) => l.name.toLowerCase().includes(q) || (l.summary ?? "").toLowerCase().includes(q))
    : [];
  const crumbs = displayLoc ? breadcrumbTrail(locations, displayLoc.id) : [];
  const children = selected ? childrenOf(locations, selected.id) : [];
  const parentOptions = useMemo(() => {
    if (!displayLoc) return [];
    const blocked = descendantIds(locations, displayLoc.id);
    return locations
      .filter((l) => l.id !== displayLoc.id && !blocked.has(l.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, displayLoc]);

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
      {/* ── Left: tree ── */}
      <div className={styles.left}>
        <div className={styles.searchRow}>
          <input className={styles.search} placeholder="Search places" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search places" />
          <button className={styles.addBtn} title="Add place" aria-label="Add place" onClick={() => { setAdding({ parentId: null }); setAddName(""); setAddKind("region"); }}>+</button>
        </div>

        <div className={styles.treeScroll} role="tree" aria-label="Locations">
          {locations.length === 0 && <p className={styles.emptyList}>No places yet. Hit + to add one.</p>}
          {q
            ? (searchResults.length === 0
                ? <p className={styles.emptyList}>No matches.</p>
                : searchResults.map((loc) => (
                    <LocationRow key={loc.id} loc={loc} depth={0} childCount={0} collapsed={false}
                      active={loc.id === selected?.id} onSelect={() => select(loc)} onToggle={() => {}} />
                  )))
            : tree.map((node) => (
                <TreeBranch key={node.location.id} node={node} collapsed={collapsed}
                  selectedId={selected?.id ?? null} onSelect={select}
                  onToggle={(id) => setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
              ))}
        </div>

        <div className={styles.footer}>
          <span>{locations.length} place{locations.length === 1 ? "" : "s"}</span>
        </div>
        <WidgetSettingsCog>
          <CollectionIO onImportFile={handleImportFile} onExportAll={handleExportAll} exportDisabled={locations.length === 0} onError={setImportError} />
          <VaultPullControl otherVaults={vault.otherVaults} onPull={handlePull} onError={setImportError} />
          {importError && <div className={styles.importError} onClick={() => setImportError(null)}>{importError}</div>}
        </WidgetSettingsCog>
      </div>

      {/* ── Right: detail / add ── */}
      <div className={styles.right}>
        {adding ? (
          <div className={styles.addForm}>
            <div className={styles.addFormTitle}>{adding.parentId ? "Add a place within" : "Add a place"}</div>
            <label className={styles.addLabel}>Name
              <input className={styles.addInput} value={addName} autoFocus onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }} placeholder="The Gilded Cage" />
            </label>
            <label className={styles.addLabel}>Kind
              <select className={styles.addInput} value={addKind} onChange={(e) => setAddKind(e.target.value as LocationKind)}>
                {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
              </select>
            </label>
            <div className={styles.addActions}>
              <button className={styles.cancelBtn} onClick={() => { setAdding(null); setAddName(""); }}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAdd} disabled={!addName.trim()}>Add</button>
            </div>
          </div>
        ) : !displayLoc ? (
          <div className={styles.emptyDetail}>Select a place, or hit + to add one.</div>
        ) : (
          <div className={styles.detail}>
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              {crumbs.slice(0, -1).map((c) => (
                <span key={c.id}><button className={styles.crumbLink} onClick={() => select(c)}>{c.name}</button><span className={styles.crumbSep}>›</span></span>
              ))}
              <span className={styles.crumbHere}>{displayLoc.name}</span>
            </nav>

            <div className={styles.titleRow}>
              {editing
                ? <input className={styles.nameInput} value={displayLoc.name} onChange={(e) => patchDraft({ name: e.target.value })} aria-label="Place name" />
                : <div className={styles.locName}>{displayLoc.name}</div>}
              <button className={`${styles.editToggle} ${editing ? styles.editToggleActive : ""}`} onClick={handleEditToggle}>{editing ? "Done" : "Edit"}</button>
            </div>

            <div className={styles.kindLine}>
              {editing ? (
                <>
                  <select className={styles.inlineSelect} value={displayLoc.kind} onChange={(e) => patchDraft({ kind: e.target.value as LocationKind })} aria-label="Kind">
                    {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
                  </select>
                  {displayLoc.kind === "custom" && (
                    <input className={styles.inlineInput} value={displayLoc.customKind ?? ""} onChange={(e) => patchDraft({ customKind: e.target.value })} placeholder="Label" aria-label="Custom kind label" />
                  )}
                </>
              ) : (
                <span className={styles.kindBadge}>
                  <KindGlyph kind={displayLoc.kind} /> {kindLabel(displayLoc)}
                </span>
              )}
              <label className={styles.parentPick}>in
                <select className={styles.inlineSelect} value={displayLoc.parentId ?? ""} onChange={(e) => onParentChange(e.target.value || null)} aria-label="Parent place">
                  <option value="">— top level —</option>
                  {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>

            {/* Establishing image + cast */}
            <div className={styles.estab}>
              {displayLoc.imagePath && images[displayLoc.imagePath]
                ? <img className={styles.estabImg} src={images[displayLoc.imagePath]} alt={`${displayLoc.name} establishing image`} />
                : <button className={styles.estabEmpty} onClick={handleImagePick}>+ Establishing image</button>}
              {displayLoc.imagePath && (
                <div className={styles.estabActions}>
                  <button className={styles.estabAction} onClick={handleImagePick}>Replace</button>
                  <button className={styles.estabAction} onClick={handleImageRemove}>Remove</button>
                </div>
              )}
              <button className={styles.castBtn} onClick={() => handleCast(displayLoc)} title="Cast to the player window">Cast to players</button>
            </div>

            {/* Summary (edit only) */}
            {editing && (
              <label className={styles.fieldBlock}>
                <span className={styles.sectionHead}>Summary</span>
                <input className={styles.inlineInput} value={displayLoc.summary ?? ""} onChange={(e) => patchDraft({ summary: e.target.value })} placeholder="One line for the list" />
              </label>
            )}

            {/* Linked NPCs & factions */}
            <div className={styles.fieldBlock}>
              <span className={styles.sectionHead}>Linked NPCs &amp; factions</span>
              <div className={styles.chips}>
                {displayLoc.links.map((link, i) => (
                  <span key={`${link.kind}-${link.ref}-${i}`} className={`${styles.chip} ${link.kind === "faction" ? styles.chipFaction : ""}`}>
                    {link.kind === "npc" && link.ref ? (
                      <button type="button" className={styles.chipBody} onClick={() => openNpc(link.ref!)} title={`Open ${npcName(link)}`}>
                        <span className={styles.chipAv} style={{ background: autoAccentColor(npcName(link)) }}>{npcInitials(npcName(link))}</span>
                        {npcName(link)}
                      </button>
                    ) : (
                      <span className={styles.chipBody}>
                        <span className={styles.chipAv} style={{ background: "var(--pp)" }}>{npcInitials(npcName(link))}</span>
                        {npcName(link)}
                      </span>
                    )}
                    <button className={styles.chipRemove} onClick={() => removeLink(i)} aria-label={`Remove ${npcName(link)}`}>✕</button>
                  </span>
                ))}
                <button className={styles.chipAdd} onClick={() => { setLinkPicker("npc"); setLinkQuery(""); }} aria-label="Link an NPC or faction">+</button>
              </div>
              {linkPicker && (
                <LinkPicker mode={linkPicker} query={linkQuery} setQuery={setLinkQuery}
                  npcs={npcs.filter((n) => !displayLoc.links.some((l) => l.kind === "npc" && l.ref === n.filename))}
                  setMode={setLinkPicker} onAddNpc={(n) => addLink({ kind: "npc", ref: n.filename, label: n.name })}
                  onAddFaction={(label) => addLink({ kind: "faction", ref: null, label })} />
              )}
            </div>

            {/* Child places */}
            {children.length > 0 && (
              <div className={styles.fieldBlock}>
                <span className={styles.sectionHead}>Within this place</span>
                <div className={styles.chips}>
                  {children.map((c) => (
                    <button key={c.id} className={`${styles.chip} ${styles.chipChild}`} onClick={() => select(c)}>
                      <KindGlyph kind={c.kind} /> {c.name}
                    </button>
                  ))}
                  <button className={styles.chipAdd} onClick={() => { setAdding({ parentId: selected?.id ?? null }); setAddName(""); setAddKind("poi"); }} aria-label="Add a child place">+</button>
                </div>
              </div>
            )}

            {/* Player-safe blurb (edit only) */}
            {editing && (
              <label className={styles.fieldBlock}>
                <span className={styles.sectionHead}>Player blurb <span className={styles.hint}>(shown on the cast card)</span></span>
                <textarea className={styles.textarea} rows={2} value={displayLoc.playerBlurb ?? ""} onChange={(e) => patchDraft({ playerBlurb: e.target.value })} placeholder="A player-safe line for the reveal" />
              </label>
            )}

            {/* Notes (Markdown) */}
            <div className={styles.fieldBlock}>
              <span className={styles.sectionHead}>Notes</span>
              {editing
                ? <textarea className={styles.textarea} rows={6} value={displayLoc.body ?? ""} onChange={(e) => patchDraft({ body: e.target.value })} placeholder="GM notes. Markdown and [[wikilinks]] work." />
                : displayLoc.body?.trim()
                  ? <div className={styles.prose} dangerouslySetInnerHTML={{ __html: renderMarkdown(displayLoc.body) }} onClick={onWikilinkClick} />
                  : <p className={styles.emptyVal}>No notes yet.</p>}
            </div>

            {/* Jumps to Map Display: an existing pin for this place is located and panned to, or
                (if none exists yet) the tool arms so the next map click drops one. The label reflects
                whether a pin already exists anywhere, read live from MapPinsContext. */}
            <button
              type="button"
              className={`${styles.mapHook} ${pinnedLocationRefs.has(displayLoc.filename) ? styles.mapHookPinned : ""}`}
              onClick={() => pinLocation(displayLoc.filename, displayLoc.name)}
              title={pinnedLocationRefs.has(displayLoc.filename)
                ? "This place already has a pin - jumps to it on the map"
                : "Arms Map Display so your next click drops a pin for this place"}
            >
              {pinnedLocationRefs.has(displayLoc.filename) ? "Pinned on a map - show me" : "Pin this place on a map"}
            </button>

            <div className={styles.detailFooter}>
              <ConfirmDeleteButton key={selected?.id} onConfirm={handleDelete} />
            </div>
          </div>
        )}
      </div>

      {pendingImport && (
        <ImportConflictDialog
          title="Import places" noun="place"
          totalCount={pendingImport.idConflicts.length + pendingImport.contentDuplicates.length + pendingImport.clean.length}
          idConflicts={pendingImport.idConflicts.map((l) => ({ id: l.id, label: l.name }))}
          contentDuplicates={pendingImport.contentDuplicates.map((l) => ({ id: l.id, label: l.name }))}
          onCancel={() => setPendingImport(null)}
          onSkip={() => applyImport(pendingImport, "skip")}
          onReplace={() => applyImport(pendingImport, "replace")}
        />
      )}
    </div>
  );
}

// Open a linked NPC in the NPC Library (the App resolves the event; see WikilinkResolver / App).
function openNpc(filename: string) {
  window.dispatchEvent(new CustomEvent("ttcanvas:open-npc", { detail: { filename } }));
}

// Ask Map Display to jump to this place's pin, or arm "next click drops it" if none exists yet.
// Map Display owns that decision (it holds the token data); Gazetteer never needs to know the answer.
function pinLocation(filename: string, name: string) {
  window.dispatchEvent(new CustomEvent("ttcanvas:pin-location", { detail: { filename, name } }));
}

// Wikilink clicks in a place's notes go through the cross-entity channel, so [[Another Place]] or
// [[Vex]] resolves to that place / NPC (and [[A Note]] still opens the note). This is an entity body,
// so unlike Session Notes it is allowed to link out to other entities.
function onWikilinkClick(e: React.MouseEvent) {
  const link = (e.target as HTMLElement).closest("[data-wikilink]") as HTMLElement | null;
  if (!link) return;
  e.preventDefault();
  const name = link.dataset.wikilink;
  if (name) window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", { detail: { name } }));
}

function KindGlyph({ kind }: { kind: LocationKind }) {
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={KIND_META[kind].d} />
    </svg>
  );
}

// A recursive tree branch: a row plus its (optionally collapsed) children.
function TreeBranch({ node, collapsed, selectedId, onSelect, onToggle }: {
  node: LocationTreeNode; collapsed: Set<string>; selectedId: string | null;
  onSelect: (loc: GazetteerLocation) => void; onToggle: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(node.location.id);
  return (
    <>
      <LocationRow loc={node.location} depth={node.depth} childCount={node.children.length}
        collapsed={isCollapsed} active={node.location.id === selectedId}
        onSelect={() => onSelect(node.location)} onToggle={() => onToggle(node.location.id)} />
      {!isCollapsed && node.children.map((child) => (
        <TreeBranch key={child.location.id} node={child} collapsed={collapsed} selectedId={selectedId} onSelect={onSelect} onToggle={onToggle} />
      ))}
    </>
  );
}

function LocationRow({ loc, depth, childCount, collapsed, active, onSelect, onToggle }: {
  loc: GazetteerLocation; depth: number; childCount: number; collapsed: boolean;
  active: boolean; onSelect: () => void; onToggle: () => void;
}) {
  return (
    <div className={`${styles.row} ${active ? styles.rowActive : ""}`} role="treeitem" aria-selected={active}
      style={{ paddingLeft: 6 + depth * 16 }}>
      {childCount > 0 ? (
        <button className={`${styles.twist} ${collapsed ? "" : styles.twistOpen}`} onClick={onToggle} aria-label={collapsed ? "Expand" : "Collapse"} aria-expanded={!collapsed}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      ) : <span className={styles.twist} />}
      <button className={styles.rowMain} onClick={onSelect}>
        <span className={styles.kindBox}><KindGlyph kind={loc.kind} /></span>
        <span className={styles.rowName}>{loc.name}</span>
        {childCount > 0 && <span className={styles.count}>{childCount}</span>}
      </button>
    </div>
  );
}

// Inline picker for adding a linked NPC (from the library) or a free-standing faction label.
function LinkPicker({ mode, query, setQuery, npcs, setMode, onAddNpc, onAddFaction }: {
  mode: "npc" | "faction"; query: string; setQuery: (q: string) => void; npcs: NpcRef[];
  setMode: (m: "npc" | "faction") => void; onAddNpc: (n: NpcRef) => void; onAddFaction: (label: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const list = npcs.filter((n) => !q || n.name.toLowerCase().includes(q));
  return (
    <div className={styles.picker}>
      <div className={styles.pickerTabs}>
        <button className={`${styles.pickerTab} ${mode === "npc" ? styles.pickerTabActive : ""}`} onClick={() => setMode("npc")}>NPC</button>
        <button className={`${styles.pickerTab} ${mode === "faction" ? styles.pickerTabActive : ""}`} onClick={() => setMode("faction")}>Faction</button>
      </div>
      {mode === "npc" ? (
        <>
          <input className={styles.inlineInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search NPCs" aria-label="Search NPCs" autoFocus />
          <div className={styles.pickerList}>
            {list.length === 0 ? <p className={styles.pickerEmpty}>No NPCs to link.</p>
              : list.map((n) => <button key={n.filename} className={styles.pickerRow} onClick={() => onAddNpc(n)}>{n.name}</button>)}
          </div>
        </>
      ) : (
        <input className={styles.inlineInput} value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) onAddFaction(query.trim()); }}
          placeholder="Faction name, then Enter" aria-label="Faction name" autoFocus />
      )}
    </div>
  );
}

// Two-click delete; key by the selected id at the call site to reset it.
function ConfirmDeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <SharedConfirmDeleteButton
      confirming={confirming}
      trigger="Delete place"
      className={styles.deleteBtn}
      rowClassName={styles.confirmRow}
      confirmClassName={styles.confirmYes}
      cancelClassName={styles.confirmNo}
      onRequestConfirm={() => setConfirming(true)}
      onConfirm={onConfirm}
      onCancel={() => setConfirming(false)}
    />
  );
}
