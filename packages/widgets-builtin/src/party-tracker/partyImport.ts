// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { PartyMember } from "./types";
import { hashContent } from "../shared/importExport";

/**
 * Content key for de-duplicating imported party members. Ignores the id so that
 * re-importing the same character under a regenerated id is still recognised as
 * a duplicate rather than added twice.
 */
export const partyMemberContentKey = (m: PartyMember): string => hashContent({ ...m, id: "" });

/**
 * Validates a party export bundle's `members` array. Light validation to match
 * the other collection widgets: require a plain string id and a non-empty name,
 * pass the rest of the sheet through as-is. The `type`/`version` envelope is
 * gated separately by `readBundle`.
 */
export function validatePartyBundle(parsed: unknown): PartyMember[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const bundle = parsed as Record<string, unknown>;
  if (!Array.isArray(bundle.members)) return null;
  return bundle.members.flatMap((m: unknown): PartyMember[] => {
    if (!m || typeof m !== "object") return [];
    const mem = m as Record<string, unknown>;
    if (typeof mem.id !== "string" || typeof mem.name !== "string" || !mem.name.trim()) return [];
    return [mem as unknown as PartyMember];
  });
}
