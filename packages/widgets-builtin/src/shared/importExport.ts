// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Shared import/export plumbing for JSON-backed collection widgets (NPC Library,
// Bestiary, Rule Cards, ...): a save-dialog export helper, a validated JSON parser,
// and a content-aware dedupe so re-importing the same pack (even under regenerated
// ids) gets flagged instead of silently duplicated.

/** Stable structural hash of a value - same content (any key order) hashes equal. */
export function hashContent(value: unknown): string {
  return simpleHash(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export interface DedupeResult<T> {
  /** Incoming items whose id matches an existing item. */
  idConflicts: T[];
  /** Incoming items (no id match) whose content hash matches an existing item. */
  contentDuplicates: T[];
  /** Incoming items with no id or content match - safe to add as-is. */
  clean: T[];
}

export function dedupe<T>(
  incoming: T[],
  existing: T[],
  opts: { idOf: (item: T) => string; contentKeyOf: (item: T) => string },
): DedupeResult<T> {
  // Seed the seen-sets from existing, then fold each accepted "clean" item back
  // in as we go, so duplicates *within* the same import file are caught too -
  // otherwise two entries in one file sharing an id both land in `clean` and get
  // added with the same id (aliased edit/delete, duplicate React keys).
  const seenIds = new Set(existing.map(opts.idOf));
  const seenContentKeys = new Set(existing.map(opts.contentKeyOf));
  const idConflicts: T[] = [];
  const contentDuplicates: T[] = [];
  const clean: T[] = [];
  for (const item of incoming) {
    const id = opts.idOf(item);
    const contentKey = opts.contentKeyOf(item);
    if (seenIds.has(id)) idConflicts.push(item);
    else if (seenContentKeys.has(contentKey)) contentDuplicates.push(item);
    else {
      clean.push(item);
      seenIds.add(id);
      seenContentKeys.add(contentKey);
    }
  }
  return { idConflicts, contentDuplicates, clean };
}

/** Parse an import file's text as JSON, then hand it to a widget-specific validator. */
export function parseImportFile<T>(text: string, validate: (parsed: unknown) => T | null): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  try {
    return validate(parsed);
  } catch {
    return null;
  }
}

/** Serialize a payload and hand it to the native save dialog. */
export async function exportCollection(
  saveTextFile: (content: string, defaultName: string) => Promise<boolean>,
  payload: unknown,
  filename: string,
): Promise<boolean> {
  return saveTextFile(JSON.stringify(payload, null, 2), filename);
}
