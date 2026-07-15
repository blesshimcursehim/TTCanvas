// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { CalDate } from "@ttcanvas/core";

/** One narrative Chronicle entry, pinned to an in-game date. Calendar events are shown alongside
 * these but are not stored here (they live in the Calendar widget - the Timeline reads them). */
export interface TimelineEntry {
  id: string;
  title: string;
  body?: string;
  /** A CategoryPreset key, or a freeform custom label (auto-coloured when not a preset). */
  category: string;
  date: CalDate;
}

export interface CampaignTimelineState {
  entries: TimelineEntry[];
}

export type CategoryPreset = "plot" | "foreshadow" | "recap" | "lore" | "other";

/** The five preset categories with their chip colour. A `category` that isn't one of these keys is
 * treated as a custom label. Kept beside the model so the widget and its picker agree. */
export const CATEGORY_PRESETS: Record<CategoryPreset, { label: string; color: string }> = {
  plot:       { label: "Plot beat",     color: "oklch(0.80 0.115 78)" }, // amber
  foreshadow: { label: "Foreshadowing", color: "oklch(0.62 0.15 290)" }, // violet
  recap:      { label: "Session recap", color: "oklch(0.74 0.10 200)" }, // cyan
  lore:       { label: "Lore",          color: "oklch(0.68 0.15 145)" }, // green
  other:      { label: "Other",         color: "oklch(0.62 0.02 258)" }, // grey
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_PRESETS) as CategoryPreset[];

/** True when `category` is one of the presets rather than a custom label. */
export function isPreset(category: string): category is CategoryPreset {
  return category in CATEGORY_PRESETS;
}
