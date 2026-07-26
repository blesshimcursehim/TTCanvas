// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

/** Just enough to populate a table picker; the full RollTable stays inside the widget package. */
export interface RollTableRef {
  id: string;
  name: string;
}

/** One resolved result. `chain` is set only when a subtable was traversed ("Loot → Gems"). */
export interface RollTableOutcome {
  text: string;
  note?: string;
  chain?: string;
}

export interface RollTablesContextValue {
  tables: RollTableRef[];
  /**
   * Roll a table by id and get its resolved results back. Nesting, cycle guards and count
   * expressions stay owned by the Roll Tables engine, so a caller only ever sees final text. The
   * roll is also appended to the Roll Tables history, because that log is the GM's audit trail and a
   * pull they cannot re-read afterwards is worse than one they can. Returns null for an unknown id
   * or an empty table.
   */
  rollOn: (tableId: string) => RollTableOutcome[] | null;
}

export const RollTablesContext = createContext<RollTablesContextValue>({ tables: [], rollOn: () => null });

export function useRollTables(): RollTablesContextValue {
  return useContext(RollTablesContext);
}
