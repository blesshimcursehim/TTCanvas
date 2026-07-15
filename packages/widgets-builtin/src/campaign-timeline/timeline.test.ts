// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { CalDate, CalEvent, CalendarDef } from "@ttcanvas/core";
import { mergeTimeline } from "./timeline";
import type { TimelineEntry } from "./types";

// Minimal two-month calendar (30 + 30 days), no intercalary - enough for the merge/sort logic.
const def: CalendarDef = {
  name: "Test",
  epochLabel: "TE",
  weekLength: 7,
  weekDayNames: ["1", "2", "3", "4", "5", "6", "7"],
  startWeekday: 0,
  months: [{ name: "Frost", days: 30 }, { name: "Thaw", days: 30 }],
  intercalaryPeriods: [],
};

const d = (year: number, month: number, day: number): CalDate => ({ year, month, day });
const entry = (id: string, date: CalDate, title = id, category = "plot"): TimelineEntry => ({ id, title, date, category });
const event = (id: string, start: CalDate, title = id): CalEvent => ({ id, title, start });

describe("mergeTimeline", () => {
  it("merges entries and events sorted earliest-first", () => {
    const entries = [entry("e2", d(1, 1, 5)), entry("e1", d(1, 0, 10))];
    const events = [event("v1", d(1, 0, 20))];
    const stream = mergeTimeline(entries, events, def, null);
    expect(stream.map((s) => s.id)).toEqual(["e1", "v1", "e2"]);
  });

  it("tags each item past / now / future against the current date", () => {
    const entries = [entry("past", d(1, 0, 1)), entry("today", d(1, 0, 15)), entry("future", d(1, 0, 28))];
    const stream = mergeTimeline(entries, [], def, d(1, 0, 15));
    const pos = Object.fromEntries(stream.map((s) => [s.id, s.timePos]));
    expect(pos).toEqual({ past: "past", today: "now", future: "future" });
  });

  it("marks calendar events as read-only kind with no category, carrying the note as body", () => {
    const events = [{ id: "v1", title: "Festival", note: "big feast", start: d(1, 0, 3) } satisfies CalEvent];
    const [item] = mergeTimeline([], events, def, null);
    expect(item.kind).toBe("event");
    expect(item.category).toBeUndefined();
    expect(item.body).toBe("big feast");
  });

  it("keeps entry category and body", () => {
    const entries: TimelineEntry[] = [{ id: "e1", title: "Beat", body: "detail", category: "foreshadow", date: d(1, 0, 3) }];
    const [item] = mergeTimeline(entries, [], def, null);
    expect(item.kind).toBe("entry");
    expect(item.category).toBe("foreshadow");
    expect(item.body).toBe("detail");
  });

  it("orders an event before an entry on the same day (stable tie-break)", () => {
    const stream = mergeTimeline([entry("e1", d(1, 0, 7))], [event("v1", d(1, 0, 7))], def, null);
    expect(stream.map((s) => s.kind)).toEqual(["event", "entry"]);
  });

  it("sorts a later month after an earlier one regardless of day number", () => {
    const stream = mergeTimeline([entry("m1d28", d(1, 0, 28)), entry("m2d02", d(1, 1, 2))], [], def, null);
    expect(stream.map((s) => s.id)).toEqual(["m1d28", "m2d02"]);
  });
});
