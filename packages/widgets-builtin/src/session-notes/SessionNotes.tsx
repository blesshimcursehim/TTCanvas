// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useVault, useAI, ollamaCheck, ollamaListModels, ollamaGenerate, openaiGenerate } from "@ttcanvas/core";
import type { SessionNotesState } from "./types";
import { renderMarkdown } from "../shared/markdownRenderer";
import { buildBacklinkIndex, linkGraph, linkKey, basenameLabel, readEntitySource, type SourceDoc, type SourceKind } from "../shared/wikilinks";
import { WebCanvas } from "../relationship-web/WebCanvas";
import { relaxLayout, seedPosition } from "../relationship-web/layout";
import type { RelNode, RelEdge } from "../relationship-web/types";
import { FileTree, buildFileTree } from "./FileTree";
import styles from "./SessionNotes.module.css";

// A tag and a colour per source kind, shared by the backlinks panel and the graph so notes, NPCs and
// places read the same in both. Colours use the stat-tone hues (amber / warm red / cool cyan).
const KIND_TAG: Record<SourceKind, string> = {
  note: "Note", npc: "NPC", place: "Place", creature: "Creature", card: "Card", rule: "Rule",
};
const KIND_COLOR: Record<SourceKind, string> = {
  note: "oklch(0.80 0.115 78)",
  npc: "oklch(0.70 0.15 25)",
  place: "oklch(0.72 0.12 200)",
  creature: "oklch(0.68 0.16 145)",
  card: "oklch(0.70 0.14 300)",
  rule: "oklch(0.72 0.10 250)",
};

type GraphState = { nodes: RelNode[]; edges: RelEdge[]; kinds: Map<string, SourceKind> };

// Lay out the vault link graph for WebCanvas: sources/notes become nodes (id = ref), resolved
// `[[links]]` become edges, seeded on a spiral then relaxed. `kinds` colours nodes and routes clicks;
// linkGraph already returns only refs that take part in a link.
function buildNoteGraph(docs: SourceDoc[]): GraphState {
  const { nodes, edges } = linkGraph(docs);
  const seeded = nodes.map((n, i) => ({ id: n.id, ...seedPosition(i) }));
  const relaxed = new Map(relaxLayout(seeded, edges).map((p) => [p.id, p]));
  return {
    nodes: nodes.map((n) => {
      const p = relaxed.get(n.id);
      return { id: n.id, kind: "custom", label: n.label, ref: null, x: p?.x ?? 0, y: p?.y ?? 0 };
    }),
    edges: edges.map((e, i) => ({ id: `e${i}`, from: e.from, to: e.to, type: "custom" })),
    kinds: new Map(nodes.map((n) => [n.id, n.kind])),
  };
}

interface Props {
  state: SessionNotesState;
  onChange: (state: SessionNotesState) => void;
}

export function SessionNotes({ state, onChange }: Props) {
  const vault = useVault();
  const { config: aiConfig } = useAI();
  const [files, setFiles] = useState<string[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [graphOpen, setGraphOpen] = useState(false);
  const [graph, setGraph] = useState<GraphState>({ nodes: [], edges: [], kinds: new Map() });
  const tree = useMemo(() => buildFileTree(files), [files]);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiStreamRef = useRef("");
  const cancelGenRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { cancelGenRef.current?.(); }, []);

  useEffect(() => {
    if (aiConfig.provider === "ollama") {
      ollamaCheck().then(setOllamaAvailable).catch(() => {});
    }
  }, [aiConfig.provider]);

  const loadList = useCallback(async () => {
    if (!state.notesFolder) return;
    try {
      const [md, txt] = await Promise.all([
        vault.listFolderFiles(state.notesFolder, "md"),
        vault.listFolderFiles(state.notesFolder, "txt"),
      ]);
      setFiles([...md, ...txt].sort());
    } catch {
      setFiles([]);
    }
    // Depend on the stable method + vaultVersion, not the whole vault object (recreated every
    // render, see tracking/phase6-fixes.md) - avoids re-listing files on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.notesFolder, vault.listFolderFiles, vault.vaultVersion]);

  useEffect(() => { loadList(); }, [loadList]);

  // Build the link corpus: every .md note (targets, from the notes folder) plus NPC notes and
  // Gazetteer place bodies as extra sources (vault JSON at the npcs/ and locations/ prefixes, read
  // directly). Re-runs when the file list or vault changes. Entities with no body carry no links, so
  // they are skipped.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const notes: (SourceDoc | null)[] = state.notesFolder
        ? await Promise.all(files.filter((f) => f.endsWith(".md")).map(async (path): Promise<SourceDoc | null> => {
            try { return { kind: "note", ref: path, label: basenameLabel(path), text: await vault.readFolderFile(state.notesFolder!, path), targetKey: linkKey(path) }; }
            catch { return null; }
          }))
        : [];
      let entities: (SourceDoc | null)[] = [];
      try {
        const json = await vault.listFiles("json");
        entities = await Promise.all([
          ...json.filter((f) => f.startsWith("npcs/")).map((ref) => readEntitySource(vault, ref, "npc", "notes")),
          ...json.filter((f) => f.startsWith("locations/")).map((ref) => readEntitySource(vault, ref, "place", "body")),
        ]);
      } catch { /* no vault entities */ }
      if (!cancelled) setSources([...notes, ...entities].filter((d): d is SourceDoc => d !== null));
    })();
    return () => { cancelled = true; };
    // Depend on the individual (useCallback-stable) vault methods + vaultVersion, not the whole vault
    // object - its context value is recreated every render, which would re-read the corpus needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, state.notesFolder, vault.readFile, vault.readFolderFile, vault.listFiles, vault.vaultVersion]);

  const backlinkIndex = useMemo(() => buildBacklinkIndex(sources), [sources]);
  const backlinks = useMemo(
    () => (state.selectedFile ? backlinkIndex.get(linkKey(state.selectedFile)) ?? [] : []),
    [backlinkIndex, state.selectedFile],
  );

  function openGraph() {
    setGraph(buildNoteGraph(sources));
    setGraphOpen(true);
  }

  // Open a backlink source or a graph node by its kind: a note selects here, an NPC/place opens its
  // own widget via the same window-event style the wikilink opener uses.
  function openSource(kind: SourceKind, ref: string) {
    setGraphOpen(false);
    if (kind === "note") onChange({ ...state, selectedFile: ref });
    else window.dispatchEvent(new CustomEvent(kind === "npc" ? "ttcanvas:open-npc" : "ttcanvas:open-location", { detail: { filename: ref } }));
  }

  // Resolve a clicked [[wikilink]] against the loaded notes by basename key (case-insensitive, and
  // subfolder-aware since we open the real path), so a link's casing/spacing need not match the
  // filename exactly - the same forgiving match the backlinks panel uses. Falls back to the global
  // opener when the note isn't in this folder (e.g. links clicked from other widgets).
  function openWikilink(name: string) {
    const hit = sources.find((d) => d.targetKey === linkKey(name));
    if (hit) onChange({ ...state, selectedFile: hit.ref });
    else window.dispatchEvent(new CustomEvent("ttcanvas:open-wikilink", { detail: { name } }));
  }

  // Dismiss the full-screen graph on Escape (a modal overlay should always have a keyboard exit).
  useEffect(() => {
    if (!graphOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setGraphOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [graphOpen]);

  useEffect(() => {
    if (!state.selectedFile || !state.notesFolder) {
      setContent(null);
      setDraft("");
      setEditMode(false);
      return;
    }
    setLoading(true);
    vault
      .readFolderFile(state.notesFolder, state.selectedFile)
      .then((text) => { setContent(text); setDraft(text); })
      .catch(() => { setContent(null); setDraft(""); })
      .finally(() => setLoading(false));
    // Depend on the stable method + vaultVersion, not the whole vault object (recreated every
    // render, see tracking/phase6-fixes.md) - avoids re-reading the open note on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedFile, state.notesFolder, vault.readFolderFile, vault.vaultVersion]);

  // Exit edit mode when file changes
  useEffect(() => { setEditMode(false); }, [state.selectedFile]);

  async function saveFile() {
    if (!state.notesFolder || !state.selectedFile) return;
    const path = state.selectedFile;
    await vault.writeFolderFile(state.notesFolder, path, draft);
    setContent(draft);
    // Keep the link index fresh after an edit (the folder-scan effect only re-runs on a file-list or
    // vault change, so an edited [[link]] would otherwise not show in backlinks until a refresh).
    if (path.endsWith(".md")) {
      setSources((prev) => {
        const doc: SourceDoc = { kind: "note", ref: path, label: basenameLabel(path), text: draft, targetKey: linkKey(path) };
        const i = prev.findIndex((d) => d.ref === path);
        if (i === -1) return [...prev, doc];
        const next = prev.slice();
        next[i] = doc;
        return next;
      });
    }
    setSavedFlash(true);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => setSavedFlash(false), 1400);
  }

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveFile();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = draft.slice(0, start) + "  " + draft.slice(end);
      setDraft(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  }

  async function createNewFile() {
    if (!state.notesFolder) return;
    let name = "Untitled.md";
    let i = 2;
    while (files.includes(name)) { name = `Untitled-${i++}.md`; }
    await vault.writeFolderFile(state.notesFolder, name, "");
    await loadList();
    onChange({ ...state, selectedFile: name });
    setDraft("");
    setContent("");
    setEditMode(true);
  }

  async function handlePlotHook() {
    if (aiGenerating || content === null) return;
    const prompt = `You are a creative TTRPG game master assistant. Based on the following session note, suggest one evocative plot hook - a compelling story thread, mystery, or encounter that naturally follows from the events described. Be concise (2-4 sentences) and immediately usable at the table.\n\nNote:\n${content}`;
    const separator = "\n\n---\n\n**Plot Hook**\n\n";
    aiStreamRef.current = draft + separator;
    setDraft(aiStreamRef.current);
    setEditMode(true);
    setAiGenerating(true);
    cancelGenRef.current?.();
    const handleChunk = (chunk: { type: string; text?: string }) => {
      if (chunk.type === "token") {
        aiStreamRef.current += chunk.text ?? "";
        setDraft(aiStreamRef.current);
      } else {
        setAiGenerating(false);
      }
    };
    try {
      let gen: { promise: Promise<void>; cancel: () => void };
      if (aiConfig.provider === "ollama") {
        const models = await ollamaListModels().catch(() => [] as string[]);
        const model = models[0];
        if (!model) { setAiGenerating(false); return; }
        gen = ollamaGenerate(model, prompt, handleChunk);
      } else {
        if (!aiConfig.model) { setAiGenerating(false); return; }
        gen = openaiGenerate(aiConfig.baseUrl, aiConfig.apiKey, aiConfig.model, prompt, handleChunk);
      }
      cancelGenRef.current = gen.cancel;
      await gen.promise;
    } catch {
      setAiGenerating(false);
    } finally {
      cancelGenRef.current = null;
    }
  }

  async function pickFolder() {
    const picked = await vault.pickFolder(state.notesFolder);
    if (picked) onChange({ notesFolder: picked, selectedFile: null });
  }

  const isTxt = state.selectedFile?.endsWith(".txt") ?? false;

  if (!state.notesFolder) {
    return (
      <div className={styles.centered}>
        <p className={styles.hint}>No notes folder selected.</p>
        <button className={styles.actionBtn} onClick={pickFolder}>
          Choose Notes Folder
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Session Notes</span>

        {(aiConfig.provider === "openai" ? !!aiConfig.model : ollamaAvailable) && state.selectedFile && content !== null && (
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarBtnAi} ${aiGenerating ? styles.toolbarBtnActive : ""}`}
            onClick={handlePlotHook}
            disabled={aiGenerating}
            title={aiGenerating ? "Generating…" : "Suggest a plot hook with AI (appends to note)"}
          >
            ✦
          </button>
        )}

        {state.selectedFile && (
          <button
            className={`${styles.toolbarBtn} ${editMode ? styles.toolbarBtnActive : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (editMode) saveFile().then(() => setEditMode(false));
              else setEditMode(true);
            }}
            title={editMode ? "Switch to preview (saves)" : "Edit this file"}
          >
            {editMode ? (
              /* eye icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              /* pencil icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
          </button>
        )}

        {savedFlash && <span className={styles.savedBadge}>Saved</span>}

        {sources.length > 0 && (
          <button className={styles.toolbarBtn} onClick={openGraph} title="Open the link graph">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="6" r="2.2" /><circle cx="19" cy="7" r="2.2" /><circle cx="12" cy="18" r="2.2" />
              <path d="M7 6.6 17 6.8M6.3 7.8 10.6 16M13.5 16.6 17.6 8.8" />
            </svg>
          </button>
        )}

        <button
          className={styles.toolbarBtn}
          onClick={createNewFile}
          title="New file - creates Untitled.md in the notes folder"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <button className={styles.toolbarBtn} onClick={pickFolder} title="Change notes folder">
          <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor">
            <path d="M0 1.5C0 .67.67 0 1.5 0H4.9l1.5 1.5H11.5C12.33 1.5 13 2.17 13 3v6.5c0 .83-.67 1.5-1.5 1.5h-10C.67 11 0 10.33 0 9.5v-8z"/>
          </svg>
        </button>

        <button className={styles.toolbarBtn} onClick={loadList} title="Refresh file list">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {/* Two-panel layout */}
      <div className={styles.panels}>
        <div className={styles.left}>
          {files.length === 0 ? (
            <p className={styles.hint}>No .md or .txt files found.</p>
          ) : (
            <FileTree
              nodes={tree}
              selectedFile={state.selectedFile}
              onSelect={(path) => {
                if (editMode) saveFile().then(() => setEditMode(false));
                onChange({ ...state, selectedFile: path });
              }}
            />
          )}
        </div>

        <div className={styles.right}>
          {!state.selectedFile && <p className={styles.hint}>Select a file to read or edit.</p>}
          {loading && <p className={styles.hint}>Loading…</p>}

          {!loading && state.selectedFile && content !== null && editMode && (
            <textarea
              className={styles.editor}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              onBlur={saveFile}
              spellCheck={false}
              autoFocus
            />
          )}

          {!loading && content !== null && !editMode && (
            isTxt ? (
              <pre className={styles.plainText}>{content}</pre>
            ) : (
              <div
                className={styles.prose}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const link = target.closest("[data-wikilink]") as HTMLElement | null;
                  if (!link) return;
                  e.preventDefault();
                  const name = link.dataset.wikilink;
                  if (name) openWikilink(name);
                }}
              />
            )
          )}

          {!loading && state.selectedFile && content === null && (
            <p className={styles.hint}>Could not read file.</p>
          )}

          {!loading && content !== null && !editMode && backlinks.length > 0 && (
            <section className={styles.backlinks}>
              <h4 className={styles.backlinksHead}>Linked mentions <span className={styles.backlinksCount}>{backlinks.length}</span></h4>
              {backlinks.map((b) => (
                <button key={`${b.kind}:${b.ref}`} className={styles.backlinkRow} onClick={() => openSource(b.kind, b.ref)}>
                  <span className={styles.backlinkName}>
                    <span className={styles.kindTag} style={{ color: KIND_COLOR[b.kind], borderColor: KIND_COLOR[b.kind] }}>{KIND_TAG[b.kind]}</span>
                    {b.label}
                  </span>
                  {b.contexts[0] && <span className={styles.backlinkContext}>{b.contexts[0]}</span>}
                </button>
              ))}
            </section>
          )}
        </div>
      </div>

      {graphOpen && createPortal(
        <div className={styles.graphScrim} onClick={() => setGraphOpen(false)}>
          <div className={styles.graphWrap} onClick={(e) => e.stopPropagation()}>
            <div className={styles.graphBar}>
              <span className={styles.graphTitle}>Vault links</span>
              <span className={styles.graphMeta}>{graph.nodes.length} nodes · {graph.edges.length} links</span>
              <span className={styles.graphLegend}>
                {(["note", "npc", "place"] as const).map((k) => (
                  <span key={k} className={styles.legendItem}><span className={styles.legendDot} style={{ background: KIND_COLOR[k] }} />{KIND_TAG[k]}</span>
                ))}
              </span>
              <span className={styles.graphSpacer} />
              <button className={styles.graphBtn} onClick={() => setGraph(buildNoteGraph(sources))} disabled={graph.nodes.length < 2} title="Re-arrange the graph">Tidy</button>
              <button className={styles.graphBtn} onClick={() => setGraphOpen(false)}>Close</button>
            </div>
            <div className={styles.graphStage}>
              {graph.nodes.length === 0 ? (
                <p className={styles.graphEmpty}>No <code>[[links]]</code> to your notes yet.</p>
              ) : (
                <WebCanvas
                  nodes={graph.nodes}
                  edges={graph.edges}
                  selectedId={null}
                  linking={false}
                  linkSource={null}
                  displayName={(n) => n.label}
                  nodeColor={(n) => KIND_COLOR[graph.kinds.get(n.id) ?? "note"]}
                  nodePortrait={() => null}
                  onSelect={() => {}}
                  onMoveNode={(id, x, y) => setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }))}
                  onNodeActivate={(id) => openSource(graph.kinds.get(id) ?? "note", id)}
                />
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
