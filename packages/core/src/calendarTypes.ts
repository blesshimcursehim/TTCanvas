// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface CalendarDef {
  name: string;
  epochLabel: string;      // appended to year, e.g. "DR"
  weekLength: number;
  weekDayNames: string[];  // length === weekLength
  startWeekday: number;    // which weekday (0-based) falls on absolute day 1
  months: MonthDef[];
  intercalaryPeriods: IntercalaryPeriod[];
}

export interface MonthDef {
  name: string;
  days: number;
}

export interface IntercalaryPeriod {
  name: string;
  days: number;
  afterMonth: number;   // 0-based month index this period follows
  repeatEvery?: number; // only appears in years where year % repeatEvery === 0
}

export interface CalDate {
  year: number;
  month: number;            // 0-based month index; -1 = intercalary
  day: number;              // 1-based
  intercalaryIdx?: number;  // index into intercalaryPeriods (when month === -1)
}

export interface CalEvent {
  id: string;
  title: string;
  note?: string;
  start: CalDate;
  duration?: number; // days, default 1
}

export interface CalendarState {
  def: CalendarDef | null;
  events: CalEvent[];
}

export interface TimeAdvance {
  id: string;
  label: string;
  prevDate: CalDate;
  prevHour: number;
  prevMinute: number;
  prevSecond?: number; // absent (pre-seconds entries) = 0
}

export interface TimeTrackerState {
  currentDate: CalDate | null;
  currentHour: number;
  currentMinute: number;
  currentSecond?: number; // absent (pre-seconds saves) = 0
  history: TimeAdvance[];
  showOnPlayer: boolean;
}
