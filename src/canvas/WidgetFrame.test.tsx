// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasContext } from "./CanvasContext";
import { WidgetFrame } from "./WidgetFrame";

const transformRef = { current: { x: 0, y: 0, scale: 1 } };
const noop = () => {};

afterEach(() => cleanup());

function renderFrame(help?: string) {
  return render(
    <CanvasContext.Provider value={transformRef}>
      <WidgetFrame
        title="Test widget"
        help={help}
        x={0}
        y={0}
        width={240}
        height={160}
        onMove={noop}
        onResize={noop}
        onClose={noop}
      >
        Widget content
      </WidgetFrame>
    </CanvasContext.Provider>,
  );
}

describe("WidgetFrame help", () => {
  it("renders a labelled popover button and Markdown help", () => {
    const { container } = renderFrame("# Help\n\nUse `2d6` to roll.");

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
