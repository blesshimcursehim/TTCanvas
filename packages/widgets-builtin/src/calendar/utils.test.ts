// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { CalendarDef, CalDate, CalEvent } from "@ttcanvas/core";
import {
  intercalaryActiveInYear,
  daysInYear,
  calDateToAbsDay,
  absDayToCalDate,
  weekdayOf,
  formatCalDate,
  formatTime,
  timeOfDay,
  calDateEq,
  advanceTime,
  advanceTimeSeconds,
  formatDateOverlay,
  eventsOnDay,
  eventsStartingBetween,
  describeCrossedEvents,
  validateCalendarDef,
} from "./utils";

// 12-month calendar, 30 days each, no intercalary periods - clean arithmetic.
const UNIFORM: CalendarDef = {
  name: "Uniform",
  epochLabel: "AU",
  weekLength: 7,
  weekDayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  startWeekday: 0,
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Month${i + 1}`, days: 30 })),
  intercalaryPeriods: [],
};

// Calendar with one intercalary period after month 5 (Midsummer, 3 days, every year).
const WITH_INTERCALARY: CalendarDef = {
  ...UNIFORM,
  intercalaryPeriods: [{ name: "Midsummer", days: 3, afterMonth: 5 }],
};

// Calendar with an intercalary period that repeats every 4 years (leap-day analogue).
const WITH_LEAP: CalendarDef = {
  ...UNIFORM,
  intercalaryPeriods: [{ name: "LeapDay", days: 1, afterMonth: 1, repeatEvery: 4 }],
};

describe("intercalaryActiveInYear", () => {
  it("is always active when repeatEvery is undefined", () => {
    const p = { name: "X", days: 1, afterMonth: 0 };
    expect(intercalaryActiveInYear(p, 1)).toBe(true);
    expect(intercalaryActiveInYear(p, 100)).toBe(true);
  });

  it("is active only when year % repeatEvery === 0", () => {
    const p = { name: "X", days: 1, afterMonth: 0, repeatEvery: 4 };
    expect(intercalaryActiveInYear(p, 4)).toBe(true);
    expect(intercalaryActiveInYear(p, 8)).toBe(true);
    expect(intercalaryActiveInYear(p, 3)).toBe(false);
    expect(intercalaryActiveInYear(p, 5)).toBe(false);
  });
});

describe("daysInYear", () => {
  it("is 360 for a 12×30 uniform calendar", () => {
    expect(daysInYear(1, UNIFORM)).toBe(360);
  });

  it("adds intercalary days that are always active", () => {
    expect(daysInYear(1, WITH_INTERCALARY)).toBe(363);
  });

  it("adds leap period only in the right year", () => {
    expect(daysInYear(4, WITH_LEAP)).toBe(361);
    expect(daysInYear(3, WITH_LEAP)).toBe(360);
  });
});

describe("calDateToAbsDay / absDayToCalDate round-trip", () => {
  const dates: CalDate[] = [
    { year: 1, month: 0, day: 1 },
    { year: 1, month: 0, day: 30 },
    { year: 1, month: 11, day: 30 },
    { year: 2, month: 0, day: 1 },
    { year: 10, month: 5, day: 15 },
  ];

  for (const date of dates) {
    it(`round-trips ${JSON.stringify(date)}`, () => {
      const abs = calDateToAbsDay(date, UNIFORM);
      const back = absDayToCalDate(abs, UNIFORM);
      expect(back).toEqual(date);
    });
  }

  it("abs day 1 is year 1, month 0, day 1", () => {
    expect(calDateToAbsDay({ year: 1, month: 0, day: 1 }, UNIFORM)).toBe(1);
  });

  it("abs day 360 is the last day of year 1", () => {
    expect(calDateToAbsDay({ year: 1, month: 11, day: 30 }, UNIFORM)).toBe(360);
  });

  it("abs day 361 is year 2, month 0, day 1", () => {
    expect(absDayToCalDate(361, UNIFORM)).toEqual({ year: 2, month: 0, day: 1 });
  });
});

describe("calDateToAbsDay with intercalary period", () => {
  it("intercalary day falls after the 6th month", () => {
    const afterMonth5Day30 = calDateToAbsDay({ year: 1, month: 5, day: 30 }, WITH_INTERCALARY);
    const intercalary = calDateToAbsDay({ year: 1, month: -1, intercalaryIdx: 0, day: 1 }, WITH_INTERCALARY);
    const month7Day1 = calDateToAbsDay({ year: 1, month: 6, day: 1 }, WITH_INTERCALARY);
    expect(intercalary).toBe(afterMonth5Day30 + 1);
    expect(month7Day1).toBe(afterMonth5Day30 + 4);
  });
});

describe("weekdayOf", () => {
  it("day 1 has weekday 0 (startWeekday 0)", () => {
    expect(weekdayOf({ year: 1, month: 0, day: 1 }, UNIFORM)).toBe(0);
  });

  it("day 8 has weekday 0 (one full week later)", () => {
    expect(weekdayOf({ year: 1, month: 0, day: 8 }, UNIFORM)).toBe(0);
  });

  it("day 7 has weekday 6", () => {
    expect(weekdayOf({ year: 1, month: 0, day: 7 }, UNIFORM)).toBe(6);
  });
});

describe("formatCalDate", () => {
  it("formats a regular date", () => {
    const result = formatCalDate({ year: 1, month: 0, day: 15 }, UNIFORM);
    expect(result).toContain("Month1");
    expect(result).toContain("15");
    expect(result).toContain("1");
  });

  it("formats an intercalary date with single day", () => {
    const def = { ...WITH_INTERCALARY, intercalaryPeriods: [{ name: "Solstice", days: 1, afterMonth: 5 }] };
    const result = formatCalDate({ year: 1, month: -1, intercalaryIdx: 0, day: 1 }, def);
    expect(result).toContain("Solstice");
    expect(result).not.toContain("Day 1");
  });

  it("formats an intercalary date with multiple days", () => {
    const result = formatCalDate({ year: 1, month: -1, intercalaryIdx: 0, day: 2 }, WITH_INTERCALARY);
    expect(result).toContain("Midsummer");
    expect(result).toContain("Day 2");
  });
});

describe("formatTime", () => {
  it("pads hours and minutes with leading zeros", () => {
    expect(formatTime(9, 5)).toBe("09:05");
  });

  it("formats midnight", () => {
    expect(formatTime(0, 0)).toBe("00:00");
  });

  it("formats noon", () => {
    expect(formatTime(12, 0)).toBe("12:00");
  });
});

describe("timeOfDay", () => {
  it("classifies hours correctly", () => {
    expect(timeOfDay(2)).toBe("Midnight");
    expect(timeOfDay(6)).toBe("Dawn");
    expect(timeOfDay(10)).toBe("Morning");
    expect(timeOfDay(14)).toBe("Afternoon");
    expect(timeOfDay(18)).toBe("Dusk");
    expect(timeOfDay(21)).toBe("Night");
  });
});

describe("calDateEq", () => {
  it("returns true for equal dates", () => {
    const a: CalDate = { year: 5, month: 3, day: 12 };
    expect(calDateEq(a, { ...a })).toBe(true);
  });

  it("returns false when year differs", () => {
    expect(calDateEq({ year: 1, month: 0, day: 1 }, { year: 2, month: 0, day: 1 })).toBe(false);
  });

  it("returns false when month differs", () => {
    expect(calDateEq({ year: 1, month: 0, day: 1 }, { year: 1, month: 1, day: 1 })).toBe(false);
  });
});

describe("advanceTime", () => {
  it("advances minutes within the same day", () => {
    const result = advanceTime({ year: 1, month: 0, day: 1 }, 10, 30, 90, UNIFORM);
    expect(result.hour).toBe(12);
    expect(result.minute).toBe(0);
    expect(calDateEq(result.date, { year: 1, month: 0, day: 1 })).toBe(true);
  });

  it("advances across a day boundary", () => {
    const result = advanceTime({ year: 1, month: 0, day: 1 }, 23, 0, 120, UNIFORM);
    expect(calDateEq(result.date, { year: 1, month: 0, day: 2 })).toBe(true);
    expect(result.hour).toBe(1);
    expect(result.minute).toBe(0);
  });

  it("advances across a month boundary", () => {
    const result = advanceTime({ year: 1, month: 0, day: 30 }, 23, 0, 120, UNIFORM);
    expect(result.date.month).toBe(1);
    expect(result.date.day).toBe(1);
  });

  it("advances across a year boundary", () => {
    const result = advanceTime({ year: 1, month: 11, day: 30 }, 23, 0, 120, UNIFORM);
    expect(result.date.year).toBe(2);
    expect(result.date.month).toBe(0);
  });
});

describe("advanceTimeSeconds", () => {
  it("advances seconds within the same minute", () => {
    const r = advanceTimeSeconds({ year: 1, month: 0, day: 1 }, 10, 30, 0, 6, UNIFORM);
    expect(r.hour).toBe(10);
    expect(r.minute).toBe(30);
    expect(r.second).toBe(6);
  });

  it("carries seconds into minutes", () => {
    const r = advanceTimeSeconds({ year: 1, month: 0, day: 1 }, 10, 30, 54, 6, UNIFORM);
    expect(r.hour).toBe(10);
    expect(r.minute).toBe(31);
    expect(r.second).toBe(0);
  });

  it("ten 6-second rounds add exactly one minute", () => {
    let d: CalDate = { year: 1, month: 0, day: 1 };
    let h = 10, m = 30, s = 0;
    for (let i = 0; i < 10; i++) {
      const r = advanceTimeSeconds(d, h, m, s, 6, UNIFORM);
      d = r.date; h = r.hour; m = r.minute; s = r.second;
    }
    expect(h).toBe(10);
    expect(m).toBe(31);
    expect(s).toBe(0);
  });

  it("carries across hour and day boundaries", () => {
    const r = advanceTimeSeconds({ year: 1, month: 0, day: 1 }, 23, 59, 57, 6, UNIFORM);
    expect(calDateEq(r.date, { year: 1, month: 0, day: 2 })).toBe(true);
    expect(r.hour).toBe(0);
    expect(r.minute).toBe(0);
    expect(r.second).toBe(3);
  });

  it("rewinds with a negative delta across a day boundary", () => {
    const r = advanceTimeSeconds({ year: 1, month: 0, day: 2 }, 0, 0, 3, -6, UNIFORM);
    expect(calDateEq(r.date, { year: 1, month: 0, day: 1 })).toBe(true);
    expect(r.hour).toBe(23);
    expect(r.minute).toBe(59);
    expect(r.second).toBe(57);
  });

  it("matches advanceTime for whole-minute deltas", () => {
    const a = advanceTime({ year: 1, month: 0, day: 1 }, 10, 30, 90, UNIFORM);
    const b = advanceTimeSeconds({ year: 1, month: 0, day: 1 }, 10, 30, 0, 90 * 60, UNIFORM);
    expect(calDateEq(a.date, b.date)).toBe(true);
    expect(a.hour).toBe(b.hour);
    expect(a.minute).toBe(b.minute);
    expect(b.second).toBe(0);
  });
});

describe("formatTime with seconds", () => {
  it("renders seconds only when nonzero", () => {
    expect(formatTime(9, 5)).toBe("09:05");
    expect(formatTime(9, 5, 0)).toBe("09:05");
    expect(formatTime(9, 5, 7)).toBe("09:05:07");
  });
});

describe("formatDateOverlay", () => {
  it("combines date, time and time-of-day", () => {
    expect(formatDateOverlay({ year: 1, month: 0, day: 1 }, 14, 30, UNIFORM))
      .toBe("1 Month1, 1 AU · 14:30 Afternoon");
  });
});

describe("eventsOnDay", () => {
  const events: CalEvent[] = [
    { id: "e1", title: "Festival", start: { year: 1, month: 2, day: 10 }, duration: 3 },
    { id: "e2", title: "Meeting", start: { year: 1, month: 2, day: 15 }, duration: 1 },
  ];

  it("returns events active on the start day", () => {
    const result = eventsOnDay({ year: 1, month: 2, day: 10 }, events, UNIFORM);
    expect(result.map((e) => e.id)).toContain("e1");
  });

  it("returns events active on a middle day of a multi-day event", () => {
    const result = eventsOnDay({ year: 1, month: 2, day: 11 }, events, UNIFORM);
    expect(result.map((e) => e.id)).toContain("e1");
  });

  it("does not return an event after it ends", () => {
    const result = eventsOnDay({ year: 1, month: 2, day: 13 }, events, UNIFORM);
    expect(result.map((e) => e.id)).not.toContain("e1");
  });

  it("returns a single-day event only on its day", () => {
    const result = eventsOnDay({ year: 1, month: 2, day: 15 }, events, UNIFORM);
    expect(result.map((e) => e.id)).toContain("e2");
    const notOnDay = eventsOnDay({ year: 1, month: 2, day: 16 }, events, UNIFORM);
    expect(notOnDay.map((e) => e.id)).not.toContain("e2");
  });

  it("returns empty array when no events match", () => {
    const result = eventsOnDay({ year: 1, month: 0, day: 1 }, events, UNIFORM);
    expect(result).toEqual([]);
  });
});

describe("validateCalendarDef", () => {
  it("returns no errors for a valid calendar", () => {
    expect(validateCalendarDef(UNIFORM)).toEqual([]);
  });

  it("returns no errors for a calendar with valid intercalary periods", () => {
    expect(validateCalendarDef(WITH_INTERCALARY)).toEqual([]);
  });

  it("reports weekDayNames length mismatch", () => {
    const bad = { ...UNIFORM, weekLength: 7, weekDayNames: ["Mon", "Tue"] };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("weekDayNames"))).toBe(true);
  });

  it("reports startWeekday out of range", () => {
    const bad = { ...UNIFORM, startWeekday: 7 };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("startWeekday"))).toBe(true);
  });

  it("reports negative startWeekday", () => {
    const bad = { ...UNIFORM, startWeekday: -1 };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("startWeekday"))).toBe(true);
  });

  it("reports empty months array", () => {
    const bad = { ...UNIFORM, months: [] };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("month"))).toBe(true);
  });

  it("reports month with zero days", () => {
    const months = UNIFORM.months.map((m, i) => (i === 2 ? { ...m, days: 0 } : m));
    const bad = { ...UNIFORM, months };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("Month 3"))).toBe(true);
  });

  it("reports intercalary period with out-of-range afterMonth", () => {
    const bad = {
      ...UNIFORM,
      intercalaryPeriods: [{ name: "OOB", days: 1, afterMonth: 99 }],
    };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("OOB"))).toBe(true);
  });

  it("reports intercalary period with zero days", () => {
    const bad = {
      ...UNIFORM,
      intercalaryPeriods: [{ name: "Empty", days: 0, afterMonth: 0 }],
    };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("Empty"))).toBe(true);
  });

  it("reports intercalary period with repeatEvery < 1", () => {
    const bad = {
      ...UNIFORM,
      intercalaryPeriods: [{ name: "Bad", days: 1, afterMonth: 0, repeatEvery: 0 }],
    };
    const errs = validateCalendarDef(bad);
    expect(errs.some((e) => e.includes("Bad") && e.includes("repeatEvery"))).toBe(true);
  });

  it("can report multiple errors at once", () => {
    const bad = { ...UNIFORM, weekLength: 5, months: [] };
    const errs = validateCalendarDef(bad);
    expect(errs.length).toBeGreaterThan(1);
  });
});

// UNIFORM: month is 0-based, day 1-based, 30 days/month, so absDay of {month:0, day:N} === N.
function d(day: number): CalDate {
  return { year: 1, month: 0, day };
}
function ev(title: string, startDay: number, duration?: number): CalEvent {
  return { id: title, title, start: d(startDay), duration };
}

describe("eventsStartingBetween", () => {
  const festival = ev("Festival", 12);
  const market = ev("Market", 15);
  const events = [festival, market, ev("Later", 20)];

  it("includes an event starting on the day just landed on", () => {
    expect(eventsStartingBetween(d(10), d(12), events, UNIFORM)).toEqual([festival]);
  });

  it("excludes an event that started on the day already occupied before the advance", () => {
    expect(eventsStartingBetween(d(12), d(14), events, UNIFORM)).toEqual([]);
  });

  it("catches every start a long jump skips over, sorted by day", () => {
    expect(eventsStartingBetween(d(10), d(17), events, UNIFORM)).toEqual([festival, market]);
  });

  it("returns nothing for an hours-only advance (same day) or an undo (backwards)", () => {
    expect(eventsStartingBetween(d(12), d(12), events, UNIFORM)).toEqual([]);
    expect(eventsStartingBetween(d(17), d(10), events, UNIFORM)).toEqual([]);
  });
});

describe("describeCrossedEvents", () => {
  it("says 'begins today' when the single event starts on the landed-on day", () => {
    expect(describeCrossedEvents([ev("Festival", 12)], d(12), UNIFORM)).toBe("Festival begins today");
  });

  it("gives the dated form when a jump passed the event's start", () => {
    expect(describeCrossedEvents([ev("Festival", 12)], d(17), UNIFORM)).toBe(
      `Festival begins ${formatCalDate(d(12), UNIFORM)}`,
    );
  });

  it("lists titles when several begin at once", () => {
    expect(describeCrossedEvents([ev("A", 12), ev("B", 13)], d(13), UNIFORM)).toBe(
      "2 calendar events begin: A, B",
    );
  });
});
