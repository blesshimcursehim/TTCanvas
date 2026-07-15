// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { ParsedNpc } from "./types";

// ── JSON (new format) ──────────────────────────────────────────────────────

export function parseNpcJson(filename: string, raw: string): ParsedNpc {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return makeBlankNpc(filename);
    if (typeof obj.name !== "string" || !obj.name.trim()) return makeBlankNpc(filename);
    // ensure id is always a valid string - older files may lack one
    if (typeof obj.id !== "string" || !obj.id) obj.id = crypto.randomUUID();
    // migrate legacy faction field (pre-50a)
    if (obj.faction !== undefined && !obj.customFields) {
      obj.customFields = [{ label: "Faction", value: obj.faction }];
      delete obj.faction;
    }
    // migrate intermediate customLabel/customValue (50a first pass)
    if (obj.customValue !== undefined && !obj.customFields) {
      obj.customFields = [{ label: obj.customLabel || "Faction", value: obj.customValue }];
      delete obj.customLabel;
      delete obj.customValue;
    }
    return { ...obj, filename };
  } catch {
    return makeBlankNpc(filename);
  }
}

export function serializeNpcJson(npc: ParsedNpc): string {
  const { filename: _f, ...rest } = npc;
  return JSON.stringify(rest, null, 2);
}

// ── .md migration (legacy format) ─────────────────────────────────────────

export function parseLegacyMd(filename: string, content: string): ParsedNpc {
  const parts = content.split(/^---$/m);
  const fields: Record<string, string> = {};
  let bio: string;

  if (parts.length >= 3) {
    for (const line of parts[1].trim().split("\n")) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    bio = parts.slice(2).join("---").trim();
  } else {
    bio = content.trim();
  }

  const slug = filename.split("/").pop()?.replace(/\.md$/, "") ?? "npc";
  const name = fields.name ?? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return {
    filename: mdFilenameToJson(filename),
    id: crypto.randomUUID(),
    name,
    race: fields.race ?? "",
    occupation: fields.role ?? fields.occupation ?? "",
    age: Number(fields.age) || undefined,
    tags: fields.tags ? fields.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    notes: bio || undefined,
    trait: fields.trait || undefined,
    hook: fields.hook || undefined,
    voice: fields.voice || undefined,
    relationship: (fields.relationship as ParsedNpc["relationship"]) || undefined,
  };
}

// ── Filename helpers ───────────────────────────────────────────────────────

export function nameToFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `npcs/${slug || "npc"}.json`;
}

export function mdFilenameToJson(mdFilename: string): string {
  return mdFilename.replace(/\.md$/, ".json");
}

export function slugFromFilename(filename: string): string {
  return filename.split("/").pop()?.replace(/\.(json|md)$/, "") ?? filename;
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function makeBlankNpc(filename: string): ParsedNpc {
  return {
    filename,
    id: crypto.randomUUID(),
    name: slugFromFilename(filename).split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    race: "",
    occupation: "",
  };
}

export const ACCENT_PRESETS = [
  "oklch(0.80 0.115 78)",   // amber
  "oklch(0.72 0.155 290)",  // plum
  "oklch(0.74 0.13 145)",   // moss
  "oklch(0.72 0.155 22)",   // red
  "oklch(0.74 0.13 195)",   // teal
  "oklch(0.72 0.04 258)",   // ink
] as const;

export function autoAccentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return ACCENT_PRESETS[Math.abs(hash) % ACCENT_PRESETS.length];
}

export function npcInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
