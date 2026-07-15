// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { migrateWorkspace } from "./workspace";

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
