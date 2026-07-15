// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface RuleCard {
  id: string;
  category: string;
  title: string;
  body: string;
}

export interface RuleCardsState {
  cards: RuleCard[];
  selectedId: string | null;
  query: string;
}
