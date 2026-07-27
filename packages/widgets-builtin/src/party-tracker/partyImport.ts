// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { AbilityScores, NamedEntry, PCCurrency, SpellcastingBlock, SpellSlots } from "@ttcanvas/core";
import type { PartyMember, CustomField, DeathSaves } from "./types";
import { hashContent } from "../shared/importExport";

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;

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
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Sheet fields the UI calls .map()/.includes() on directly (PCSheetModal, NPCSheetModal) - a
// non-array survivor of the ...m spread would crash the first render that touches it. Anything
// that isn't an array is dropped (undefined) rather than coerced, matching partyMemberSchema's
// treatment of a field it can't make sense of.
const toStrArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

const toNamedEntryArray = (v: unknown): NamedEntry[] | undefined =>
  Array.isArray(v)
    ? v.flatMap((e: unknown): NamedEntry[] => {
        if (!isPlainObject(e) || typeof e.name !== "string" || typeof e.description !== "string") return [];
        return [{ name: e.name, description: e.description }];
      })
    : undefined;

const toSkills = (v: unknown): Record<string, number> | undefined => {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
};

// Per-field defaults (10, the +0-modifier baseline), mirroring abilityScoresSchema in
// src/widgets/stateSchemas.ts - the render-time schema this data will hit next.
const toAbilityScores = (v: unknown): AbilityScores | undefined => {
  if (v === undefined) return undefined;
  const a = isPlainObject(v) ? v : {};
  return {
    str: toNum(a.str, 10), dex: toNum(a.dex, 10), con: toNum(a.con, 10),
    int: toNum(a.int, 10), wis: toNum(a.wis, 10), cha: toNum(a.cha, 10),
  };
};

const toCurrency = (v: unknown): PCCurrency | undefined => {
  if (v === undefined) return undefined;
  const c = isPlainObject(v) ? v : {};
  return { cp: toNum(c.cp, 0), sp: toNum(c.sp, 0), ep: toNum(c.ep, 0), gp: toNum(c.gp, 0), pp: toNum(c.pp, 0) };
};

const toDeathSaves = (v: unknown): DeathSaves | undefined => {
  if (v === undefined) return undefined;
  const d = isPlainObject(v) ? v : {};
  return { successes: toNum(d.successes, 0), failures: toNum(d.failures, 0) };
};

const toSlots = (v: unknown): SpellSlots | undefined => {
  if (!isPlainObject(v)) return undefined;
  const out: SpellSlots = {};
  for (const [k, val] of Object.entries(v)) {
    const level = Number(k);
    if (!Number.isFinite(level) || !isPlainObject(val)) continue;
    out[level] = { total: toNum(val.total, 0), used: toNum(val.used, 0) };
  }
  return out;
};

const toSpellcasting = (v: unknown): SpellcastingBlock | undefined => {
  if (v === undefined) return undefined;
  const s = isPlainObject(v) ? v : {};
  const ability = (ABILITY_KEYS as readonly string[]).includes(s.ability as string)
    ? (s.ability as SpellcastingBlock["ability"])
    : "int";
  const spells = Array.isArray(s.spells)
    ? s.spells.flatMap((sp: unknown) => {
        if (!isPlainObject(sp) || typeof sp.name !== "string" || typeof sp.level !== "number") return [];
        return [{
          level: sp.level,
          name: sp.name,
          ...(typeof sp.prepared === "boolean" ? { prepared: sp.prepared } : {}),
        }];
      })
    : undefined;
  const slots = toSlots(s.slots);
  return {
    ability,
    ...(typeof s.saveDC === "number" ? { saveDC: s.saveDC } : {}),
    ...(typeof s.attackBonus === "number" ? { attackBonus: s.attackBonus } : {}),
    ...(slots ? { slots } : {}),
    ...(spells ? { spells } : {}),
  };
};

/**
 * Coerces one imported member into a safe `PartyMember`. Import data is
 * untrusted - a shared file or a hand-edited export - and the Manage-Party modal
 * and PC sheet render it directly, before the widget's zod parse runs on save
 * (and even that only declares `abilityScores`, `.passthrough()`-ing the rest),
 * so a field of the wrong type would crash a consumer (e.g. a numeric
 * `portraitPath` on `.split()`, or a non-array `equipment`/`savingThrows`/
 * `spellcasting.spells` on the `.map()`/`.includes()` calls the sheet makes on
 * them). Requires a real id + non-empty name (returns null otherwise, so the
 * member is dropped), coerces the known scalar fields to the same defaults
 * `partyMemberSchema` uses, and hard-guards every nested field the sheet
 * touches: arrays are filtered to well-shaped elements (or dropped entirely if
 * not an array), objects are rebuilt field-by-field, anything else is dropped.
 * Unrecognised extra keys still pass through unchanged.
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

  const abilityScores = toAbilityScores(m.abilityScores);
  const savingThrows = toStrArray(m.savingThrows);
  const skills = toSkills(m.skills);
  const spellcasting = toSpellcasting(m.spellcasting);
  const equipment = toStrArray(m.equipment);
  const currency = toCurrency(m.currency);
  const features = toNamedEntryArray(m.features);
  const traits = toNamedEntryArray(m.traits);
  const reactions = toNamedEntryArray(m.reactions);
  const deathSaves = toDeathSaves(m.deathSaves);

  return {
    // Preserve any unrecognised extra keys, matching partyMemberSchema's
    // .passthrough(); every field the sheet actually touches is guarded below.
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
    abilityScores,
    savingThrows,
    skills,
    spellcasting,
    equipment,
    currency,
    features,
    traits,
    reactions,
    deathSaves,
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
