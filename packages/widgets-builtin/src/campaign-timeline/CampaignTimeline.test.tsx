// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalendarContext } from "@ttcanvas/core";
import type { CalendarContextValue, CalDate, CalendarDef } from "@ttcanvas/core";
import { CampaignTimeline } from "./CampaignTimeline";
import type { CampaignTimelineState, TimelineEntry } from "./types";

const DEF: CalendarDef = {
  name: "Test",
  epochLabel: "TE",
  weekLength: 7,
  weekDayNames: ["1", "2", "3", "4", "5", "6", "7"],
  startWeekday: 0,
  months: [{ name: "Frost", days: 30 }, { name: "Thaw", days: 30 }],
  intercalaryPeriods: [],
};

const d = (day: number): CalDate => ({ year: 1, month: 0, day });
const entry = (id: string, day: number, title: string): TimelineEntry =>
  ({ id, title, category: "plot", date: d(day) });

afterEach(cleanup);

function renderTimeline(sortDirection: CampaignTimelineState["sortDirection"]) {
  const state: CampaignTimelineState = {
    entries: [entry("past", 5, "Past Beat"), entry("future", 25, "Future Beat")],
    sortDirection,
  };
  const cal: CalendarContextValue = {
    def: DEF, events: [], setCalendarState: () => {}, addCalendarEvent: () => {},
    currentDate: d(15), currentHour: 8, currentMinute: 0, currentSecond: 0,
    history: [], showOnPlayer: false, jumps: [], setTimeState: () => {},
  };
  render(
    <CalendarContext.Provider value={cal}>
      <CampaignTimeline state={state} onChange={() => {}} />
    </CalendarContext.Provider>,
  );
}

describe("CampaignTimeline - Now divider placement", () => {
  it("ascending: places Now between the past and future beats", () => {
    renderTimeline("asc");
    const past = screen.getByText("Past Beat");
    const now = screen.getByText(/^Now/);
    const future = screen.getByText("Future Beat");
    expect(past.compareDocumentPosition(now) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(now.compareDocumentPosition(future) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("descending: mirrors the divider, placing Now between the future and past beats", () => {
    renderTimeline("desc");
    const past = screen.getByText("Past Beat");
    const now = screen.getByText(/^Now/);
    const future = screen.getByText("Future Beat");
    expect(future.compareDocumentPosition(now) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(now.compareDocumentPosition(past) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
