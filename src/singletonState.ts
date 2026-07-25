// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { CalendarState, CalEvent, ChronicleDraft } from "@ttcanvas/core";
import type { CampaignTimelineState, TimelineEntry } from "@ttcanvas/widgets-builtin";
import type { WidgetInstance } from "./workspace";

/**
 * Pulled out of App.tsx (which has no test harness) so the two singleton-state fixes
 * below are exercised directly rather than only by reading and manual verification:
 * the append helpers' widget-instance fallback, and pinnedLocationRefs' legacy-token read.
 */

export type SingletonStates = Record<string, unknown>;

const DEFAULT_CAL_STATE: CalendarState = { def: null, events: [] };
const DEFAULT_TIMELINE_STATE: CampaignTimelineState = { entries: [] };

// Falls back to the widget instance before the empty default: on an older, instance-backed
// workspace a bare default would write a singleton holding only the new event, and since the
// render path prefers `singletonStates[type] ?? w.state`, that would hide every existing event.
export function appendCalendarEvent(
  ss: SingletonStates,
  widgets: readonly WidgetInstance[],
  ev: CalEvent,
): SingletonStates {
  const cur = (ss["custom-calendar"]
    ?? widgets.find((w) => w.type === "custom-calendar")?.state
    ?? DEFAULT_CAL_STATE) as CalendarState;
  return { ...ss, "custom-calendar": { ...cur, events: [...(cur.events ?? []), ev] } };
}

// Same instance-state fallback as appendCalendarEvent, minting the entry id here so callers
// only need to supply the draft.
export function appendChronicleEntry(
  ss: SingletonStates,
  widgets: readonly WidgetInstance[],
  draft: ChronicleDraft,
): SingletonStates {
  const cur = (ss["campaign-timeline"]
    ?? widgets.find((w) => w.type === "campaign-timeline")?.state
    ?? DEFAULT_TIMELINE_STATE) as CampaignTimelineState;
  const entry: TimelineEntry = { id: crypto.randomUUID(), ...draft };
  return { ...ss, "campaign-timeline": { ...cur, entries: [...(cur.entries ?? []), entry] } };
}

// Which Gazetteer places already have a pin, gathered across every scene. Pre-scenes
// workspaces keep tokens at the top level until Map Display is opened and migrates them
// (MapDisplay's migrateState) - read those too, or a place stays "unpinned" until the widget
// is opened.
export function collectPinnedLocationRefs(
  ss: SingletonStates,
  widgets: readonly WidgetInstance[],
): ReadonlySet<string> {
  const s = (ss["map-display"] ?? widgets.find((w) => w.type === "map-display")?.state) as
    { scenes?: { tokens?: { locationRef?: string }[] }[]; tokens?: { locationRef?: string }[] } | undefined;
  const refs = new Set<string>();
  const add = (tokens: { locationRef?: string }[] | undefined) => {
    for (const token of tokens ?? []) if (token.locationRef) refs.add(token.locationRef);
  };
  for (const scene of s?.scenes ?? []) add(scene.tokens);
  add(s?.tokens);
  return refs;
}
