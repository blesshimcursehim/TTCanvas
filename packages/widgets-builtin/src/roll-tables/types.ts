// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface RollTableEntry {
  id: string;
  text: string;
  /** How many consecutive die values this entry covers. >= 1; default 1. */
  weight: number;
  /** Optional GM notes / description for this result (e.g. "roll twice", location detail). */
  note?: string;
  /** M2: id of another table to roll instead of returning `text`. */
  subtableId?: string;
}

export interface RollTable {
  id: string;
  name: string;
  /** Optional table-level description / how-to-use blurb. */
  description?: string;
  /**
   * Chosen die size (4, 6, 8, 10, 12, 20, 100, or a custom N). Presentational and the "clean" target -
   * the actual roll is always over the sum of entry weights, so a half-filled table is still valid.
   */
  die: number;
  /** M2: optional roll-count expression, e.g. "2d6", producing several results per roll. */
  count?: string;
  entries: RollTableEntry[];
}

export interface RollHistoryItem {
  id: string;
  tableId: string;
  tableName: string;
  /** The value rolled (1..sum of weights). */
  roll: number;
  text: string;
  /** Snapshot of the entry's note at roll time, if any. */
  note?: string;
  /** Table names traversed to reach this result, when it came via one or more subtable links. */
  chain?: string;
  at: number;
}

export interface RollTablesState {
  tables: RollTable[];
  selectedId: string | null;
  mode: "roll" | "browse";
  history: RollHistoryItem[];
}
