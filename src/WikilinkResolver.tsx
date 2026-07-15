// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useMemo, useState } from "react";
import { useVault } from "@ttcanvas/core";
import { buildResolveIndex, resolveLink, basenameLabel, type ResolveEntry } from "@ttcanvas/widgets-builtin";

/** A named entity that lives in a widget's state rather than a vault file (Bestiary creatures, Rule
 * Cards). `ref` is its stable id; the widget selects it when opened. */
export interface NamedRef {
  ref: string;
  name: string;
}

interface Props {
  /** The Session Notes folder, so notes are resolvable targets; null when none is chosen. */
  notesFolder: string | null;
  /** The Rules Reference folder, so rule files are resolvable targets; null when none is chosen. */
  rulesFolder: string | null;
  /** Bestiary creatures and Rule Cards, indexed by their in-state id. */
  creatures: NamedRef[];
  cards: NamedRef[];
  onOpenNote: (filename: string) => void;
  onOpenNpc: (filename: string) => void;
  onOpenPlace: (filename: string) => void;
  onOpenRule: (filename: string) => void;
  onOpenCreature: (id: string) => void;
  onOpenCard: (id: string) => void;
}

/**
 * Resolves cross-entity `[[wikilinks]]` fired from entity bodies (Gazetteer places, NPC notes) via the
 * `ttcanvas:open-entity-link` event. A name resolves to a note, place, NPC, Bestiary creature, Rule
 * Card or Rules Reference file (a `kind:` prefix forces one; bare names use RESOLVE_PRECEDENCE) and the
 * matching open handler is called.
 *
 * Lives inside VaultProvider - App creates the provider so it cannot read the vault itself, but this
 * child can. Session Notes' own `[[links]]` stay note-only and never reach here (they use the separate
 * `ttcanvas:open-wikilink` channel); this keeps external/Obsidian notes from linking into TTCanvas.
 */
export function WikilinkResolver({
  notesFolder, rulesFolder, creatures, cards,
  onOpenNote, onOpenNpc, onOpenPlace, onOpenRule, onOpenCreature, onOpenCard,
}: Props) {
  // Depend on the individual vault methods (each useCallback-stable) and vaultVersion, NOT the whole
  // vault object - its context value is a fresh object every render, which would otherwise re-read the
  // whole vault on any app update.
  const { readFile, listFiles, listFolderFiles, vaultVersion } = useVault();

  // The disk-backed targets (notes, rule files, NPC/place JSON) are re-read only when the vault or a
  // folder changes - not when a creature or card is edited. The state-backed entities are cheap to fold
  // in below, so this expensive read stays off the hot path.
  const [vaultEntries, setVaultEntries] = useState<ResolveEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    const readName = async (ref: string): Promise<string> => {
      try {
        const obj = JSON.parse(await readFile(ref));
        return typeof obj?.name === "string" && obj.name.trim() ? obj.name as string : basenameLabel(ref);
      } catch { return basenameLabel(ref); }
    };
    const folderEntries = async (folder: string | null, kind: "note" | "rule"): Promise<ResolveEntry[]> => {
      if (!folder) return [];
      try {
        return (await listFolderFiles(folder, "md")).map((path) => ({ kind, ref: path, name: basenameLabel(path) }));
      } catch { return []; }
    };
    (async () => {
      const entries: ResolveEntry[] = [
        ...await folderEntries(notesFolder, "note"),
        ...await folderEntries(rulesFolder, "rule"),
      ];
      try {
        const json = await listFiles("json");
        for (const ref of json.filter((f) => f.startsWith("npcs/"))) entries.push({ kind: "npc", ref, name: await readName(ref) });
        for (const ref of json.filter((f) => f.startsWith("locations/"))) entries.push({ kind: "place", ref, name: await readName(ref) });
      } catch { /* no vault entities */ }
      if (!cancelled) setVaultEntries(entries);
    })();
    return () => { cancelled = true; };
  }, [notesFolder, rulesFolder, readFile, listFiles, listFolderFiles, vaultVersion]);

  // Fold the in-memory creatures and cards into the index; buildResolveIndex is pure and cheap, so a
  // creature edit only rebuilds this map, never touches the vault.
  const index = useMemo(() => buildResolveIndex([
    ...vaultEntries,
    ...creatures.map((c) => ({ kind: "creature" as const, ref: c.ref, name: c.name })),
    ...cards.map((c) => ({ kind: "card" as const, ref: c.ref, name: c.name })),
  ]), [vaultEntries, creatures, cards]);

  useEffect(() => {
    const handler = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name;
      if (!name) return;
      const hit = resolveLink(index, name);
      if (hit?.kind === "npc") onOpenNpc(hit.ref);
      else if (hit?.kind === "place") onOpenPlace(hit.ref);
      else if (hit?.kind === "creature") onOpenCreature(hit.ref);
      else if (hit?.kind === "card") onOpenCard(hit.ref);
      else if (hit?.kind === "rule") onOpenRule(hit.ref);
      else if (hit?.kind === "note") onOpenNote(hit.ref);
      // Unresolved bare name: fall back to opening a note by that name (may be one you'll create). A
      // prefixed target that matched nothing resolves to null and is deliberately left alone.
      else if (!/^(place|npc|creature|card|rule):/i.test(name.trim())) onOpenNote(name.endsWith(".md") ? name : `${name}.md`);
    };
    window.addEventListener("ttcanvas:open-entity-link", handler);
    return () => window.removeEventListener("ttcanvas:open-entity-link", handler);
  }, [index, onOpenNote, onOpenNpc, onOpenPlace, onOpenRule, onOpenCreature, onOpenCard]);

  return null;
}
