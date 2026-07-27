// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Layout } from "@ttcanvas/core";
import { SettingsMenu } from "./SettingsMenu";

afterEach(() => cleanup());

const LAYOUTS: Record<string, Layout> = { Default: { widgets: [] } };

// SettingsMenu is a controlled component (open/onToggle from the parent) - a thin stateful
// wrapper is needed so clicking the toggle button and Escape/outside-click dismissal both
// actually change what's rendered, the way they do under App.tsx.
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <SettingsMenu
      open={open}
      onToggle={() => setOpen((o) => !o)}
      layouts={LAYOUTS}
      activeLayout="Default"
      showGrid
      showVignette={false}
      onSwitch={vi.fn()}
      onNew={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onToggleGrid={vi.fn()}
      onToggleVignette={vi.fn()}
      onChooseBackground={vi.fn()}
      onClearBackground={vi.fn()}
    />
  );
}

describe("SettingsMenu Escape handling", () => {
  it("closes the menu on Escape", () => {
    render(<Harness />);
    expect(screen.getByText("Layouts")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Layouts")).not.toBeInTheDocument();
  });

  it("cancels an in-progress rename on Escape without closing the menu", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTitle("Rename layout"));
    const input = screen.getByDisplayValue("Default");
    fireEvent.keyDown(input, { key: "Escape" });
    // The rename row is gone (back to the plain layout row)...
    expect(screen.queryByDisplayValue("Default")).not.toBeInTheDocument();
    // ...but the menu itself is still open, unlike a bare document-level Escape listener
    // would leave it, which is the bug this stopPropagation call fixes.
    expect(screen.getByText("Layouts")).toBeInTheDocument();
  });

  it("cancels an in-progress new-layout entry on Escape without closing the menu", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("+ New layout"));
    const input = screen.getByPlaceholderText("Layout name…");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Layout name…")).not.toBeInTheDocument();
    expect(screen.getByText("Layouts")).toBeInTheDocument();
  });

  it("closes on a click outside", () => {
    render(<Harness />);
    expect(screen.getByText("Layouts")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Layouts")).not.toBeInTheDocument();
  });
});
