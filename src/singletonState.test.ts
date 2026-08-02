// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { appendCalendarEvent, appendChronicleEntry, appendSessionEntry, collectPinnedLocationRefs } from "./singletonState";
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
  // appendChronicleEntry takes the completed entry rather than minting an id itself (the id is
  // minted by the caller, outside the setSingletonStates updater - see App.tsx), so these tests
  // supply a fixed id and assert the exact entry that was appended.
  const entry = { id: "t1", date: { year: 1, month: 1, day: 1 }, title: "The party arrives", category: "session" };

  it("appends the given entry onto an existing singleton state", () => {
    const ss = { "campaign-timeline": { entries: [{ id: "t0", date: { year: 1, month: 1, day: 1 }, title: "Old", category: "session" }] } };
    const result = appendChronicleEntry(ss, [], entry);
    const entries = (result["campaign-timeline"] as { entries: unknown[] }).entries;
    expect(entries).toEqual([ss["campaign-timeline"].entries[0], entry]);
  });

  it("falls back to the widget instance state, not an empty default, when no singleton exists", () => {
    const existing = { entries: [{ id: "t0", date: { year: 1, month: 1, day: 1 }, title: "Old", category: "session" }] };
    const result = appendChronicleEntry({}, [widget("campaign-timeline", existing)], entry);
    const entries = (result["campaign-timeline"] as { entries: unknown[] }).entries;
    expect(entries).toEqual([existing.entries[0], entry]);
  });

  it("falls back to the empty default when neither singleton nor widget instance exists", () => {
    const result = appendChronicleEntry({}, [], entry);
    expect((result["campaign-timeline"] as { entries: unknown[] }).entries).toEqual([entry]);
  });
});

describe("appendSessionEntry", () => {
  // Same caller-mints-the-id contract as appendChronicleEntry.
  const entry = { id: "s1", text: "Bought a longsword from Dorn's Forge for 1 gp 5 sp.", wallTime: 1_700_000_000_000 };

  it("appends the given entry onto an existing singleton state", () => {
    const ss = { "session-recorder": { entries: [{ id: "s0", text: "Old", wallTime: 1 }], exportFolder: null } };
    const result = appendSessionEntry(ss, [], entry);
    const entries = (result["session-recorder"] as { entries: unknown[] }).entries;
    expect(entries).toEqual([ss["session-recorder"].entries[0], entry]);
  });

  it("keeps the rest of the Session Logger's state, so a logged purchase can't clear the export folder", () => {
    const ss = { "session-recorder": { entries: [], exportFolder: "/vault/sessions" } };
    const result = appendSessionEntry(ss, [], entry);
    expect((result["session-recorder"] as { exportFolder: string }).exportFolder).toBe("/vault/sessions");
  });

  it("falls back to the widget instance state, not an empty default, when no singleton exists", () => {
    const existing = { entries: [{ id: "s0", text: "Old", wallTime: 1 }], exportFolder: null };
    const result = appendSessionEntry({}, [widget("session-recorder", existing)], entry);
    const entries = (result["session-recorder"] as { entries: unknown[] }).entries;
    expect(entries).toEqual([existing.entries[0], entry]);
  });

  it("logs even with no Session Logger anywhere, so the entry is waiting when one is opened", () => {
    const result = appendSessionEntry({}, [], entry);
    expect((result["session-recorder"] as { entries: unknown[] }).entries).toEqual([entry]);
  });

  it("leaves other singletons untouched", () => {
    const result = appendSessionEntry({ "items": { items: [] } }, [], entry);
    expect(result["items"]).toEqual({ items: [] });
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
