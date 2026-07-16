// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, expect, it } from "vitest";
import { getAllWidgets } from "../registry";
import { RETIRED_WIDGET_TYPES } from "../workspace";
import "./register";

describe("built-in widget help", () => {
  it("gives every registered widget a non-empty help card", () => {
    const widgetsWithoutHelp = getAllWidgets().filter((widget) => !widget.help?.trim());

    expect(widgetsWithoutHelp).toEqual([]);
  });
});

describe("retired widget types", () => {
  it("never names a type that is still registered", () => {
    // migrateWorkspace deletes every instance of a retired type on load, so listing a live
    // widget here would silently wipe it from every layout. This is what makes retiring a
    // widget a safe one-line change.
    const registered = getAllWidgets().map((widget) => widget.type);
    const stillRegistered = RETIRED_WIDGET_TYPES.filter((type) => registered.includes(type));

    expect(stillRegistered).toEqual([]);
  });
});

describe("map-display lazy chunk", () => {
  it("the package.json subpath export resolves to the same component the barrel used to export directly", async () => {
    const { MapDisplay } = await import("@ttcanvas/widgets-builtin/map-display");
    const { AnnotationLayer } = await import("@ttcanvas/widgets-builtin");

    // Guards the package.json "exports" subpath (CR-009): a typo or moved
    // file there would only fail at runtime, in the browser, on first open of
    // the widget - this catches it at test time instead. AnnotationLayer, the
    // barrel's neighbouring map-display export, is the control showing the
    // barrel import path itself still works.
    expect(typeof MapDisplay).toBe("function");
    expect(typeof AnnotationLayer).toBe("function");
  });
});
