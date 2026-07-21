// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// This one needs a real `window` to define the global on. vitest.config.ts only gives jsdom to
// .test.tsx files, and there is no JSX here, so ask for it per-file rather than widening that.
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";

const logInfo = vi.fn();
const logWarn = vi.fn();
const logError = vi.fn();
vi.mock("@ttcanvas/core", () => ({ logInfo, logWarn, logError }));

const { installModApi, MOD_API_VERSION } = await import("./modApi");

// window.ttcanvas is a published contract - mods in the wild call it, so these pin the parts a
// mod can actually depend on: that it exists, that it reaches the real logger, and that one mod
// can't replace it to silence another.
describe("installModApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installModApi();
  });

  it("publishes the API with its version", () => {
    expect(window.ttcanvas.apiVersion).toBe(MOD_API_VERSION);
  });

  it("routes each level to the app's own logger", () => {
    window.ttcanvas.log.info("hello");
    expect(logInfo).toHaveBeenCalledWith("[mod] hello");

    const err = new Error("boom");
    window.ttcanvas.log.warn("degraded", err);
    expect(logWarn).toHaveBeenCalledWith("[mod] degraded", err);

    window.ttcanvas.log.error("failed", err);
    expect(logError).toHaveBeenCalledWith("[mod] failed", err);
  });

  it("tags mod-origin lines so a report separates them from TTCanvas's own", () => {
    window.ttcanvas.log.warn("My Widget: could not read a file");
    expect(logWarn).toHaveBeenCalledWith("[mod] My Widget: could not read a file", undefined);
  });

  it("passes the error through as-is rather than stringifying it", () => {
    // The logger formats and redacts; doing it here too would double-process the message.
    const err = { code: "ENOENT", path: "/home/someone/vault" };
    window.ttcanvas.log.error("read failed", err);
    expect(logError).toHaveBeenCalledWith("[mod] read failed", err);
  });

  it("cannot be replaced, so one mod can't silence another's logging", () => {
    const original = window.ttcanvas;
    expect(() => {
      (window as unknown as { ttcanvas: unknown }).ttcanvas = { apiVersion: 99 };
    }).toThrow();
    expect(window.ttcanvas).toBe(original);
    expect(Object.isFrozen(window.ttcanvas.log)).toBe(true);
  });

  it("is safe to call twice (a dev-server reload re-runs the entry module)", () => {
    expect(() => installModApi()).not.toThrow();
    window.ttcanvas.log.info("still works");
    expect(logInfo).toHaveBeenCalledWith("[mod] still works");
  });
});
