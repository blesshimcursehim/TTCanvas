// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarContext, ToastContext, DEFAULT_JUMPS } from "@ttcanvas/core";
import type { CalendarContextValue, CalDate, CalEvent, CalendarDef, TimeTrackerState } from "@ttcanvas/core";
import { TimeTracker } from "./TimeTracker";

vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));

afterEach(cleanup);

const DEF: CalendarDef = {
  name: "Uniform",
  epochLabel: "AU",
  weekLength: 7,
  weekDayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  startWeekday: 0,
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Month${i + 1}`, days: 30 })),
  intercalaryPeriods: [],
};

function renderTracker(
  events: CalEvent[],
  currentDate: CalDate,
  opts: { jumps?: TimeTrackerState["jumps"]; onChange?: (s: TimeTrackerState) => void } = {},
) {
  const showToast = vi.fn();
  const jumps = opts.jumps ?? [...DEFAULT_JUMPS];
  const state: TimeTrackerState = {
    currentDate, currentHour: 8, currentMinute: 0, currentSecond: 0, history: [], showOnPlayer: false,
    jumps,
  };
  const cal: CalendarContextValue = {
    def: DEF, events, setCalendarState: () => {}, addCalendarEvent: () => {},
    currentDate, currentHour: 8, currentMinute: 0, currentSecond: 0,
    history: [], showOnPlayer: false, jumps, setTimeState: () => {},
  };
  render(
    <CalendarContext.Provider value={cal}>
      <ToastContext.Provider value={{ showToast }}>
        <TimeTracker state={state} onChange={opts.onChange ?? (() => {})} />
      </ToastContext.Provider>
    </CalendarContext.Provider>,
  );
  return { showToast };
}

const day = (d: number): CalDate => ({ year: 1, month: 0, day: d });
const festival: CalEvent = { id: "f", title: "Festival", start: day(11) };

describe("TimeTracker calendar-event reminders", () => {
  it("toasts when a +1d advance lands on an event's start day", () => {
    const { showToast } = renderTracker([festival], day(10));
    fireEvent.click(screen.getByText("+1d"));
    expect(showToast).toHaveBeenCalledWith("Festival begins today", "info");
  });

  it("stays quiet when the advance does not reach a new day", () => {
    const { showToast } = renderTracker([festival], day(10));
    fireEvent.click(screen.getByText("+1h"));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("stays quiet when no event falls in the crossed span", () => {
    const { showToast } = renderTracker([festival], day(11));
    fireEvent.click(screen.getByText("+1d"));
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("TimeTracker jumps", () => {
  it("applies a negative jump as a rewind", () => {
    const onChange = vi.fn();
    const rewind = [{ id: "r", label: "Rewind day", amount: -1, unit: "day" as const }];
    renderTracker([], day(10), { jumps: rewind, onChange });
    fireEvent.click(screen.getByText("Rewind day"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as TimeTrackerState).currentDate).toEqual(day(9));
  });

  it("records the jump's label in history, not a fixed increment", () => {
    const onChange = vi.fn();
    const rest = [{ id: "lr", label: "Long Rest", amount: 8, unit: "hour" as const }];
    renderTracker([], day(10), { jumps: rest, onChange });
    fireEvent.click(screen.getByText("Long Rest"));
    expect((onChange.mock.calls[0][0] as TimeTrackerState).history[0].label).toBe("Long Rest");
  });

  it("adds a jump from the editor", () => {
    const onChange = vi.fn();
    renderTracker([], day(10), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByText("+ Add jump"));
    expect((onChange.mock.calls[0][0] as TimeTrackerState).jumps).toHaveLength(DEFAULT_JUMPS.length + 1);
  });
});
