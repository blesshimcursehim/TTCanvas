// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ConditionPicker } from "./ConditionPicker";

afterEach(cleanup);

const anchorRect = { top: 100, bottom: 120, left: 50, right: 100, height: 20, width: 50 } as DOMRect;

function renderPicker(extraConditions?: Array<{ name: string; color?: string }>) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <ConditionPicker active={[]} anchorRect={anchorRect} onChange={onChange} onClose={onClose} extraConditions={extraConditions} />,
  );
  return { onChange, onClose };
}

describe("ConditionPicker keyboard navigation", () => {
  it("focuses the first chip on open", () => {
    renderPicker();
    expect(screen.getByLabelText("Blinded")).toHaveFocus();
  });

  it("moves focus forward with ArrowRight and wraps past the exhaustion row back to the first chip", () => {
    renderPicker();
    const picker = screen.getByRole("group", { name: "Conditions" });
    // 15 conditions + 6 exhaustion levels = 21 buttons; one ArrowRight per button returns to start.
    for (let i = 0; i < 21; i++) fireEvent.keyDown(picker, { key: "ArrowRight" });
    expect(screen.getByLabelText("Blinded")).toHaveFocus();
  });

  it("moves focus backward with ArrowLeft, wrapping to the last button (Exhaustion level 6)", () => {
    renderPicker();
    const picker = screen.getByRole("group", { name: "Conditions" });
    fireEvent.keyDown(picker, { key: "ArrowLeft" });
    expect(screen.getByLabelText("Exhaustion level 6")).toHaveFocus();
  });

  it("jumps to the last button with End and back to the first with Home", () => {
    renderPicker();
    const picker = screen.getByRole("group", { name: "Conditions" });
    fireEvent.keyDown(picker, { key: "End" });
    expect(screen.getByLabelText("Exhaustion level 6")).toHaveFocus();
    fireEvent.keyDown(picker, { key: "Home" });
    expect(screen.getByLabelText("Blinded")).toHaveFocus();
  });

  it("keeps only the focused chip in the Tab order (roving tabindex)", () => {
    renderPicker();
    expect(screen.getByLabelText("Blinded")).toHaveAttribute("tabIndex", "0");
    expect(screen.getByLabelText("Charmed")).toHaveAttribute("tabIndex", "-1");

    const picker = screen.getByRole("group", { name: "Conditions" });
    fireEvent.keyDown(picker, { key: "ArrowRight" });

    expect(screen.getByLabelText("Blinded")).toHaveAttribute("tabIndex", "-1");
    expect(screen.getByLabelText("Charmed")).toHaveAttribute("tabIndex", "0");
  });

  it("includes custom extraConditions chips in the same roving sequence, between conditions and exhaustion", () => {
    renderPicker([{ name: "Marked" }]);
    const picker = screen.getByRole("group", { name: "Conditions" });
    // Arrow forward 15 times lands on the 16th button - the custom "Marked" chip.
    for (let i = 0; i < 15; i++) fireEvent.keyDown(picker, { key: "ArrowRight" });
    expect(screen.getByLabelText("Marked")).toHaveFocus();
  });
});
