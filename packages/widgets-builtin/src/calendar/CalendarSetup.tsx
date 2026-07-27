// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState, useRef, useId } from "react";
import { ModalDialog } from "../shared/ModalDialog";
import type { CalendarDef, MonthDef, IntercalaryPeriod } from "@ttcanvas/core";
import { useVault } from "@ttcanvas/core";
import { PRESETS } from "./presets";
import { validateCalendarDef } from "./utils";
import styles from "./CalendarSetup.module.css";

interface Props {
  initial?: CalendarDef;
  initialYear?: number;
  onConfirm: (def: CalendarDef, startYear: number) => void;
  onCancel: () => void;
}

function defToForm(def: CalendarDef) {
  return {
    name: def.name,
    epochLabel: def.epochLabel,
    weekLength: String(def.weekLength),
    weekDayNames: [...def.weekDayNames],
    startWeekday: String(def.startWeekday),
    months: def.months.map((m) => ({ name: m.name, days: String(m.days) })),
    intercalary: def.intercalaryPeriods.map((p) => ({
      name: p.name,
      days: String(p.days),
      afterMonth: String(p.afterMonth),
      repeatEvery: p.repeatEvery ? String(p.repeatEvery) : "",
    })),
  };
}

type FormState = ReturnType<typeof defToForm>;
const DEFAULT_PRESET_INDEX = PRESETS.length - 1;

export function CalendarSetup({ initial, initialYear, onConfirm, onCancel }: Props) {
  const vault = useVault();
  const [form, setForm] = useState<FormState>(() =>
    defToForm(initial ?? PRESETS[DEFAULT_PRESET_INDEX].def)
  );
  const [selectedPreset, setSelectedPreset] = useState<number | null>(
    initial ? null : DEFAULT_PRESET_INDEX,
  );
  const [startYear, setStartYear] = useState(String(initialYear ?? 1));
  const [extraPresets, setExtraPresets] = useState<Array<{ label: string; def: CalendarDef }>>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportFlash, setExportFlash] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  function applyPreset(idx: number) {
    setSelectedPreset(idx);
    setForm(defToForm(PRESETS[idx].def));
  }

  function syncWeekDayNames(newLen: number, current: string[]): string[] {
    const names = [...current];
    while (names.length < newLen) names.push(`Day ${names.length + 1}`);
    return names.slice(0, newLen);
  }

  function setWeekLength(val: string) {
    const n = Math.max(1, Math.min(28, Number(val) || 1));
    setSelectedPreset(null);
    setForm((f) => ({
      ...f,
      weekLength: String(n),
      weekDayNames: syncWeekDayNames(n, f.weekDayNames),
    }));
  }

  function setWeekDayName(idx: number, val: string) {
    setSelectedPreset(null);
    setForm((f) => {
      const names = [...f.weekDayNames];
      names[idx] = val;
      return { ...f, weekDayNames: names };
    });
  }

  function setMonth(idx: number, field: "name" | "days", val: string) {
    setSelectedPreset(null);
    setForm((f) => {
      const months = f.months.map((m, i) => i === idx ? { ...m, [field]: val } : m);
      return { ...f, months };
    });
  }

  function addMonth() {
    setSelectedPreset(null);
    setForm((f) => ({
      ...f,
      months: [...f.months, { name: `Month ${f.months.length + 1}`, days: "30" }],
    }));
  }

  function removeMonth(idx: number) {
    setSelectedPreset(null);
    setForm((f) => ({ ...f, months: f.months.filter((_, i) => i !== idx) }));
  }

  function setIntercalary(idx: number, field: keyof FormState["intercalary"][0], val: string) {
    setSelectedPreset(null);
    setForm((f) => {
      const intercalary = f.intercalary.map((p, i) => i === idx ? { ...p, [field]: val } : p);
      return { ...f, intercalary };
    });
  }

  function addIntercalary() {
    setSelectedPreset(null);
    setForm((f) => ({
      ...f,
      intercalary: [...f.intercalary, { name: "Festival Day", days: "1", afterMonth: "0", repeatEvery: "" }],
    }));
  }

  function removeIntercalary(idx: number) {
    setSelectedPreset(null);
    setForm((f) => ({ ...f, intercalary: f.intercalary.filter((_, i) => i !== idx) }));
  }

  function buildDef(): CalendarDef | null {
    const weekLen = parseInt(form.weekLength, 10);
    if (!form.name.trim() || isNaN(weekLen) || weekLen < 1) return null;
    const months: MonthDef[] = form.months.map((m) => ({
      name: m.name.trim() || "Month",
      days: Math.max(1, parseInt(m.days, 10) || 1),
    }));
    if (months.length === 0) return null;
    const intercalaryPeriods: IntercalaryPeriod[] = form.intercalary
      .map((p) => {
        const afterMonth = parseInt(p.afterMonth, 10);
        const days = Math.max(1, parseInt(p.days, 10) || 1);
        const repeatEvery = p.repeatEvery ? parseInt(p.repeatEvery, 10) : undefined;
        return {
          name: p.name.trim() || "Festival",
          days,
          afterMonth: Math.min(months.length - 1, Math.max(0, afterMonth)),
          ...(repeatEvery && repeatEvery > 0 ? { repeatEvery } : {}),
        };
      });
    return {
      name: form.name.trim(),
      epochLabel: form.epochLabel.trim(),
      weekLength: weekLen,
      weekDayNames: form.weekDayNames.map((n, i) => n || `Day ${i + 1}`),
      startWeekday: Math.max(0, Math.min(weekLen - 1, parseInt(form.startWeekday, 10) || 0)),
      months,
      intercalaryPeriods,
    };
  }

  async function handleExportPreset() {
    const def = buildDef();
    if (!def) return;
    const json = JSON.stringify({ version: 1, def }, null, 2);
    const defaultName = `${def.name.replace(/\s+/g, "-").toLowerCase()}.calendar.json`;
    const saved = await vault.saveTextFile(json, defaultName);
    if (saved) {
      setExportFlash(true);
      setTimeout(() => setExportFlash(false), 1800);
    }
  }

  function handleImportPreset(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportError(null);
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const def = parsed?.def ?? parsed;
        if (!Array.isArray(def?.months) || !Array.isArray(def?.weekDayNames)) {
          setImportError("Invalid calendar file - must have months and weekDayNames.");
          return;
        }
        const errs = validateCalendarDef(def as CalendarDef);
        if (errs.length > 0) {
          setImportError(`Invalid calendar: ${errs[0]}${errs.length > 1 ? ` (and ${errs.length - 1} more)` : ""}`);
          return;
        }
        const label = (def.name as string) || "Imported";
        const idx = PRESETS.length + extraPresets.length;
        setExtraPresets((p) => [...p, { label, def: def as CalendarDef }]);
        setSelectedPreset(idx);
        setForm(defToForm(def as CalendarDef));
      } catch {
        setImportError("Could not parse file as JSON.");
      }
    };
    reader.readAsText(file);
  }

  function handleConfirm() {
    const def = buildDef();
    if (def) onConfirm(def, Math.max(1, parseInt(startYear, 10) || 1));
  }

  const weekLen = parseInt(form.weekLength, 10) || 1;

  const heading = initial ? "Edit Calendar" : "Set Up Calendar";

  return (
    <ModalDialog label={heading} onClose={onCancel} backdropClose={false}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>{heading}</span>
          <button className={styles.closeBtn} onClick={onCancel} aria-label="Close calendar setup">×</button>
        </div>

        <div className={styles.body}>
          {/* Presets */}
          <section className={styles.section}>
            <div className={styles.presetHeader}>
              <div className={styles.sectionLabel}>Preset</div>
              <div className={styles.presetActions}>
                <button
                  className={`${styles.presetActionBtn} ${exportFlash ? styles.presetActionBtnSaved : ""}`}
                  onClick={handleExportPreset}
                  title="Export current calendar definition as .calendar.json"
                >
                  {exportFlash ? "Saved ✓" : "Export preset"}
                </button>
                <button
                  className={styles.presetActionBtn}
                  onClick={() => importInputRef.current?.click()}
                  title="Import a .calendar.json file"
                >
                  Import preset
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,.calendar.json"
                  style={{ display: "none" }}
                  onChange={handleImportPreset}
                />
              </div>
            </div>
            <div className={styles.presets}>
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  className={`${styles.presetBtn} ${selectedPreset === i ? styles.presetActive : ""}`}
                  onClick={() => applyPreset(i)}
                >
                  {p.label}
                </button>
              ))}
              {extraPresets.map((p, i) => {
                const idx = PRESETS.length + i;
                return (
                  <button
                    key={`extra-${i}`}
                    className={`${styles.presetBtn} ${styles.presetImported} ${selectedPreset === idx ? styles.presetActive : ""}`}
                    onClick={() => { setSelectedPreset(idx); setForm(defToForm(p.def)); }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {importError && <div className={styles.importError}>{importError}</div>}
          </section>

          <div className={styles.divider} />

          {/* Basics */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Basics</div>
            <div className={styles.row}>
              <label className={styles.label} htmlFor={`${fieldId}-name`}>Name</label>
              <input
                className={styles.input}
                id={`${fieldId}-name`}
                value={form.name}
                onChange={(e) => { setSelectedPreset(null); setForm((f) => ({ ...f, name: e.target.value })); }}
              />
            </div>
            <div className={styles.row}>
              <label className={styles.label} htmlFor={`${fieldId}-epoch`}>Epoch label</label>
              <input
                className={`${styles.input} ${styles.inputSm}`}
                id={`${fieldId}-epoch`}
                value={form.epochLabel}
                placeholder="e.g. DR"
                onChange={(e) => { setSelectedPreset(null); setForm((f) => ({ ...f, epochLabel: e.target.value })); }}
              />
            </div>
            {!initial && (
              <div className={styles.row}>
                <label className={styles.label} htmlFor={`${fieldId}-year`}>Starting year</label>
                <input
                  type="number"
                  className={`${styles.input} ${styles.inputXs}`}
                  id={`${fieldId}-year`}
                  value={startYear}
                  min={1}
                  onChange={(e) => setStartYear(e.target.value)}
                  title="The in-world year the campaign starts in"
                />
              </div>
            )}
            <div className={styles.row}>
              <label className={styles.label} htmlFor={`${fieldId}-weeklen`}>Week length</label>
              <input
                type="number"
                className={`${styles.input} ${styles.inputXs}`}
                id={`${fieldId}-weeklen`}
                value={form.weekLength}
                min={1} max={28}
                onChange={(e) => setWeekLength(e.target.value)}
              />
            </div>
            <div className={styles.row}>
              <label className={styles.label} htmlFor={`${fieldId}-weekday`}>Starting weekday</label>
              <select
                className={`${styles.input} ${styles.inputSm}`}
                id={`${fieldId}-weekday`}
                value={form.startWeekday}
                onChange={(e) => { setSelectedPreset(null); setForm((f) => ({ ...f, startWeekday: e.target.value })); }}
              >
                {Array.from({ length: weekLen }, (_, i) => (
                  <option key={i} value={i}>{form.weekDayNames[i] || `Day ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <div className={styles.dayNamesLabel}>Weekday names</div>
            <div className={styles.dayNamesGrid}>
              {Array.from({ length: weekLen }, (_, i) => (
                <input
                  key={i}
                  className={`${styles.input} ${styles.dayNameInput}`}
                  value={form.weekDayNames[i] ?? ""}
                  onChange={(e) => setWeekDayName(i, e.target.value)}
                />
              ))}
            </div>
          </section>

          <div className={styles.divider} />

          {/* Months */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Months</div>
            {form.months.map((m, i) => (
              <div key={i} className={styles.listRow}>
                <input
                  className={`${styles.input} ${styles.monthName}`}
                  value={m.name}
                  placeholder="Name"
                  onChange={(e) => setMonth(i, "name", e.target.value)}
                />
                <input
                  type="number"
                  className={`${styles.input} ${styles.inputXs}`}
                  value={m.days}
                  min={1}
                  onChange={(e) => setMonth(i, "days", e.target.value)}
                  title="Days"
                />
                <span className={styles.listUnit}>days</span>
                <button className={styles.removeBtn} onClick={() => removeMonth(i)}>×</button>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addMonth}>+ Add month</button>
          </section>

          <div className={styles.divider} />

          {/* Intercalary */}
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Intercalary days</div>
            {form.intercalary.map((p, i) => (
              <div key={i} className={styles.intRow}>
                <input
                  className={`${styles.input} ${styles.intName}`}
                  value={p.name}
                  placeholder="Name"
                  onChange={(e) => setIntercalary(i, "name", e.target.value)}
                />
                <input
                  type="number"
                  className={`${styles.input} ${styles.inputXs}`}
                  value={p.days}
                  min={1}
                  onChange={(e) => setIntercalary(i, "days", e.target.value)}
                  title="Days"
                />
                <span className={styles.listUnit}>days after</span>
                <select
                  className={`${styles.input} ${styles.intAfter}`}
                  value={p.afterMonth}
                  onChange={(e) => setIntercalary(i, "afterMonth", e.target.value)}
                >
                  {form.months.map((m, mi) => (
                    <option key={mi} value={mi}>{m.name || `Month ${mi + 1}`}</option>
                  ))}
                </select>
                <label className={styles.repeatLabel}>
                  every
                  <input
                    type="number"
                    className={`${styles.input} ${styles.inputXs}`}
                    value={p.repeatEvery}
                    min={1}
                    placeholder="-"
                    onChange={(e) => setIntercalary(i, "repeatEvery", e.target.value)}
                    title="Repeat every N years (leave empty for every year)"
                  />
                  yrs
                </label>
                <button className={styles.removeBtn} onClick={() => removeIntercalary(i)}>×</button>
              </div>
            ))}
            <button className={styles.addBtn} onClick={addIntercalary}>+ Add intercalary day</button>
          </section>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            {initial ? "Save" : "Create Calendar"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
