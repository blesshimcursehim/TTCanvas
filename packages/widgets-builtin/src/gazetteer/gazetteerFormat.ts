// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { GazetteerLocation, LinkedEntity, LocationKind } from "./types";
import { KIND_ORDER } from "./types";

const KIND_SET = new Set<LocationKind>(KIND_ORDER);

/** Parse one location JSON file defensively: a corrupt or hand-edited file yields a usable blank
 * rather than throwing, and a missing id is backfilled so identity is always stable. */
export function parseLocationJson(filename: string, raw: string): GazetteerLocation {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return makeBlankLocation(filename);
    if (typeof obj.name !== "string" || !obj.name.trim()) return makeBlankLocation(filename);
    const kind: LocationKind = KIND_SET.has(obj.kind) ? obj.kind : "poi";
    const links: LinkedEntity[] = Array.isArray(obj.links)
      ? obj.links.flatMap((l: unknown) => (isLinkedEntity(l) ? [l] : []))
      : [];
    return {
      filename,
      id: typeof obj.id === "string" && obj.id ? obj.id : crypto.randomUUID(),
      name: obj.name,
      kind,
      customKind: typeof obj.customKind === "string" ? obj.customKind : undefined,
      parentId: typeof obj.parentId === "string" ? obj.parentId : null,
      summary: typeof obj.summary === "string" ? obj.summary : undefined,
      body: typeof obj.body === "string" ? obj.body : undefined,
      playerBlurb: typeof obj.playerBlurb === "string" ? obj.playerBlurb : undefined,
      imagePath: typeof obj.imagePath === "string" ? obj.imagePath : undefined,
      links,
    };
  } catch {
    return makeBlankLocation(filename);
  }
}

function isLinkedEntity(l: unknown): l is LinkedEntity {
  if (!l || typeof l !== "object") return false;
  const e = l as Record<string, unknown>;
  return (e.kind === "npc" || e.kind === "faction")
    && (e.ref === null || typeof e.ref === "string")
    && typeof e.label === "string";
}

/** Serialize a location for the vault, dropping the transient `filename`. */
export function serializeLocationJson(loc: GazetteerLocation): string {
  const { filename: _f, ...rest } = loc;
  return JSON.stringify(rest, null, 2);
}

/** Slugify a name into a vault path under `locations/`. */
export function nameToFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `locations/${slug || "place"}.json`;
}

export function slugFromFilename(filename: string): string {
  return filename.split("/").pop()?.replace(/\.json$/, "") ?? filename;
}

/** A blank place named from its filename, used as the fallback for unreadable files. */
export function makeBlankLocation(filename: string, kind: LocationKind = "poi"): GazetteerLocation {
  const name = slugFromFilename(filename)
    .split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { filename, id: crypto.randomUUID(), name, kind, parentId: null, links: [] };
}
