// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiceContext } from "@ttcanvas/core";
import { RollableStat } from "./RollableStat";
import { buildRollEntry } from "../../dice-roller/rollEntry";

afterEach(cleanup);

function renderStat(props: React.ComponentProps<typeof RollableStat>) {
  const roll = vi.fn();
  render(
    <DiceContext.Provider value={{ roll }}>
      <RollableStat {...props} />
    </DiceContext.Provider>,
  );
  return { roll, button: screen.getByRole("button") };
}

describe("RollableStat", () => {
  it("rolls 1d20 + bonus with the subject-prefixed label on a plain click", () => {
    const { roll, button } = renderStat({ subject: "Aria", label: "STR check", bonus: 3 });
    fireEvent.click(button);
    expect(roll).toHaveBeenCalledWith("1d20+3", null, "Aria: STR check");
  });

  it("passes advantage on Shift-click and disadvantage on Alt-click", () => {
    const { roll, button } = renderStat({ label: "Athletics", bonus: 5 });
    fireEvent.click(button, { shiftKey: true });
    expect(roll).toHaveBeenCalledWith("1d20+5", "advantage", "Athletics");
    fireEvent.click(button, { altKey: true });
    expect(roll).toHaveBeenLastCalledWith("1d20+5", "disadvantage", "Athletics");
  });

  it("builds a bare 1d20 at +0 and keeps the sign on a negative bonus", () => {
    const zero = renderStat({ label: "INT check", bonus: 0 });
    fireEvent.click(zero.button);
    expect(zero.roll).toHaveBeenCalledWith("1d20", null, "INT check");

    cleanup();
    const neg = renderStat({ label: "STR check", bonus: -2 });
    fireEvent.click(neg.button);
    expect(neg.roll).toHaveBeenCalledWith("1d20-2", null, "STR check");
  });

  it("renders custom children but still rolls the underlying bonus", () => {
    const { roll, button } = renderStat({ label: "Perception", bonus: 17, children: "Perception +17" });
    expect(button).toHaveTextContent("Perception +17");
    fireEvent.click(button);
    expect(roll).toHaveBeenCalledWith("1d20+17", null, "Perception");
  });
});

describe("buildRollEntry", () => {
  it("labels the entry and evaluates the expression", () => {
    const entry = buildRollEntry("1d20+3", null, "Aria: STR check");
    expect(entry).not.toBeNull();
    expect(entry!.label).toBe("Aria: STR check");
    expect(entry!.expr).toBe("1d20+3");
    expect(entry!.total).toBeGreaterThanOrEqual(4); // 1 + 3
    expect(entry!.total).toBeLessThanOrEqual(23); // 20 + 3
  });

  it("returns null for invalid notation", () => {
    expect(buildRollEntry("not dice", null, "x")).toBeNull();
  });
});
