// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { GazetteerContext, useVault, type GazetteerLocationRef, type GazetteerContextValue } from "@ttcanvas/core";
import { parseLocationJson, type GazetteerLocation } from "@ttcanvas/widgets-builtin";
import { logWarn, logError } from "./diagnostics/log";

/**
 * Scans `locations/*.json` once and shares the result, so widgets that only need to *reference*
 * places (Relationship Web, NPC Library) don't each re-scan the vault. Mirrors `NpcProvider.tsx`.
 *
 * Lives here rather than in App.tsx because App *renders* VaultProvider and so cannot call
 * useVault(); the vault seam only exists one component down. App still provides it.
 *
 * Gazetteer itself deliberately does not consume this: it needs the full `GazetteerLocation` to
 * edit, and this provider does not run any migration - it would race the widget's writes.
 */
function toGazetteerLocationRef(loc: GazetteerLocation): GazetteerLocationRef {
  return { filename: loc.filename, id: loc.id, name: loc.name, kind: loc.kind, links: loc.links };
}

export function GazetteerProvider({ children }: { children: ReactNode }) {
  const vault = useVault();
  const [locations, setLocations] = useState<GazetteerLocationRef[]>([]);
  const [loading, setLoading] = useState(true);

  const { vaultPath, vaultVersion, listFiles, readFile } = vault;
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    // A vault *switch* must drop the previous vault's locations immediately, before the new scan
    // runs, so consumers (Relationship Web, NPC Library) can't offer a stale place and save a
    // cross-vault reference during the scan window. A same-vault re-scan (vaultVersion bump, e.g.
    // Gazetteer finishing a write) keeps the current list visible - no flicker.
    if (lastPathRef.current !== vaultPath) {
      lastPathRef.current = vaultPath;
      setLocations([]);
    }
    if (!vaultPath) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const files = (await listFiles("json")).filter((f) => f.startsWith("locations/"));
        const refs = await Promise.all(
          files.map(async (filename): Promise<GazetteerLocationRef | null> => {
            try {
              return toGazetteerLocationRef(parseLocationJson(filename, await readFile(filename)));
            } catch (err) {
              logWarn(`GazetteerProvider: failed to read location "${filename}"`, err);
              return null;
            }
          }),
        );
        if (!cancelled) {
          setLocations(
            refs
              .filter((r): r is GazetteerLocationRef => r !== null)
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } catch (err) {
        logError("GazetteerProvider: failed to scan the Gazetteer", err);
        if (!cancelled) setLocations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Depends on the individual methods rather than `vault`: VaultProvider builds a fresh context
    // value every render, so depending on the object itself would re-scan on every render - the bug
    // the old per-widget scans had. Same idiom as NpcProvider.
  }, [vaultPath, vaultVersion, listFiles, readFile]);

  const value = useMemo<GazetteerContextValue>(() => ({ locations, loading }), [locations, loading]);

  return <GazetteerContext.Provider value={value}>{children}</GazetteerContext.Provider>;
}
