// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Shared history builder, extracted from RollTables.tsx for the same reason as
// dice-roller/rollEntry.ts: App.tsx also writes into this widget's log (the Inventory widget's
// "Roll loot" goes through RollTablesContext), and two copies of the mapping would drift.

import type { ResolvedRoll } from "./engine";
import type { RollTable, RollHistoryItem } from "./types";

/** How many past results the roll log keeps. Older pulls fall off the end. */
export const HISTORY_CAP = 50;

/**
 * Turn one click's worth of resolved rolls into history items. Every result from a single click
 * shares the caller's `at`, so the roll view can group "this pull" apart from older history - which
 * is why the timestamp is a parameter rather than read from the clock in here.
 */
export function buildRollHistoryItems(table: RollTable, results: ResolvedRoll[], at: number): RollHistoryItem[] {
  return results.map((r) => ({
    id: crypto.randomUUID(),
    tableId: table.id,
    tableName: table.name,
    roll: r.steps[0]?.roll ?? 0,
    text: r.text || "(empty entry)",
    note: r.note,
    chain: r.steps.length > 1 ? r.steps.map((s) => s.tableName).join(" → ") : undefined,
    at,
  }));
}
