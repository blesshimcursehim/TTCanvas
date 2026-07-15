// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure link-index over a vault corpus. Backs the Session Notes backlinks panel and the link graph.
// A `[[wikilink]]` targets a NOTE by basename (the resolution App.tsx uses when opening one), but the
// *sources* of links can be notes, NPC Library notes, or Gazetteer place bodies - so opening a note
// shows everything across the vault that mentions it.

// Same shape the markdown renderer matches for rendering; kept here for the reverse index. Global so
// a line with several links yields them all.
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** The target names referenced by `[[...]]` in a body, in order, honouring `[[target|alias]]`. */
export function extractWikilinkTargets(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const raw = m[1];
    const pipe = raw.indexOf("|");
    const target = (pipe >= 0 ? raw.slice(0, pipe) : raw).trim();
    if (target) out.push(target);
  }
  return out;
}

/** Normalise a note name or link target to a match key: lowercased basename without a `.md`. */
export function linkKey(nameOrTarget: string): string {
  const base = nameOrTarget.split("/").pop() ?? nameOrTarget;
  return base.replace(/\.md$/i, "").trim().toLowerCase();
}

/** A linkable entity kind. Notes are the only *backlink* targets (they carry `targetKey`); the rest are
 * forward-resolution targets for cross-entity `[[links]]`: NPCs, Gazetteer places, Bestiary creatures,
 * Rule Cards, and Rules Reference files. */
export type SourceKind = "note" | "npc" | "place" | "creature" | "card" | "rule";

/** Bare-name resolution precedence: an explicit note wins, then world entities, then reference material.
 * A `kind:` prefix overrides this. Kept in one place so the parser and resolver never drift. */
export const RESOLVE_PRECEDENCE = ["note", "place", "npc", "creature", "rule", "card"] as const;

/** A body that may contain `[[links]]`: a note, an NPC's notes, or a place's body. `ref` is its unique
 * id and how to open it (note path, or `npcs/x.json` / `locations/x.json`); `targetKey` is set only
 * for notes, since only notes can be linked to. */
export interface SourceDoc {
  kind: SourceKind;
  ref: string;
  label: string;
  text: string;
  targetKey?: string;
}

/** One source that links to a target note, with the trimmed source line(s) the link appears on. */
export interface Backlink {
  kind: SourceKind;
  ref: string;
  label: string;
  contexts: string[];
}

/** Map each note key -> the sources that link to it (with context). A note linking to itself is
 * dropped; NPC/place sources can never self-link since they are not targets. */
export function buildBacklinkIndex(docs: SourceDoc[]): Map<string, Backlink[]> {
  const index = new Map<string, Backlink[]>();
  for (const doc of docs) {
    // A source may reference the same target on several lines - collect the context per target.
    const contextsByTarget = new Map<string, string[]>();
    for (const line of doc.text.split("\n")) {
      for (const target of extractWikilinkTargets(line)) {
        const key = linkKey(target);
        if (key === doc.targetKey) continue; // a note linking to itself
        const bucket = contextsByTarget.get(key);
        const context = line.trim();
        if (bucket) { if (context && !bucket.includes(context)) bucket.push(context); }
        else contextsByTarget.set(key, context ? [context] : []);
      }
    }
    for (const [key, contexts] of contextsByTarget) {
      const entry: Backlink = { kind: doc.kind, ref: doc.ref, label: doc.label, contexts };
      const bucket = index.get(key);
      if (bucket) bucket.push(entry);
      else index.set(key, [entry]);
    }
  }
  return index;
}

export interface LinkGraphNode { id: string; label: string; kind: SourceKind }
export interface LinkGraphEdge { from: string; to: string }

/** Sources and the notes they link to, as a graph. An edge is a resolved `[[link]]` (target must be a
 * note); dangling and self-links are dropped, duplicate edges collapsed. Only refs that take part in
 * an edge become nodes - isolated notes and entities are left out so the web reads cleanly. */
export function linkGraph(docs: SourceDoc[]): { nodes: LinkGraphNode[]; edges: LinkGraphEdge[] } {
  const noteByKey = new Map<string, SourceDoc>();
  for (const d of docs) if (d.targetKey) noteByKey.set(d.targetKey, d);
  const metaByRef = new Map(docs.map((d) => [d.ref, d]));
  const seen = new Set<string>();
  const usedRefs = new Set<string>();
  const edges: LinkGraphEdge[] = [];
  for (const doc of docs) {
    for (const target of extractWikilinkTargets(doc.text)) {
      const dest = noteByKey.get(linkKey(target));
      if (!dest || dest.ref === doc.ref) continue; // dangling or self-link
      const id = `${doc.ref}\n${dest.ref}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({ from: doc.ref, to: dest.ref });
      usedRefs.add(doc.ref);
      usedRefs.add(dest.ref);
    }
  }
  const nodes = [...usedRefs].map((ref) => {
    const d = metaByRef.get(ref);
    return { id: ref, label: d?.label ?? ref, kind: d?.kind ?? "note" };
  });
  return { nodes, edges };
}

/** The display label for a note path: its basename without the `.md`. */
export function basenameLabel(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** A linkable target: a note, a Gazetteer place, or an NPC, named for `[[wikilink]]` resolution. */
export interface ResolveEntry {
  kind: SourceKind;
  ref: string;   // how to open it: note path, or npcs/x.json / locations/x.json
  name: string;  // the display name a link matches against
}

/** One name can match up to one of each kind (a note, a place and an NPC could share a name). */
export type ResolveIndex = Map<string, Partial<Record<SourceKind, string>>>;

/** Build a name-key -> {kind: ref} map for forward `[[Name]]` resolution. The first entry of a kind
 * wins (stable), and each kind is kept separately so a `place:`/`npc:` prefix can force past the
 * bare-name precedence. */
export function buildResolveIndex(entries: ResolveEntry[]): ResolveIndex {
  const map: ResolveIndex = new Map();
  for (const e of entries) {
    const key = linkKey(e.name);
    if (!key) continue;
    const bucket = map.get(key) ?? {};
    if (!bucket[e.kind]) bucket[e.kind] = e.ref;
    map.set(key, bucket);
  }
  return map;
}

/** Parse a link target's optional kind prefix, e.g. `[[place:The Cage]]` / `[[npc:Vex]]` /
 * `[[creature:Goblin]]` / `[[card:Fireball]]` / `[[rule:Grappled]]` / `[[note:Vex]]`. A colon is used
 * (not a slash) so it never clashes with a subfolder note path like `arc/Session 12`. */
export function parseLinkTarget(raw: string): { forceKind?: SourceKind; name: string } {
  const m = /^(note|place|npc|creature|card|rule):(.+)$/i.exec(raw.trim());
  return m ? { forceKind: m[1].toLowerCase() as SourceKind, name: m[2].trim() } : { name: raw.trim() };
}

/** Resolve a raw `[[target]]` against the index. A `kind:` prefix forces that kind; a bare name uses
 * `RESOLVE_PRECEDENCE`. Returns null if nothing matches. */
export function resolveLink(index: ResolveIndex, raw: string): { kind: SourceKind; ref: string } | null {
  const { forceKind, name } = parseLinkTarget(raw);
  const bucket = index.get(linkKey(name));
  if (!bucket) return null;
  if (forceKind) return bucket[forceKind] ? { kind: forceKind, ref: bucket[forceKind]! } : null;
  for (const kind of RESOLVE_PRECEDENCE) {
    if (bucket[kind]) return { kind, ref: bucket[kind]! };
  }
  return null;
}
