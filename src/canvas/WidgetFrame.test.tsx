// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { CanvasContext } from "./CanvasContext";
import { WidgetFrame } from "./WidgetFrame";

const transformRef = { current: { x: 0, y: 0, scale: 1 } };
const noop = () => {};

afterEach(() => cleanup());

function renderFrame(props: Partial<ComponentProps<typeof WidgetFrame>> = {}) {
  return render(
    <CanvasContext.Provider value={transformRef}>
      <WidgetFrame
        title="Test widget"
        x={0}
        y={0}
        width={240}
        height={160}
        onMove={noop}
        onResize={noop}
        onClose={noop}
        {...props}
      >
        Widget content
      </WidgetFrame>
    </CanvasContext.Provider>,
  );
}

describe("WidgetFrame help", () => {
  it("renders a labelled popover button and Markdown help", () => {
    const { container } = renderFrame({ help: "# Help\n\nUse `2d6` to roll." });

    expect(screen.getByRole("button", { name: "Help for Test widget" })).toBeInTheDocument();
    const popover = container.querySelector('[popover="auto"]');
    expect(popover).toHaveTextContent("Help");
    expect(popover).toHaveTextContent("Use 2d6 to roll.");
    expect(popover?.querySelector("code")).toHaveTextContent("2d6");
  });

  it("omits the help controls when a widget has no help text", () => {
    renderFrame();

    expect(screen.queryByRole("button", { name: "Help for Test widget" })).not.toBeInTheDocument();
  });
});

describe("WidgetFrame content boundary", () => {
  // App's Delete shortcut stands down for anything focused inside this marker, which is how a
  // selected map token or annotation keeps a Delete to itself. Losing the attribute would silently
  // bring back the double-delete, so it is pinned here.
  it("marks the widget's own body, and leaves the header chrome outside it", () => {
    const { container } = renderFrame();
    const content = container.querySelector("[data-widget-content]");

    expect(content).toHaveTextContent("Widget content");
    expect(screen.getByRole("button", { name: "Move Test widget widget" }).closest("[data-widget-content]")).toBeNull();
  });
});

describe("WidgetFrame keyboard move", () => {
  it("nudges by MOVE_STEP on an arrow key, and by the large step with Shift", () => {
    const onMove = vi.fn();
    renderFrame({ x: 100, y: 50, onMove });
    const grip = screen.getByRole("button", { name: "Move Test widget widget" });

    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(onMove).toHaveBeenLastCalledWith(108, 50);

    fireEvent.keyDown(grip, { key: "ArrowDown", shiftKey: true });
    expect(onMove).toHaveBeenLastCalledWith(100, 90);
  });

  it("ignores non-arrow keys", () => {
    const onMove = vi.fn();
    renderFrame({ onMove });
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Test widget widget" }), { key: "Enter" });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("promotes an unselected widget on the first nudge only", () => {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    renderFrame({ onMove, onSelect, selected: false });
    const grip = screen.getByRole("button", { name: "Move Test widget widget" });

    fireEvent.keyDown(grip, { key: "ArrowRight" });
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("routes through onGroupMove instead of onMove when part of a selection", () => {
    const onMove = vi.fn();
    const onGroupMove = vi.fn();
    renderFrame({ onMove, onGroupMove, selected: true });

    fireEvent.keyDown(screen.getByRole("button", { name: "Move Test widget widget" }), { key: "ArrowLeft" });
    expect(onGroupMove).toHaveBeenCalledWith(-8, 0);
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("WidgetFrame keyboard resize", () => {
  it("resizes by RESIZE_STEP on an arrow key, and by the large step with Shift", () => {
    const onResize = vi.fn();
    renderFrame({ width: 240, height: 160, onResize });
    const handle = screen.getByRole("button", { name: "Resize Test widget widget" });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onResize).toHaveBeenLastCalledWith(248, 160);

    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(onResize).toHaveBeenLastCalledWith(240, 200);
  });

  it("clamps to minWidth/minHeight, matching the mouse-drag path", () => {
    const onResize = vi.fn();
    renderFrame({ width: 160, height: 100, minWidth: 160, minHeight: 100, onResize });
    const handle = screen.getByRole("button", { name: "Resize Test widget widget" });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onResize).toHaveBeenLastCalledWith(160, 100);
  });

  it("calls onFocus once per focus session, matching the mouse resize's drag-start onFocus", () => {
    const onFocus = vi.fn();
    const onResize = vi.fn();
    renderFrame({ onFocus, onResize });
    const handle = screen.getByRole("button", { name: "Resize Test widget widget" });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
