// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useState } from "react";
import type { CalDate, CalEvent, CalendarState } from "@ttcanvas/core";
import { useCalendar } from "@ttcanvas/core";
import {
  weekdayOf, formatCalDate, eventsOnDay,
  calDateEq, intercalaryActiveInYear, validateCalendarDef,
} from "./utils";
import styles from "./CalendarView.module.css";

interface Props {
  state: CalendarState;
  onChange: (s: CalendarState) => void;
  onEdit: () => void;
  /** When set, navigate the view to this date's month (does not change the in-game date). */
  focusDate?: CalDate | null;
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function CalendarView({ state, onChange, onEdit, focusDate }: Props) {
  const { def, events } = state;
  const calCtx = useCalendar();
  const today = calCtx.currentDate;

  const startYear = today?.year ?? 1;
  const startMonth = today?.month !== undefined && today.month >= 0 ? today.month : 0;

  const [viewYear, setViewYear] = useState(startYear);
  const [viewMonth, setViewMonth] = useState(startMonth);
  const [selectedDate, setSelectedDate] = useState<CalDate | null>(null);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newDuration, setNewDuration] = useState("1");

  // Jump the view to a requested date's month (a searched calendar event), without touching the
  // in-game date. An intercalary date maps to the month it follows.
  useEffect(() => {
    if (!focusDate || !def) return;
    const m = focusDate.month >= 0
      ? focusDate.month
      : def.intercalaryPeriods[focusDate.intercalaryIdx ?? 0]?.afterMonth ?? 0;
    setViewYear(focusDate.year);
    setViewMonth(m);
    setSelectedDate(null);
  }, [focusDate, def]);

  if (!def) return null;

  const defErrors = validateCalendarDef(def);
  if (defErrors.length > 0) {
    return (
      <div className={styles.defError}>
        <p>This calendar has structural errors and cannot be displayed:</p>
        <ul>{defErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <button className={styles.editBtn} onClick={onEdit}>Edit calendar…</button>
      </div>
    );
  }

  const monthDef = def.months[viewMonth];
  const epoch = def.epochLabel ? ` ${def.epochLabel}` : "";

  // Intercalary periods following this month (active in viewYear)
  const followingIntercalary = def.intercalaryPeriods
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.afterMonth === viewMonth && intercalaryActiveInYear(p, viewYear));

  // Navigate - def! is safe: we returned null above if def is null
  function prevMonth() {
    if (viewMonth > 0) setViewMonth(viewMonth - 1);
    else { setViewYear(viewYear - 1); setViewMonth(def!.months.length - 1); }
    setSelectedDate(null);
  }
  function nextMonth() {
    if (viewMonth < def!.months.length - 1) setViewMonth(viewMonth + 1);
    else { setViewYear(viewYear + 1); setViewMonth(0); }
    setSelectedDate(null);
  }

  function jumpToToday() {
    if (!today) return;
    const m = today.month >= 0 ? today.month : def!.intercalaryPeriods[today.intercalaryIdx ?? 0]?.afterMonth ?? 0;
    setViewYear(today.year);
    setViewMonth(m);
    setSelectedDate(null);
  }

  function selectDay(date: CalDate) {
    if (selectedDate && calDateEq(selectedDate, date)) {
      setSelectedDate(null);
    } else {
      setSelectedDate(date);
      setAddingEvent(false);
      setNewTitle("");
      setNewNote("");
      setNewDuration("1");
      // sync the clock to the picked day, preserving the rest of the time state (seconds, jumps)
      calCtx.setTimeState({
        currentDate: date,
        currentHour: calCtx.currentHour,
        currentMinute: calCtx.currentMinute,
        currentSecond: calCtx.currentSecond,
        history: calCtx.history,
        showOnPlayer: calCtx.showOnPlayer,
        jumps: calCtx.jumps,
      });
    }
  }

  function addEvent() {
    if (!newTitle.trim() || !selectedDate) return;
    const ev: CalEvent = {
      id: uid(),
      title: newTitle.trim(),
      note: newNote.trim() || undefined,
      start: selectedDate,
      duration: Math.max(1, parseInt(newDuration, 10) || 1),
    };
    onChange({ ...state, events: [...events, ev] });
    setNewTitle("");
    setNewNote("");
    setNewDuration("1");
    setAddingEvent(false);
  }

  function removeEvent(id: string) {
    onChange({ ...state, events: events.filter((e) => e.id !== id) });
  }

  // Grid computation
  const firstDayDate: CalDate = { year: viewYear, month: viewMonth, day: 1 };
  const startCol = weekdayOf(firstDayDate, def!); // 0-based column

  function isToday(date: CalDate) {
    return today ? calDateEq(today, date) : false;
  }
  function isSelected(date: CalDate) {
    return selectedDate ? calDateEq(selectedDate, date) : false;
  }
  function eventDot(date: CalDate) {
    return eventsOnDay(date, events, def!).length > 0;
  }

  const selectedEvents = selectedDate ? eventsOnDay(selectedDate, events, def!) : [];

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.navBtn} onClick={prevMonth}>◀</button>
        <div className={styles.headerCenter}>
          <span className={styles.monthName}>{monthDef.name}</span>
          <input
            type="number"
            className={styles.yearInput}
            value={viewYear}
            onChange={(e) => { setViewYear(Number(e.target.value) || 1); setSelectedDate(null); }}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <span className={styles.epochLabel}>{epoch}</span>
        </div>
        <button className={styles.navBtn} onClick={nextMonth}>▶</button>
        <div className={styles.headerActions}>
          {today && (
            <button className={styles.todayBtn} onClick={jumpToToday} title="Jump to today">
              Today
            </button>
          )}
          <button className={styles.editBtn} onClick={onEdit} title="Edit calendar definition">✎</button>
        </div>
      </div>

      {/* Weekday column headers */}
      <div className={styles.grid} style={{ "--cols": def.weekLength } as React.CSSProperties}>
        {def.weekDayNames.map((name) => (
          <div key={name} className={styles.weekHeader}>{name}</div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: startCol }).map((_, i) => (
          <div key={`e${i}`} className={styles.empty} />
        ))}

        {/* Day cells */}
        {Array.from({ length: monthDef.days }).map((_, i) => {
          const day = i + 1;
          const date: CalDate = { year: viewYear, month: viewMonth, day };
          const dot = eventDot(date);
          const curr = isToday(date);
          const sel = isSelected(date);
          return (
            <button
              key={day}
              className={[
                styles.dayCell,
                curr ? styles.today : "",
                sel ? styles.selected : "",
              ].join(" ")}
              onClick={() => selectDay(date)}
            >
              <span className={styles.dayNum}>{day}</span>
              {dot && <span className={styles.dot} />}
            </button>
          );
        })}
      </div>

      {/* Intercalary bands */}
      {followingIntercalary.length > 0 && (
        <div className={styles.intercalarySection}>
          {followingIntercalary.map(({ p, i }) => (
            <div key={i} className={styles.intercalaryBand}>
              <span className={styles.intercalaryLabel}>✦ {p.name}</span>
              <div className={styles.intercalaryDays}>
                {Array.from({ length: p.days }).map((_, d) => {
                  const date: CalDate = { year: viewYear, month: -1, intercalaryIdx: i, day: d + 1 };
                  const dot = eventDot(date);
                  const curr = isToday(date);
                  const sel = isSelected(date);
                  return (
                    <button
                      key={d}
                      className={[
                        styles.intDayCell,
                        curr ? styles.today : "",
                        sel ? styles.selected : "",
                      ].join(" ")}
                      onClick={() => selectDay(date)}
                    >
                      {p.days > 1 && <span className={styles.dayNum}>{d + 1}</span>}
                      {dot && <span className={styles.dot} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Event panel */}
      {selectedDate && (
        <div className={styles.eventPanel}>
          <div className={styles.eventPanelHeader}>
            <span className={styles.eventPanelDate}>{formatCalDate(selectedDate, def!)}</span>
            <button className={styles.closePanel} onClick={() => setSelectedDate(null)}>×</button>
          </div>

          {selectedEvents.length === 0 && !addingEvent && (
            <div className={styles.noEvents}>No events</div>
          )}

          {selectedEvents.map((ev) => (
            <div key={ev.id} className={styles.eventItem}>
              <div className={styles.eventTop}>
                <span className={styles.eventTitle}>{ev.title}</span>
                {ev.duration && ev.duration > 1 && (
                  <span className={styles.durationBadge}>{ev.duration}d</span>
                )}
                <button className={styles.removeEvent} onClick={() => removeEvent(ev.id)}>×</button>
              </div>
              {ev.note && <div className={styles.eventNote}>{ev.note}</div>}
            </div>
          ))}

          {addingEvent ? (
            <div className={styles.addForm}>
              <input
                className={styles.addInput}
                placeholder="Event title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") addEvent(); if (e.key === "Escape") setAddingEvent(false); }}
              />
              <textarea
                className={styles.addTextarea}
                placeholder="Notes (optional)"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={2}
              />
              <div className={styles.addFooter}>
                <label className={styles.durationLabel}>
                  Duration:
                  <input
                    type="number"
                    className={styles.durationInput}
                    value={newDuration}
                    min={1}
                    onChange={(e) => setNewDuration(e.target.value)}
                  />
                  day{parseInt(newDuration, 10) !== 1 ? "s" : ""}
                </label>
                <button className={styles.addSaveBtn} onClick={addEvent}>Add</button>
                <button className={styles.addCancelBtn} onClick={() => setAddingEvent(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className={styles.addEventBtn} onClick={() => setAddingEvent(true)}>
              + Add event
            </button>
          )}
        </div>
      )}
    </div>
  );
}
