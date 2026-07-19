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

export type JumpUnit = "min" | "hour" | "day" | "week";

/**
 * A saved, named time jump on the Almanac's Clock tab. `amount` is signed - a negative amount rewinds
 * the clock. `label` is freeform on purpose (a GM can name one "Long Rest" or "Rewind a day"), so it is
 * not derived from amount/unit and may intentionally differ from them.
 */
export interface NamedJump {
  id: string;
  label: string;
  amount: number;
  unit: JumpUnit;
}

/** Minutes per jump unit - the single place the unit -> minutes mapping lives. */
export const JUMP_UNIT_MINUTES: Record<JumpUnit, number> = {
  min: 1, hour: 60, day: 1440, week: 10080,
};

/** Signed minute delta a jump advances (or, when negative, rewinds) the clock by. */
export function jumpMinutes(j: NamedJump): number {
  return j.amount * JUMP_UNIT_MINUTES[j.unit];
}

/**
 * The advance presets a fresh - or a pre-jumps, migrated - clock starts with: the four increments the
 * Time Tracker shipped with before jumps became editable. Stable ids so a migrated state does not churn
 * them. Read-only; spread (`[...DEFAULT_JUMPS]`) at each use so no two states share one mutable array.
 */
export const DEFAULT_JUMPS: readonly NamedJump[] = [
  { id: "seed-1h", label: "+1h", amount: 1, unit: "hour" },
  { id: "seed-8h", label: "+8h", amount: 8, unit: "hour" },
  { id: "seed-1d", label: "+1d", amount: 1, unit: "day" },
  { id: "seed-1w", label: "+1w", amount: 1, unit: "week" },
];

export interface TimeTrackerState {
  currentDate: CalDate | null;
  currentHour: number;
  currentMinute: number;
  currentSecond?: number; // absent (pre-seconds saves) = 0
  history: TimeAdvance[];
  showOnPlayer: boolean;
  /** GM-editable named advance presets shown on the Clock tab. Seeded with DEFAULT_JUMPS on migration. */
  jumps: NamedJump[];
}
