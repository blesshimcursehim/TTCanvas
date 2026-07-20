// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { migrateWorkspace, isFutureWorkspaceVersion } from "./workspace";

describe("migrateWorkspace", () => {
  it("returns safe default for null", () => {
    const result = migrateWorkspace(null);
    expect(result.version).toBe(2);
    expect(result.activeLayout).toBe("Default");
    expect(result.layouts["Default"].widgets).toEqual([]);
  });

  it("returns safe default for undefined", () => {
    const result = migrateWorkspace(undefined);
    expect(result.version).toBe(2);
    expect(result.layouts["Default"].widgets).toEqual([]);
  });

  it("promotes v1 to v2 preserving widgets", () => {
    const widget = { id: "w1", type: "sticky-note", x: 10, y: 20, width: 200, height: 150, zIndex: 1, state: { text: "hello" } };
    const result = migrateWorkspace({ version: 1, widgets: [widget] });
    expect(result.version).toBe(2);
    expect(result.activeLayout).toBe("Default");
    expect(result.layouts["Default"].widgets).toEqual([widget]);
  });

  it("v1 with no widgets defaults to empty array", () => {
    const result = migrateWorkspace({ version: 1 });
    expect(result.layouts["Default"].widgets).toEqual([]);
  });

  it("v1 sets showGrid and showVignette defaults", () => {
    const result = migrateWorkspace({ version: 1, widgets: [] });
    expect(result.showGrid).toBe(true);
    expect(result.showVignette).toBe(false);
  });

  it("passes through v2 unchanged and fills missing optional fields", () => {
    const v2 = { version: 2, activeLayout: "Combat", layouts: { Combat: { widgets: [] } } };
    const result = migrateWorkspace(v2);
    expect(result.activeLayout).toBe("Combat");
    expect(result.showGrid).toBe(true);
    expect(result.showVignette).toBe(false);
    expect(result.singletonStates).toEqual({});
  });

  it("preserves explicit showGrid: false in v2", () => {
    const v2 = { version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } }, showGrid: false };
    const result = migrateWorkspace(v2);
    expect(result.showGrid).toBe(false);
  });

  it("preserves explicit showVignette: true in v2", () => {
    const v2 = { version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } }, showVignette: true };
    const result = migrateWorkspace(v2);
    expect(result.showVignette).toBe(true);
  });

  it("preserves singletonStates if present in v2", () => {
    const states = { "bestiary": { folders: [] } };
    const v2 = { version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } }, singletonStates: states };
    const result = migrateWorkspace(v2);
    expect(result.singletonStates).toEqual(states);
  });

  it("defaults activeLayout and layouts when missing from v2", () => {
    const result = migrateWorkspace({ version: 2 });
    expect(result.activeLayout).toBe("Default");
    expect(result.layouts).toEqual({ Default: { widgets: [] } });
    expect(result.disabledWidgetTypes).toEqual([]);
  });

  // Zod validation - corrupt field recovery
  it("corrects non-string activeLayout to 'Default'", () => {
    const result = migrateWorkspace({ version: 2, activeLayout: 99, layouts: { Default: { widgets: [] } } });
    expect(result.activeLayout).toBe("Default");
  });

  it("corrects non-boolean showGrid to true", () => {
    const result = migrateWorkspace({ version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } }, showGrid: "yes" });
    expect(result.showGrid).toBe(true);
  });

  it("corrects non-object layouts to default", () => {
    const result = migrateWorkspace({ version: 2, activeLayout: "Default", layouts: "corrupt" });
    expect(result.layouts).toEqual({ Default: { widgets: [] } });
  });

  it("corrects non-array widget list inside a layout to empty array", () => {
    const result = migrateWorkspace({ version: 2, activeLayout: "Default", layouts: { Default: { widgets: "corrupt" } } });
    expect(result.layouts["Default"].widgets).toEqual([]);
  });

  it("corrects non-number widget geometry fields to 0/300/200", () => {
    const raw = {
      version: 2, activeLayout: "Default",
      layouts: { Default: { widgets: [{ id: "w1", type: "sticky-note", x: "bad", y: null, width: undefined, height: false, state: {} }] } },
    };
    const result = migrateWorkspace(raw);
    const w = result.layouts["Default"].widgets[0];
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
    expect(w.width).toBe(300);
    expect(w.height).toBe(200);
  });

  it("drops widgets missing id or type rather than crashing", () => {
    const raw = {
      version: 2, activeLayout: "Default",
      layouts: { Default: { widgets: [
        { id: "w1", type: "sticky-note", x: 0, y: 0, width: 200, height: 100, state: {} },
        { type: "sticky-note", x: 0, y: 0, width: 200, height: 100, state: {} }, // no id
        { id: "w3", x: 0, y: 0, width: 200, height: 100, state: {} },            // no type
      ] } },
    };
    const result = migrateWorkspace(raw);
    expect(result.layouts["Default"].widgets).toHaveLength(1);
    expect(result.layouts["Default"].widgets[0].id).toBe("w1");
  });

  it("preserves a layout's backgroundImage", () => {
    const v2 = { version: 2, activeLayout: "Default", layouts: { Default: { widgets: [], backgroundImage: "sunset.jpg" } } };
    const result = migrateWorkspace(v2);
    expect(result.layouts["Default"].backgroundImage).toBe("sunset.jpg");
  });

  it("leaves backgroundImage undefined when absent (pre-existing saves)", () => {
    const result = migrateWorkspace({ version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } } });
    expect(result.layouts["Default"].backgroundImage).toBeUndefined();
  });

  it("corrects a non-string backgroundImage to undefined", () => {
    const v2 = { version: 2, activeLayout: "Default", layouts: { Default: { widgets: [], backgroundImage: 42 } } };
    const result = migrateWorkspace(v2);
    expect(result.layouts["Default"].backgroundImage).toBeUndefined();
  });

  it("falls back to default for unknown version", () => {
    const result = migrateWorkspace({ version: 99, activeLayout: "Custom", layouts: {} });
    expect(result.version).toBe(2);
    expect(result.activeLayout).toBe("Default");
    expect(result.layouts).toEqual({ Default: { widgets: [] } });
  });
});

// A file from a newer build (version > 2) must load read-only so autosave never
// overwrites it (CR-014); everything we understand or already backed up is safe.
describe("isFutureWorkspaceVersion", () => {
  it("flags a numeric version above 2", () => {
    expect(isFutureWorkspaceVersion({ version: 3 })).toBe(true);
    expect(isFutureWorkspaceVersion({ version: 99 })).toBe(true);
  });

  it("does not flag versions we understand, or an absent/empty file", () => {
    expect(isFutureWorkspaceVersion({ version: 2 })).toBe(false);
    expect(isFutureWorkspaceVersion({ version: 1 })).toBe(false);
    expect(isFutureWorkspaceVersion({})).toBe(false);
    expect(isFutureWorkspaceVersion(null)).toBe(false);
    expect(isFutureWorkspaceVersion(undefined)).toBe(false);
  });

  it("does not flag a non-numeric version", () => {
    expect(isFutureWorkspaceVersion({ version: "3" })).toBe(false);
  });
});

// Retired widgets - App.tsx renders an unknown type as a live "Unknown widget type" frame
// rather than dropping it, so these strips are what stop a removed widget haunting a layout.
describe("migrateWorkspace - retired widgets", () => {
  const clock = { id: "w1", type: "session-clock", x: 0, y: 0, width: 260, height: 200, state: {} };
  const sticky = { id: "w2", type: "sticky-note", x: 10, y: 10, width: 200, height: 150, state: {} };

  it("strips a retired widget from every layout, keeping others", () => {
    const raw = {
      version: 2, activeLayout: "Default",
      layouts: { Default: { widgets: [clock, sticky] }, Combat: { widgets: [sticky, clock] } },
    };
    const result = migrateWorkspace(raw);
    expect(result.layouts["Default"].widgets).toEqual([sticky]);
    expect(result.layouts["Combat"].widgets).toEqual([sticky]);
  });

  it("strips the retired singletonStates key, keeping other keys", () => {
    const raw = {
      version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } },
      singletonStates: { "session-clock": { accumulatedMs: 5000 }, "bestiary": { folders: [] } },
    };
    const result = migrateWorkspace(raw);
    expect(result.singletonStates).toEqual({ "bestiary": { folders: [] } });
  });

  it("strips the retired type from disabledWidgetTypes, keeping other entries", () => {
    const raw = {
      version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } },
      disabledWidgetTypes: ["session-clock", "dice-roller"],
    };
    expect(migrateWorkspace(raw).disabledWidgetTypes).toEqual(["dice-roller"]);
  });

  it("strips a retired widget from a v1 workspace (that path never reaches Zod)", () => {
    const result = migrateWorkspace({ version: 1, widgets: [clock, sticky] });
    expect(result.layouts["Default"].widgets).toEqual([sticky]);
  });

  it("is a no-op when no retired types are present", () => {
    const raw = {
      version: 2, activeLayout: "Default", layouts: { Default: { widgets: [sticky] } },
      singletonStates: { "bestiary": { folders: [] } }, disabledWidgetTypes: ["dice-roller"],
    };
    const result = migrateWorkspace(raw);
    expect(result.layouts["Default"].widgets).toEqual([sticky]);
    expect(result.singletonStates).toEqual({ "bestiary": { folders: [] } });
    expect(result.disabledWidgetTypes).toEqual(["dice-roller"]);
  });

  it("keeps version at 2 after a strip", () => {
    // Pins the deliberate decision not to bump: an older build reading a bumped file would
    // reset the whole workspace to defaults and save over it a second later.
    const raw = { version: 2, activeLayout: "Default", layouts: { Default: { widgets: [clock] } } };
    expect(migrateWorkspace(raw).version).toBe(2);
  });
});

describe("migrateWorkspace - sessionTimer", () => {
  const base = { version: 2, activeLayout: "Default", layouts: { Default: { widgets: [] } } };

  it("defaults sessionTimer when absent (pre-existing saves)", () => {
    expect(migrateWorkspace(base).sessionTimer).toEqual({ startedAt: null, accumulatedMs: 0 });
  });

  it("pauses a timer left running, dropping the untimed gap", () => {
    const raw = { ...base, sessionTimer: { startedAt: 1000, accumulatedMs: 5000 } };
    expect(migrateWorkspace(raw).sessionTimer).toEqual({ startedAt: null, accumulatedMs: 5000 });
  });

  it("leaves an already-paused timer untouched", () => {
    const raw = { ...base, sessionTimer: { startedAt: null, accumulatedMs: 5000 } };
    expect(migrateWorkspace(raw).sessionTimer).toEqual({ startedAt: null, accumulatedMs: 5000 });
  });

  it("recovers corrupt sessionTimer fields", () => {
    const raw = { ...base, sessionTimer: { startedAt: "x", accumulatedMs: "corrupt" } };
    expect(migrateWorkspace(raw).sessionTimer).toEqual({ startedAt: null, accumulatedMs: 0 });
  });
});
