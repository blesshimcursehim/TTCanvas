// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerWidget,
  registerModWidget,
  clearModWidgets,
  getWidget,
  getAllWidgets,
  getModWidgetTypes,
  resolveDefaultState,
  type WidgetDefinition,
} from "./registry";

const mockComponent = () => null;

function makeDef(type: string, defaultState: unknown = {}): WidgetDefinition {
  return { type, title: type, category: "Test", defaultSize: { width: 200, height: 200 }, defaultState, component: mockComponent as WidgetDefinition["component"] };
}

describe("resolveDefaultState", () => {
  it("returns the state directly when it is a plain object", () => {
    const def = makeDef("t", { count: 0 });
    expect(resolveDefaultState(def)).toEqual({ count: 0 });
  });

  it("calls the factory function when defaultState is a function", () => {
    let calls = 0;
    const def = makeDef("t", () => { calls++; return { id: calls }; });
    resolveDefaultState(def);
    resolveDefaultState(def);
    expect(calls).toBe(2);
  });

  it("each factory call returns a fresh value", () => {
    const def = makeDef("t", () => ({ ts: Date.now() }));
    const a = resolveDefaultState(def) as { ts: number };
    const b = resolveDefaultState(def) as { ts: number };
    // Both are objects with ts - even if equal in value, they are separate calls
    expect(typeof a.ts).toBe("number");
    expect(typeof b.ts).toBe("number");
  });
});

describe("registry - built-in widgets", () => {
  const TYPE = "__test_builtin__";

  beforeEach(() => {
    clearModWidgets();
  });

  it("getWidget returns the registered definition", () => {
    const def = makeDef(TYPE);
    registerWidget(def);
    expect(getWidget(TYPE)).toBe(def);
  });

  it("getWidget returns undefined for an unknown type", () => {
    expect(getWidget("__nonexistent_type_xyz__")).toBeUndefined();
  });

  it("getAllWidgets includes the registered widget", () => {
    const def = makeDef(TYPE);
    registerWidget(def);
    expect(getAllWidgets()).toContain(def);
  });

  it("clearModWidgets does not remove built-in registrations", () => {
    const def = makeDef(TYPE);
    registerWidget(def);
    clearModWidgets();
    expect(getWidget(TYPE)).toBe(def);
  });
});

describe("registry - mod widgets", () => {
  const MOD_TYPE = "__test_mod__";

  beforeEach(() => {
    clearModWidgets();
  });

  it("registerModWidget makes a widget findable via getWidget", () => {
    const def = makeDef(MOD_TYPE);
    registerModWidget(def);
    expect(getWidget(MOD_TYPE)).toBe(def);
  });

  it("getModWidgetTypes includes the mod type after registration", () => {
    registerModWidget(makeDef(MOD_TYPE));
    expect(getModWidgetTypes()).toContain(MOD_TYPE);
  });

  it("clearModWidgets removes the mod widget", () => {
    registerModWidget(makeDef(MOD_TYPE));
    clearModWidgets();
    expect(getWidget(MOD_TYPE)).toBeUndefined();
  });

  it("clearModWidgets empties getModWidgetTypes", () => {
    registerModWidget(makeDef(MOD_TYPE));
    clearModWidgets();
    expect(getModWidgetTypes()).not.toContain(MOD_TYPE);
  });

  it("registering a new mod after clearModWidgets works", () => {
    registerModWidget(makeDef(MOD_TYPE));
    clearModWidgets();
    registerModWidget(makeDef(MOD_TYPE));
    expect(getWidget(MOD_TYPE)).toBeDefined();
  });
});

describe("registry - mod/built-in collision guard (MOD-2)", () => {
  const BUILTIN = "__test_collision_builtin__";
  const builtinDef = makeDef(BUILTIN);

  beforeEach(() => {
    clearModWidgets();
    registerWidget(builtinDef);
  });

  it("registerModWidget does not overwrite a built-in type", () => {
    const imposter = makeDef(BUILTIN);
    registerModWidget(imposter);
    expect(getWidget(BUILTIN)).toBe(builtinDef);
  });

  it("clearModWidgets does not remove a built-in even if a mod tried to overwrite it", () => {
    registerModWidget(makeDef(BUILTIN));
    clearModWidgets();
    expect(getWidget(BUILTIN)).toBe(builtinDef);
  });

  it("colliding mod type is not added to getModWidgetTypes", () => {
    registerModWidget(makeDef(BUILTIN));
    expect(getModWidgetTypes()).not.toContain(BUILTIN);
  });
});
