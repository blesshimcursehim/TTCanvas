// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { useCalendar } from "@ttcanvas/core";
import type { CalendarState } from "@ttcanvas/core";
import { CalendarSetup } from "./CalendarSetup";
import { CalendarView } from "./CalendarView";
import styles from "./Calendar.module.css";

interface Props {
  state: CalendarState;
  onChange: (s: CalendarState) => void;
}

export function Calendar({ state, onChange }: Props) {
  const calCtx = useCalendar();
  const [showSetup, setShowSetup] = useState(state.def === null);

  function handleSetupConfirm(def: import("@ttcanvas/core").CalendarDef, startYear: number) {
    const newState = { ...state, def };
    onChange(newState);
    if (calCtx.currentDate === null) {
      calCtx.setTimeState({
        currentDate: { year: startYear, month: 0, day: 1 },
        currentHour: 8,
        currentMinute: 0,
        history: [],
        showOnPlayer: false,
      });
    }
    setShowSetup(false);
  }

  return (
    <>
      {!state.def || showSetup ? (
        <div className={styles.empty}>
          <span className={styles.emptyLabel}>No calendar configured</span>
          <button className={styles.setupBtn} onClick={() => setShowSetup(true)}>
            Set up calendar
          </button>
        </div>
      ) : (
        <CalendarView
          state={state}
          onChange={onChange}
          onEdit={() => setShowSetup(true)}
        />
      )}
      {showSetup && (
        <CalendarSetup
          initial={state.def ?? undefined}
          initialYear={calCtx.currentDate?.year}
          onConfirm={handleSetupConfirm}
          onCancel={() => setShowSetup(false)}
        />
      )}
    </>
  );
}
