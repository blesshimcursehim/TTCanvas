// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { Canvas } from "./Canvas";
import { useCanvasTransform, type CanvasTransform } from "./CanvasContext";

afterEach(cleanup);

// Panning mutates the transform ref directly and writes to the DOM imperatively (applyTransform),
// with no React state change and thus no re-render - so the test needs the ref itself, read after
// each fireEvent, rather than a value snapshotted at render time.
function TransformProbe({ onMount }: { onMount: (ref: MutableRefObject<CanvasTransform>) => void }) {
  onMount(useCanvasTransform());
  return null;
}

function renderCanvas() {
  let ref!: MutableRefObject<CanvasTransform>;
  const view = render(
    <Canvas>
      <TransformProbe onMount={(r) => { ref = r; }} />
      <input aria-label="Widget text field" />
    </Canvas>,
  );
  return { ...view, get transform() { return ref.current; } };
}

describe("Canvas keyboard panning", () => {
  it("is reachable by Tab", () => {
    renderCanvas();
    expect(screen.getByLabelText("Canvas")).toHaveAttribute("tabIndex", "0");
  });

  it("pans on arrow keys once the canvas itself is focused", () => {
    const view = renderCanvas();
    const canvas = screen.getByLabelText("Canvas");
    canvas.focus();

    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(view.transform.x).toBeLessThan(0);

    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(view.transform.y).toBeLessThan(0);
  });

  it("uses a bigger step with Shift", () => {
    const view = renderCanvas();
    const canvas = screen.getByLabelText("Canvas");
    canvas.focus();

    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    const smallStep = Math.abs(view.transform.x);

    fireEvent.keyDown(canvas, { key: "ArrowRight", shiftKey: true });
    const afterShift = Math.abs(view.transform.x) - smallStep;

    expect(afterShift).toBeGreaterThan(smallStep);
  });

  it("does not pan when an arrow key bubbles up from a focused child input", () => {
    const view = renderCanvas();
    const input = screen.getByLabelText("Widget text field");
    input.focus();

    fireEvent.keyDown(input, { key: "ArrowRight" });

    expect(view.transform.x).toBe(0);
  });
});

describe("Canvas wheel panning", () => {
  it("pans on the wheel's own axes by default", () => {
    const view = renderCanvas();
    fireEvent.wheel(screen.getByLabelText("Canvas"), { deltaX: 30, deltaY: 10 });
    expect(view.transform.x).toBe(-30);
    expect(view.transform.y).toBe(-10);
  });

  it("Shift+scroll swaps the axis, panning horizontally from a vertical-only scroll", () => {
    const view = renderCanvas();
    // Some trackpad/driver combinations never produce a horizontal deltaX for a two-finger side
    // swipe - Shift+scroll is the fallback, and it must work from deltaY alone (deltaX: 0).
    fireEvent.wheel(screen.getByLabelText("Canvas"), { deltaX: 0, deltaY: 50, shiftKey: true });
    expect(view.transform.x).toBe(-50);
    expect(view.transform.y).toBe(0);
  });
});
