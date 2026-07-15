// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface SessionEntry {
  id: string;
  text: string;
  inGameTime?: string;
  wallTime: number;
}

export interface SessionRecorderState {
  entries: SessionEntry[];
  exportFolder: string | null;
}
