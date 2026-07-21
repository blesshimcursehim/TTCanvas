// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { PartyMember, CustomField } from "./types";
import { hashContent } from "../shared/importExport";

/**
 * Content key for de-duplicating imported party members. Ignores the id so that
 * re-importing the same character under a regenerated id is still recognised as
 * a duplicate rather than added twice.
 */
export const partyMemberContentKey = (m: PartyMember): string => hashContent({ ...m, id: "" });

const toStr = (v: unknown, dflt: string): string => (typeof v === "string" ? v : dflt);
const toNum = (v: unknown, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : dflt;
const toBool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);
const optStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Coerces one imported member into a safe `PartyMember`. Import data is
 * untrusted - a shared file or a hand-edited export - and the Manage-Party modal
 * renders it directly, before the widget's zod parse runs on save, so a field of
 * the wrong type would crash a consumer (e.g. a numeric `portraitPath` on
 * `.split()`). Requires a real id + non-empty name (returns null otherwise, so
 * the member is dropped), coerces the known scalar fields to the same defaults
 * `partyMemberSchema` uses, and hard-guards the fields the UI calls methods on:
 * the portrait paths (string or null) and `customFields` (array of
 * `{ label, value }`). Remaining optional sheet fields pass through unchanged,
 * matching that schema's `.passthrough()`.
 */
export function normalizeMember(raw: unknown): PartyMember | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.name !== "string" || !m.name.trim()) return null;

  const customFields = Array.isArray(m.customFields)
    ? m.customFields.flatMap((f: unknown): CustomField[] => {
        if (!f || typeof f !== "object") return [];
        const field = f as Record<string, unknown>;
        return [{ label: toStr(field.label, ""), value: toStr(field.value, "") }];
      })
    : undefined;

  return {
    // Preserve optional sheet fields (abilityScores, spellcasting, ...) the way
    // partyMemberSchema's .passthrough() does; the guards below override the
    // fields the UI touches directly.
    ...m,
    id: m.id,
    name: m.name,
    race: toStr(m.race, ""),
    cls: toStr(m.cls, ""),
    level: toNum(m.level, 1),
    sp: toNum(m.sp, 0),
    maxSp: toNum(m.maxSp, 0),
    pp: toNum(m.pp, 10),
    gp: toNum(m.gp, 0),
    notes: toStr(m.notes, ""),
    inspiration: toBool(m.inspiration, false),
    ac: toNum(m.ac, 10),
    hp: toNum(m.hp, 0),
    maxHp: toNum(m.maxHp, 0),
    initiative: toNum(m.initiative, 0),
    portraitPath: optStr(m.portraitPath),
    portraitFullPath: optStr(m.portraitFullPath),
    customFields,
  } as PartyMember;
}

/**
 * Validates a party export bundle's `members` array, returning every member that
 * normalises to a safe shape (invalid ones dropped). Returns null only when the
 * bundle has no `members` array at all; the caller treats an empty result (a
 * file whose members were all invalid) as an import error rather than a silent
 * no-op. The `type`/`version` envelope is gated separately by `readBundle`.
 */
export function validatePartyBundle(parsed: unknown): PartyMember[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (!Array.isArray(bundle.members)) return null;
  return bundle.members.flatMap((m: unknown): PartyMember[] => {
    const norm = normalizeMember(m);
    return norm ? [norm] : [];
  });
}
