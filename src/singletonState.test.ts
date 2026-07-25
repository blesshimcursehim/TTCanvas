// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { appendCalendarEvent, appendChronicleEntry, collectPinnedLocationRefs } from "./singletonState";
import type { WidgetInstance } from "./workspace";

function widget(type: string, state: unknown): WidgetInstance {
  return { id: `${type}-1`, type, x: 0, y: 0, width: 300, height: 200, state };
}

describe("appendCalendarEvent", () => {
  const start = { year: 1, month: 1, day: 1 };
  const ev = { id: "e1", start, title: "Eclipse" };

  it("appends onto an existing singleton state", () => {
    const ss = { "custom-calendar": { def: null, events: [{ id: "e0", start, title: "Old" }] } };
    const result = appendCalendarEvent(ss, [], ev);
    expect((result["custom-calendar"] as { events: unknown[] }).events).toHaveLength(2);
  });

  it("falls back to the widget instance state, not an empty default, when no singleton exists", () => {
    const existing = { def: null, events: [{ id: "e0", start, title: "Old" }] };
    const ss = {};
    const result = appendCalendarEvent(ss, [widget("custom-calendar", existing)], ev);
    const events = (result["custom-calendar"] as { events: { id: string }[] }).events;
    expect(events.map((e) => e.id)).toEqual(["e0", "e1"]);
  });

  it("falls back to the empty default when neither singleton nor widget instance exists", () => {
    const result = appendCalendarEvent({}, [], ev);
    expect((result["custom-calendar"] as { events: unknown[] }).events).toEqual([ev]);
  });
});

describe("appendChronicleEntry", () => {
  const draft = { date: { year: 1, month: 1, day: 1 }, title: "The party arrives", category: "session" };

  it("mints an id and appends onto an existing singleton state", () => {
    const ss = { "campaign-timeline": { entries: [{ id: "t0", date: { year: 1, month: 1, day: 1 }, title: "Old", category: "session" }] } };
    const result = appendChronicleEntry(ss, [], draft);
    const entries = (result["campaign-timeline"] as { entries: { id: string }[] }).entries;
    expect(entries).toHaveLength(2);
    expect(entries[1].id).not.toBe("t0");
  });

  it("falls back to the widget instance state, not an empty default, when no singleton exists", () => {
    const existing = { entries: [{ id: "t0", date: { year: 1, month: 1, day: 1 }, title: "Old", category: "session" }] };
    const result = appendChronicleEntry({}, [widget("campaign-timeline", existing)], draft);
    const entries = (result["campaign-timeline"] as { entries: { id: string }[] }).entries;
    expect(entries.map((e) => e.id)).toEqual(["t0", entries[1].id]);
  });

  it("falls back to the empty default when neither singleton nor widget instance exists", () => {
    const result = appendChronicleEntry({}, [], draft);
    expect((result["campaign-timeline"] as { entries: unknown[] }).entries).toHaveLength(1);
  });
});

describe("collectPinnedLocationRefs", () => {
  it("collects locationRefs across every scene", () => {
    const ss = { "map-display": { scenes: [
      { tokens: [{ locationRef: "loc-a" }, { locationRef: undefined }] },
      { tokens: [{ locationRef: "loc-b" }] },
    ] } };
    expect(collectPinnedLocationRefs(ss, [])).toEqual(new Set(["loc-a", "loc-b"]));
  });

  it("also reads legacy top-level tokens from a pre-scenes workspace", () => {
    const ss = { "map-display": { tokens: [{ locationRef: "loc-legacy" }] } };
    expect(collectPinnedLocationRefs(ss, [])).toEqual(new Set(["loc-legacy"]));
  });

  it("merges scenes and legacy top-level tokens when both are present", () => {
    const ss = { "map-display": {
      scenes: [{ tokens: [{ locationRef: "loc-a" }] }],
      tokens: [{ locationRef: "loc-legacy" }],
    } };
    expect(collectPinnedLocationRefs(ss, [])).toEqual(new Set(["loc-a", "loc-legacy"]));
  });

  it("falls back to the widget instance state when no singleton exists", () => {
    const result = collectPinnedLocationRefs({}, [widget("map-display", { scenes: [{ tokens: [{ locationRef: "loc-a" }] }] })]);
    expect(result).toEqual(new Set(["loc-a"]));
  });

  it("returns an empty set when there is no map-display state at all", () => {
    expect(collectPinnedLocationRefs({}, [])).toEqual(new Set());
  });
});
