// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { CalendarDef } from "@ttcanvas/core";

const GREGORIAN: CalendarDef = {
  name: "Gregorian Calendar",
  epochLabel: "",
  weekLength: 7,
  weekDayNames: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  startWeekday: 1, // 1 Jan 1 CE was a Monday
  months: [
    { name: "January",   days: 31 },
    { name: "February",  days: 28 },
    { name: "March",     days: 31 },
    { name: "April",     days: 30 },
    { name: "May",       days: 31 },
    { name: "June",      days: 30 },
    { name: "July",      days: 31 },
    { name: "August",    days: 31 },
    { name: "September", days: 30 },
    { name: "October",   days: 31 },
    { name: "November",  days: 30 },
    { name: "December",  days: 31 },
  ],
  intercalaryPeriods: [],
};

const BLANK: CalendarDef = {
  name: "Custom Calendar",
  epochLabel: "",
  weekLength: 7,
  weekDayNames: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
  startWeekday: 0,
  months: [
    { name: "Month 1",  days: 30 },
    { name: "Month 2",  days: 30 },
    { name: "Month 3",  days: 30 },
    { name: "Month 4",  days: 30 },
    { name: "Month 5",  days: 30 },
    { name: "Month 6",  days: 30 },
    { name: "Month 7",  days: 30 },
    { name: "Month 8",  days: 30 },
    { name: "Month 9",  days: 30 },
    { name: "Month 10", days: 30 },
    { name: "Month 11", days: 30 },
    { name: "Month 12", days: 30 },
  ],
  intercalaryPeriods: [],
};

export const PRESETS: Array<{ label: string; def: CalendarDef }> = [
  { label: "Gregorian",                  def: GREGORIAN },
  { label: "Blank / Custom",             def: BLANK },
];
