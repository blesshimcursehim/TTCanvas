// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Merges the GM's Chronicle entries with the Calendar widget's read-only events into one
// chronological stream, reusing the calendar's own day-numbering (calDateToAbsDay) so months of
// differing length and intercalary periods sort correctly. Pure and unit-tested.

import type { CalDate, CalEvent, CalendarDef } from "@ttcanvas/core";
import { calDateToAbsDay } from "../calendar/utils";
import type { TimelineEntry } from "./types";

/** Where an item sits relative to the in-game "now": before it, on it, or after. */
export type TimePos = "past" | "now" | "future";

export interface StreamItem {
  /** "entry" = an editable Chronicle beat; "event" = a read-only Calendar event. */
  kind: "entry" | "event";
  id: string;
  title: string;
  body?: string;
  /** Category for entries; undefined for calendar events (they carry no category). */
  category?: string;
  date: CalDate;
  absDay: number;
  timePos: TimePos;
}

function timePosFor(absDay: number, currentAbs: number | null): TimePos {
  if (currentAbs === null) return "future"; // no in-game date set: caller omits the "now" divider
  if (absDay < currentAbs) return "past";
  if (absDay === currentAbs) return "now";
  return "future";
}

/**
 * Returns the merged Chronicle entries + calendar events, sorted earliest-first, each tagged with
 * its absolute day and past/now/future position. A day tie sorts events before entries, then by
 * title, so the order is stable (deterministic for tests). Requires a CalendarDef for the day maths.
 */
export function mergeTimeline(
  entries: TimelineEntry[],
  events: CalEvent[],
  def: CalendarDef,
  currentDate: CalDate | null,
): StreamItem[] {
  const currentAbs = currentDate ? calDateToAbsDay(currentDate, def) : null;

  const fromEntries: StreamItem[] = entries.map((e) => {
    const absDay = calDateToAbsDay(e.date, def);
    return { kind: "entry", id: e.id, title: e.title, body: e.body, category: e.category, date: e.date, absDay, timePos: timePosFor(absDay, currentAbs) };
  });

  const fromEvents: StreamItem[] = events.map((ev) => {
    const absDay = calDateToAbsDay(ev.start, def);
    return { kind: "event", id: ev.id, title: ev.title, body: ev.note, date: ev.start, absDay, timePos: timePosFor(absDay, currentAbs) };
  });

  return [...fromEvents, ...fromEntries].sort(
    (a, b) => a.absDay - b.absDay || kindRank(a.kind) - kindRank(b.kind) || a.title.localeCompare(b.title),
  );
}

const kindRank = (k: StreamItem["kind"]): number => (k === "event" ? 0 : 1);
