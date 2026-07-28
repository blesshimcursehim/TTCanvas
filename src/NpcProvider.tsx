// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { NpcContext, useVault, useToast, logWarn, logError, type NpcRef, type NpcContextValue } from "@ttcanvas/core";
import { parseNpcJson, npcMetaValue, type ParsedNpc } from "@ttcanvas/widgets-builtin";

/**
 * Scans `npcs/*.json` once and shares the result, so widgets that only need to *reference* NPCs
 * (Encounter Builder, Gazetteer, Relationship Web) don't each re-scan the vault.
 *
 * Lives here rather than in App.tsx because App *renders* VaultProvider and so cannot call
 * useVault(); the vault seam only exists one component down. App still provides it.
 *
 * NPC Library deliberately does not consume this: it needs the full ParsedNpc to edit, and it
 * owns the legacy .md -> .json migration. This provider does not run that migration - it would
 * race the library's writes. On a pre-JSON vault it simply sees fewer NPCs until the library has
 * run once, whose writes then bump vaultVersion and re-scan us. Self-healing.
 */
function toNpcRef(npc: ParsedNpc): NpcRef {
  return {
    filename: npc.filename,
    id: npc.id,
    name: npc.name,
    relationship: npc.relationship,
    portrait: npc.portrait,
    cr: npc.cr,
    hp: npc.hp,
    hpMax: npc.hpMax,
    hpFormula: npc.hpFormula,
    ac: npc.ac,
    abilityScores: npc.abilityScores,
    faction: npcMetaValue(npc, "faction"),
    location: npcMetaValue(npc, "location"),
    locationRef: npc.locationRef,
  };
}

export function NpcProvider({ children }: { children: ReactNode }) {
  const vault = useVault();
  const { showToast } = useToast();
  const [npcs, setNpcs] = useState<NpcRef[]>([]);
  const [loading, setLoading] = useState(true);

  const { vaultPath, vaultVersion, listFiles, readFile } = vault;
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    // A vault *switch* must drop the previous vault's NPCs immediately, before the new scan runs, so
    // consumers (Encounter Builder, Gazetteer, Relationship Web) can't offer a stale NPC and save a
    // cross-vault reference during the scan window. A same-vault re-scan (vaultVersion bump, e.g. the
    // NPC Library finishing a write) keeps the current list visible - no flicker.
    if (lastPathRef.current !== vaultPath) {
      lastPathRef.current = vaultPath;
      setNpcs([]);
    }
    if (!vaultPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const files = (await listFiles("json")).filter((f) => f.startsWith("npcs/"));
        const refs = await Promise.all(
          files.map(async (filename): Promise<NpcRef | null> => {
            // parseNpcJson never throws (it falls back to a blank NPC), so this only guards the read.
            try {
              return toNpcRef(parseNpcJson(filename, await readFile(filename)));
            } catch (err) {
              logWarn(`NpcProvider: failed to read NPC "${filename}"`, err);
              return null;
            }
          }),
        );
        if (!cancelled) {
          setNpcs(
            refs
              .filter((r): r is NpcRef => r !== null)
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } catch (err) {
        // A whole-scan failure (the listing itself) leaves the library looking empty - log it and
        // toast it, so a GM doesn't read "no NPCs" as "I haven't made any yet".
        logError("NpcProvider: failed to scan the NPC library", err);
        if (!cancelled) {
          setNpcs([]);
          showToast("Couldn't read the NPC library - it may show fewer NPCs than you have.", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Depends on the individual methods rather than `vault`: VaultProvider builds a fresh context
    // value every render, so depending on the object itself would re-scan the whole library on
    // every render - the bug the old per-widget scans had. Same idiom as Session Notes' loadList.
  }, [vaultPath, vaultVersion, listFiles, readFile, showToast]);

  const value = useMemo<NpcContextValue>(() => ({ npcs, loading }), [npcs, loading]);

  return <NpcContext.Provider value={value}>{children}</NpcContext.Provider>;
}
