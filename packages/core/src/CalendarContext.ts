// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { CalendarDef, CalEvent, CalDate, CalendarState, TimeAdvance, TimeTrackerState } from "./calendarTypes";

export interface CalendarContextValue {
  def: CalendarDef | null;
  events: CalEvent[];
  setCalendarState: (s: CalendarState) => void;
  currentDate: CalDate | null;
  currentHour: number;
  currentMinute: number;
  currentSecond: number;
  history: TimeAdvance[];
  showOnPlayer: boolean;
  setTimeState: (s: TimeTrackerState) => void;
}

const DEFAULT: CalendarContextValue = {
  def: null,
  events: [],
  setCalendarState: () => {},
  currentDate: null,
  currentHour: 8,
  currentMinute: 0,
  currentSecond: 0,
  history: [],
  showOnPlayer: false,
  setTimeState: () => {},
};

export const CalendarContext = createContext<CalendarContextValue>(DEFAULT);

export function useCalendar(): CalendarContextValue {
  return useContext(CalendarContext);
}
