// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { CalendarDef, CalEvent, CalDate, CalendarState, TimeAdvance, TimeTrackerState, NamedJump } from "./calendarTypes";
import { DEFAULT_JUMPS } from "./calendarTypes";

export interface CalendarContextValue {
  def: CalendarDef | null;
  events: CalEvent[];
  setCalendarState: (s: CalendarState) => void;
  /** Append a one-way event to the calendar (e.g. a Campaign Timeline entry sent to the Calendar). */
  addCalendarEvent: (ev: CalEvent) => void;
  currentDate: CalDate | null;
  currentHour: number;
  currentMinute: number;
  currentSecond: number;
  history: TimeAdvance[];
  showOnPlayer: boolean;
  jumps: NamedJump[];
  setTimeState: (s: TimeTrackerState) => void;
}

const DEFAULT: CalendarContextValue = {
  def: null,
  events: [],
  setCalendarState: () => {},
  addCalendarEvent: () => {},
  currentDate: null,
  currentHour: 8,
  currentMinute: 0,
  currentSecond: 0,
  history: [],
  showOnPlayer: false,
  jumps: [...DEFAULT_JUMPS],
  setTimeState: () => {},
};

export const CalendarContext = createContext<CalendarContextValue>(DEFAULT);

export function useCalendar(): CalendarContextValue {
  return useContext(CalendarContext);
}
