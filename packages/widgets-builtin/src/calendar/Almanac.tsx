// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { useCalendar } from "@ttcanvas/core";
import type { CalendarState, TimeTrackerState } from "@ttcanvas/core";
import { ModeToggle } from "../shared/ModeToggle";
import { TimeTracker } from "../time-tracker/TimeTracker";
import { Calendar } from "./Calendar";
import styles from "./Almanac.module.css";

interface Props {
  state: CalendarState;
  onChange: (s: CalendarState) => void;
}

type Tab = "clock" | "calendar";

const TABS: { value: Tab; label: string }[] = [
  { value: "clock", label: "Clock" },
  { value: "calendar", label: "Calendar" },
];

/**
 * The merged "Almanac" widget: one frame holding the campaign clock and the calendar, switched by a
 * tab. It stays widget type `custom-calendar`, so its own `state` is the CalendarState (def + events);
 * the clock's state lives under the separate `time-tracker` singleton and is reached through
 * `useCalendar()` (read) + `setTimeState` (write), exactly as the standalone TimeTracker already does.
 * That is why this is a thin composition of the two existing widgets rather than a rewrite - each tab
 * renders the real component, so behaviour is identical to the two widgets it replaces.
 */
export function Almanac({ state, onChange }: Props) {
  const cal = useCalendar();
  // A configured Almanac opens on the everyday Clock; a fresh one opens on Calendar to set up first.
  const [tab, setTab] = useState<Tab>(state.def ? "clock" : "calendar");

  // Rebuild the TimeTrackerState the embedded TimeTracker expects from the shared context fields (the
  // `time-tracker` singleton) and write straight back through `setTimeState` - no second store, so the
  // clock stays in lockstep with Initiative Tracker's round-driven advances and any legacy Time Tracker.
  const timeState: TimeTrackerState = {
    currentDate: cal.currentDate,
    currentHour: cal.currentHour,
    currentMinute: cal.currentMinute,
    currentSecond: cal.currentSecond,
    history: cal.history,
    showOnPlayer: cal.showOnPlayer,
  };

  return (
    <div className={styles.root}>
      <div className={styles.tabBar}>
        <ModeToggle value={tab} onChange={setTab} options={TABS} />
      </div>
      <div className={styles.body}>
        {tab === "clock"
          ? <TimeTracker state={timeState} onChange={cal.setTimeState} />
          : <Calendar state={state} onChange={onChange} />}
      </div>
    </div>
  );
}
