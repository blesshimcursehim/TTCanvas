// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { CalDate, CalendarDef, IntercalaryPeriod } from "@ttcanvas/core";

export function validateCalendarDef(def: CalendarDef): string[] {
  const errs: string[] = [];
  if (def.weekLength < 1) {
    errs.push("Week length must be at least 1.");
  }
  if (def.weekDayNames.length !== def.weekLength) {
    errs.push(`weekDayNames has ${def.weekDayNames.length} entries but weekLength is ${def.weekLength}.`);
  }
  if (def.startWeekday < 0 || def.startWeekday >= def.weekLength) {
    errs.push(`startWeekday (${def.startWeekday}) is out of range [0, ${def.weekLength}).`);
  }
  if (def.months.length === 0) {
    errs.push("Calendar must have at least one month.");
  }
  for (let i = 0; i < def.months.length; i++) {
    if (def.months[i].days < 1) {
      errs.push(`Month ${i + 1} ("${def.months[i].name}") has ${def.months[i].days} days - must be ≥ 1.`);
    }
  }
  for (const p of def.intercalaryPeriods) {
    if (p.afterMonth < 0 || p.afterMonth >= def.months.length) {
      errs.push(`Intercalary period "${p.name}" references month ${p.afterMonth} which is out of range.`);
    }
    if (p.days < 1) {
      errs.push(`Intercalary period "${p.name}" has ${p.days} days - must be ≥ 1.`);
    }
    if (p.repeatEvery !== undefined && p.repeatEvery < 1) {
      errs.push(`Intercalary period "${p.name}" repeatEvery must be ≥ 1.`);
    }
  }
  return errs;
}

export function intercalaryActiveInYear(p: IntercalaryPeriod, year: number): boolean {
  return !p.repeatEvery || year % p.repeatEvery === 0;
}

export function daysInYear(year: number, def: CalendarDef): number {
  return (
    def.months.reduce((s, m) => s + m.days, 0) +
    def.intercalaryPeriods.reduce(
      (s, p) => s + (intercalaryActiveInYear(p, year) ? p.days : 0),
      0,
    )
  );
}

// Convert a CalDate to an absolute 1-based day number (year 1, day 1 = 1).
export function calDateToAbsDay(date: CalDate, def: CalendarDef): number {
  let day = 0;
  for (let y = 1; y < date.year; y++) day += daysInYear(y, def);
  const year = date.year;

  if (date.month >= 0) {
    for (let m = 0; m < date.month; m++) day += def.months[m].days;
    for (const p of def.intercalaryPeriods) {
      if (p.afterMonth < date.month && intercalaryActiveInYear(p, year)) day += p.days;
    }
    day += date.day;
  } else if (date.intercalaryIdx !== undefined) {
    const p = def.intercalaryPeriods[date.intercalaryIdx];
    for (let m = 0; m <= p.afterMonth; m++) day += def.months[m].days;
    for (let i = 0; i < def.intercalaryPeriods.length; i++) {
      const other = def.intercalaryPeriods[i];
      if (!intercalaryActiveInYear(other, year)) continue;
      if (other.afterMonth < p.afterMonth) day += other.days;
      if (other.afterMonth === p.afterMonth && i < date.intercalaryIdx) day += other.days;
    }
    day += date.day;
  }

  return day;
}

type Segment =
  | { kind: "month"; index: number; days: number }
  | { kind: "intercalary"; index: number; days: number };

function yearSegments(year: number, def: CalendarDef): Segment[] {
  const segs: Segment[] = [];
  for (let m = 0; m < def.months.length; m++) {
    segs.push({ kind: "month", index: m, days: def.months[m].days });
    for (let i = 0; i < def.intercalaryPeriods.length; i++) {
      const p = def.intercalaryPeriods[i];
      if (p.afterMonth === m && intercalaryActiveInYear(p, year)) {
        segs.push({ kind: "intercalary", index: i, days: p.days });
      }
    }
  }
  return segs;
}

export function absDayToCalDate(absDay: number, def: CalendarDef): CalDate {
  let year = 1;
  let remaining = absDay;
  while (remaining > daysInYear(year, def)) {
    remaining -= daysInYear(year, def);
    year++;
  }
  for (const seg of yearSegments(year, def)) {
    if (remaining <= seg.days) {
      return seg.kind === "month"
        ? { year, month: seg.index, day: remaining }
        : { year, month: -1, intercalaryIdx: seg.index, day: remaining };
    }
    remaining -= seg.days;
  }
  return { year, month: 0, day: 1 };
}

// Weekday column (0-based) for a given CalDate.
export function weekdayOf(date: CalDate, def: CalendarDef): number {
  const abs = calDateToAbsDay(date, def);
  return (abs - 1 + def.startWeekday) % def.weekLength;
}

export function formatCalDate(date: CalDate, def: CalendarDef): string {
  const epoch = def.epochLabel ? ` ${def.epochLabel}` : "";
  if (date.month >= 0) {
    return `${date.day} ${def.months[date.month].name}, ${date.year}${epoch}`;
  }
  if (date.intercalaryIdx !== undefined) {
    const p = def.intercalaryPeriods[date.intercalaryIdx];
    if (p.days > 1) return `${p.name} (Day ${date.day}), ${date.year}${epoch}`;
    return `${p.name}, ${date.year}${epoch}`;
  }
  return "-";
}

// Seconds are only rendered when nonzero, so nothing changes visually for
// GMs who never use second-granularity advances (Initiative auto-advance).
export function formatTime(hour: number, minute: number, second?: number): string {
  const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (second === undefined || second === 0) return hm;
  return `${hm}:${String(second).padStart(2, "0")}`;
}

// The player-window date overlay line, e.g. "12 Flamerule, 1492 DR · 14:30 Afternoon".
// Shared by Time Tracker and App-level advances so the two can't drift apart.
export function formatDateOverlay(date: CalDate, hour: number, minute: number, def: CalendarDef): string {
  return `${formatCalDate(date, def)} · ${formatTime(hour, minute)} ${timeOfDay(hour)}`;
}

export function timeOfDay(hour: number): string {
  if (hour < 5) return "Midnight";
  if (hour < 7) return "Dawn";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 19) return "Dusk";
  return "Night";
}

export function calDateEq(a: CalDate, b: CalDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.intercalaryIdx === b.intercalaryIdx;
}

// Advance from a given date+time by deltaSeconds (negative rewinds),
// returning new date+time with seconds carried into minutes/hours/days.
export function advanceTimeSeconds(
  date: CalDate,
  hour: number,
  minute: number,
  second: number,
  deltaSeconds: number,
  def: CalendarDef,
): { date: CalDate; hour: number; minute: number; second: number } {
  const totalSec = hour * 3600 + minute * 60 + second + deltaSeconds;
  const extraDays = Math.floor(totalSec / 86400);
  const remainingSec = ((totalSec % 86400) + 86400) % 86400;
  const newHour = Math.floor(remainingSec / 3600);
  const newMinute = Math.floor((remainingSec % 3600) / 60);
  const newSecond = remainingSec % 60;
  const newAbsDay = calDateToAbsDay(date, def) + extraDays;
  return {
    date: absDayToCalDate(Math.max(1, newAbsDay), def),
    hour: newHour,
    minute: newMinute,
    second: newSecond,
  };
}

// Advance from a given date+time by deltaMinutes, returning new date+time.
// Seconds pass through untouched at this granularity (callers keep their own).
export function advanceTime(
  date: CalDate,
  hour: number,
  minute: number,
  deltaMinutes: number,
  def: CalendarDef,
): { date: CalDate; hour: number; minute: number } {
  const r = advanceTimeSeconds(date, hour, minute, 0, deltaMinutes * 60, def);
  return { date: r.date, hour: r.hour, minute: r.minute };
}

// All events active on a given day (started on or before, ends on or after).
export function eventsOnDay(
  date: CalDate,
  events: import("@ttcanvas/core").CalEvent[],
  def: CalendarDef,
): import("@ttcanvas/core").CalEvent[] {
  const abs = calDateToAbsDay(date, def);
  return events.filter((e) => {
    const start = calDateToAbsDay(e.start, def);
    const end = start + (e.duration ?? 1) - 1;
    return abs >= start && abs <= end;
  });
}
