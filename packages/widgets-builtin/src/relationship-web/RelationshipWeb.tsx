// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVault, useParty, useNpcs, type NpcRef } from "@ttcanvas/core";
import { autoAccentColor } from "../npc-library/npcFormat";
import { ConfirmDeleteButton as SharedConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { mimeForImageExt } from "../shared/mime";
import type { RelationshipWebState, RelNode, RelEdge, NodeKind, EdgeType } from "./types";
import { EDGE_TYPES } from "./types";
import { relaxLayout, seedPosition } from "./layout";
import { WebCanvas } from "./WebCanvas";
import styles from "./RelationshipWeb.module.css";

interface Props {
  state: RelationshipWebState;
  onChange: (state: RelationshipWebState) => void;
}

const FACTION_COLOR = "oklch(0.62 0.13 290)";

export function RelationshipWeb({ state, onChange }: Props) {
  const vault = useVault();
  const { members } = useParty();
  const { npcs } = useNpcs();
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);

  const npcByFile = useMemo(() => new Map(npcs.map((n) => [n.filename, n])), [npcs]);
  const partyById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  function displayName(node: RelNode): string {
    if (node.kind === "npc") return npcByFile.get(node.ref ?? "")?.name ?? node.label;
    if (node.kind === "pc") return partyById.get(node.ref ?? "")?.name ?? node.label;
    return node.label;
  }

  // The vault-relative portrait path for a linked node, or null (free-standing / no portrait set).
  function portraitPathOf(node: RelNode): string | null {
    if (node.kind === "npc") return npcByFile.get(node.ref ?? "")?.portrait ?? null;
    if (node.kind === "pc") return partyById.get(node.ref ?? "")?.portraitPath ?? null;
    return null;
  }

  function nodeColor(node: RelNode): string {
    if (node.kind === "faction" || node.kind === "custom") return node.color ?? FACTION_COLOR;
    return autoAccentColor(displayName(node));
  }

  // Portrait data-URLs, keyed by vault path so the same portrait loads once. loadedRef dedupes
  // fetches across re-renders (mirrors NpcLibrary's Avatar). We guard the setState with a mount ref
  // rather than a per-effect cancel flag: a per-effect cancel would drop an in-flight load when a
  // second node is added mid-fetch, yet loadedRef would stop it ever retrying.
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const loadedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  // Set true in setup (not just useRef's initial value) so a StrictMode unmount/remount - which runs
  // the cleanup then re-runs setup - restores it; otherwise mountedRef stays false and every async
  // portrait load is dropped by the guard below.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    for (const n of state.nodes) {
      const path = portraitPathOf(n);
      if (!path || loadedRef.current.has(path)) continue;
      loadedRef.current.add(path);
      void loadPortrait(path).then((src) => {
        if (src && mountedRef.current) setPortraits((prev) => ({ ...prev, [path]: src }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nodes, npcByFile, partyById, vault.vaultPath]);

  async function loadPortrait(path: string): Promise<string | null> {
    if (path.startsWith("data:")) return path; // Bestiary-style inline portraits: use as-is.
    if (!vault.vaultPath) return null;
    try {
      const fileName = path.split("/").pop()!;
      const b64 = await vault.readFileBase64(`${vault.vaultPath}/portraits`, fileName);
      return `data:${mimeForImageExt(fileName)};base64,${b64}`;
    } catch { return null; }
  }

  function nodePortrait(node: RelNode): string | null {
    const p = portraitPathOf(node);
    return p ? portraits[p] ?? null : null;
  }

  // ── State ops ──
  function addNode(kind: NodeKind, ref: string | null, label: string) {
    // Linked nodes de-duplicate: select the existing one instead of adding a twin.
    if (ref) {
      const existing = state.nodes.find((n) => n.kind === kind && n.ref === ref);
      if (existing) { onChange({ ...state, selectedId: existing.id }); return; }
    }
    const pos = seedPosition(state.nodes.length);
    const node: RelNode = { id: crypto.randomUUID(), kind, ref, label, x: pos.x, y: pos.y };
    onChange({ ...state, nodes: [...state.nodes, node], selectedId: node.id });
  }

  function updateNode(id: string, patch: Partial<RelNode>) {
    onChange({ ...state, nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }

  function moveNode(id: string, x: number, y: number) {
    onChange({ ...state, nodes: state.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) });
  }

  function removeNode(id: string) {
    onChange({
      ...state,
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.from !== id && e.to !== id),
      selectedId: null,
    });
  }

  function addEdge(from: string, to: string, type: EdgeType) {
    const edge: RelEdge = { id: crypto.randomUUID(), from, to, type };
    onChange({ ...state, edges: [...state.edges, edge], selectedId: edge.id });
  }

  function updateEdge(id: string, patch: Partial<RelEdge>) {
    onChange({ ...state, edges: state.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }

  function removeEdge(id: string) {
    onChange({ ...state, edges: state.edges.filter((e) => e.id !== id), selectedId: null });
  }

  function tidy() {
    const relaxed = new Map(relaxLayout(state.nodes, state.edges).map((n) => [n.id, n]));
    onChange({ ...state, nodes: state.nodes.map((n) => ({ ...n, ...relaxed.get(n.id) })) });
  }

  function onNodeActivate(id: string) {
    if (!linking) { onChange({ ...state, selectedId: id }); return; }
    if (!linkSource) { setLinkSource(id); return; }
    if (linkSource !== id) addEdge(linkSource, id, "ally");
    setLinking(false);
    setLinkSource(null);
  }

  function toggleLink() {
    setLinking((v) => !v);
    setLinkSource(null);
  }

  const selectedNode = state.nodes.find((n) => n.id === state.selectedId) ?? null;
  const selectedEdge = state.edges.find((e) => e.id === state.selectedId) ?? null;

  // ── Render pieces ──
  const toolbar = (
    <div className={styles.toolbar}>
      <button className={styles.toolBtn} onClick={() => setShowAdd((v) => !v)} aria-pressed={showAdd}>+ Node</button>
      <button
        className={`${styles.toolBtn} ${linking ? styles.toolActive : ""}`}
        onClick={toggleLink}
        aria-pressed={linking}
        disabled={state.nodes.length < 2}
        title={state.nodes.length < 2 ? "Add two nodes first" : "Link two nodes"}
      >
        + Link
      </button>
      <button className={styles.toolBtn} onClick={tidy} disabled={state.nodes.length < 2} title="Auto-arrange the web">Tidy</button>
      <span className={styles.spacer} />
      <button
        className={styles.toolBtn}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Exit full screen" : "Open full screen"}
        aria-label={expanded ? "Exit full screen" : "Open full screen"}
      >
        {expanded ? "Exit" : "Expand"}
      </button>
    </div>
  );

  const addPanel = showAdd && (
    <AddPanel
      npcs={npcs}
      members={members}
      nodes={state.nodes}
      onAdd={addNode}
      onClose={() => setShowAdd(false)}
    />
  );

  // Resolve an edge endpoint's name, tolerating a dangling id (e.g. from loaded state) rather than
  // asserting non-null and crashing the render.
  function endpointName(id: string): string {
    const node = state.nodes.find((n) => n.id === id);
    return node ? displayName(node) : "(missing)";
  }

  const inspector = selectedNode ? (
    <NodeInspector node={selectedNode} name={displayName(selectedNode)} onUpdate={updateNode} onDelete={removeNode} onClose={() => onChange({ ...state, selectedId: null })} />
  ) : selectedEdge ? (
    <EdgeInspector
      edge={selectedEdge}
      fromName={endpointName(selectedEdge.from)}
      toName={endpointName(selectedEdge.to)}
      onUpdate={updateEdge}
      onDelete={removeEdge}
      onClose={() => onChange({ ...state, selectedId: null })}
    />
  ) : null;

  const stage = (
    <div className={styles.stage}>
      <WebCanvas
        nodes={state.nodes}
        edges={state.edges}
        selectedId={state.selectedId}
        linking={linking}
        linkSource={linkSource}
        displayName={displayName}
        nodeColor={nodeColor}
        nodePortrait={nodePortrait}
        onSelect={(id) => onChange({ ...state, selectedId: id })}
        onMoveNode={moveNode}
        onNodeActivate={onNodeActivate}
      />
      {state.nodes.length === 0 && (
        <div className={styles.empty}>
          <p>No one here yet.</p>
          <p className={styles.emptyHint}>Add NPCs, party members, or factions with <strong>+ Node</strong>, then <strong>+ Link</strong> them.</p>
        </div>
      )}
      {linking && <div className={styles.linkHint}>{linkSource ? "Click the second node to connect" : "Click the first node"}</div>}
      {addPanel}
      {inspector}
    </div>
  );

  const body = <>{toolbar}{stage}</>;

  if (expanded) {
    return createPortal(
      <div className={styles.scrim}>
        <div className={styles.fullWrap}>{body}</div>
      </div>,
      document.body,
    );
  }
  return <div className={styles.root}>{body}</div>;
}

// ── Add-node panel ──────────────────────────────────────────────

function AddPanel({ npcs, members, nodes, onAdd, onClose }: {
  npcs: NpcRef[];
  members: { id: string; name: string }[];
  nodes: RelNode[];
  onAdd: (kind: NodeKind, ref: string | null, label: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"npc" | "party" | "new">("npc");
  const [search, setSearch] = useState("");
  const [newKind, setNewKind] = useState<NodeKind>("faction");
  const [newLabel, setNewLabel] = useState("");

  const has = (kind: NodeKind, ref: string) => nodes.some((n) => n.kind === kind && n.ref === ref);
  const q = search.trim().toLowerCase();
  const npcList = npcs.filter((n) => !has("npc", n.filename) && (!q || n.name.toLowerCase().includes(q)));
  const partyList = members.filter((m) => !has("pc", m.id) && (!q || m.name.toLowerCase().includes(q)));

  function addNew() {
    const label = newLabel.trim();
    if (!label) return;
    onAdd(newKind, null, label);
    setNewLabel("");
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Add node</span>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === "npc" ? styles.tabActive : ""}`} onClick={() => setTab("npc")}>NPC</button>
        <button className={`${styles.tab} ${tab === "party" ? styles.tabActive : ""}`} onClick={() => setTab("party")}>Party</button>
        <button className={`${styles.tab} ${tab === "new" ? styles.tabActive : ""}`} onClick={() => setTab("new")}>Faction</button>
      </div>

      {tab === "new" ? (
        <div className={styles.newForm}>
          <div className={styles.kindRow}>
            <button className={`${styles.kindBtn} ${newKind === "faction" ? styles.kindActive : ""}`} onClick={() => setNewKind("faction")}>Faction</button>
            <button className={`${styles.kindBtn} ${newKind === "custom" ? styles.kindActive : ""}`} onClick={() => setNewKind("custom")}>Other</button>
          </div>
          <input
            className={styles.input}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addNew(); }}
            placeholder={newKind === "faction" ? "Thieves' Guild" : "Label"}
            aria-label="New node label"
            autoFocus
          />
          <button className={styles.addBtn} onClick={addNew} disabled={!newLabel.trim()}>Add</button>
        </div>
      ) : (
        <>
          <input className={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search entities" />
          <div className={styles.pickList}>
            {(tab === "npc" ? npcList : partyList).length === 0 && (
              <p className={styles.pickEmpty}>{tab === "npc" ? "No NPCs to add." : "No party members to add."}</p>
            )}
            {tab === "npc"
              ? npcList.map((n) => (
                  <button key={n.filename} className={styles.pickRow} onClick={() => onAdd("npc", n.filename, n.name)}>{n.name}</button>
                ))
              : partyList.map((m) => (
                  <button key={m.id} className={styles.pickRow} onClick={() => onAdd("pc", m.id, m.name)}>{m.name}</button>
                ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Inspectors ──────────────────────────────────────────────────

const KIND_LABEL: Record<NodeKind, string> = { npc: "NPC", pc: "Party", faction: "Faction", custom: "Other" };

/** A destructive button that first asks to confirm, so a node or link can't be wiped by a single
 * accidental click. Key it by the selected id at the call site so switching selection resets it. */
function ConfirmDeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <SharedConfirmDeleteButton
      confirming={confirming}
      trigger={label}
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

function NodeInspector({ node, name, onUpdate, onDelete, onClose }: {
  node: RelNode; name: string; onUpdate: (id: string, patch: Partial<RelNode>) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const linked = node.kind === "npc" || node.kind === "pc";
  return (
    <div className={`${styles.panel} ${styles.inspector}`}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>{KIND_LABEL[node.kind]}</span>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      {linked ? (
        <p className={styles.linkedName}>{name} <span className={styles.linkedNote}>(linked)</span></p>
      ) : (
        <input className={styles.input} value={node.label} onChange={(e) => onUpdate(node.id, { label: e.target.value })} placeholder="Label" aria-label="Node label" />
      )}
      <ConfirmDeleteButton key={node.id} label="Delete node" onConfirm={() => onDelete(node.id)} />
    </div>
  );
}

function EdgeInspector({ edge, fromName, toName, onUpdate, onDelete, onClose }: {
  edge: RelEdge; fromName: string; toName: string; onUpdate: (id: string, patch: Partial<RelEdge>) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  return (
    <div className={`${styles.panel} ${styles.inspector}`}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Link</span>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <p className={styles.edgeEnds}>{fromName} → {toName}</p>
      <label className={styles.fieldLabel}>Type</label>
      <select className={styles.select} value={edge.type} onChange={(e) => onUpdate(edge.id, { type: e.target.value as EdgeType })} aria-label="Link type">
        {(Object.keys(EDGE_TYPES) as EdgeType[]).map((t) => (
          <option key={t} value={t}>{EDGE_TYPES[t].label}</option>
        ))}
      </select>
      <input className={styles.input} value={edge.label ?? ""} onChange={(e) => onUpdate(edge.id, { label: e.target.value })} placeholder="Note (optional)" aria-label="Link note" />
      <ConfirmDeleteButton key={edge.id} label="Delete link" onConfirm={() => onDelete(edge.id)} />
    </div>
  );
}
