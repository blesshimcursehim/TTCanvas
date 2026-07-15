// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { useCalendar } from "@ttcanvas/core";
import type { CalDate, CalendarDef } from "@ttcanvas/core";
import { calDateToAbsDay, formatCalDate } from "../calendar/utils";
import { autoAccentColor } from "../npc-library/npcFormat";
import type { CampaignTimelineState, TimelineEntry } from "./types";
import { CATEGORY_PRESETS, CATEGORY_KEYS, isPreset } from "./types";
import { mergeTimeline } from "./timeline";
import type { StreamItem } from "./timeline";
import { ConfirmDeleteButton } from "../shared/ConfirmDeleteButton";
import { ModeToggle } from "../shared/ModeToggle";
import styles from "./CampaignTimeline.module.css";

interface Props {
  state: CampaignTimelineState;
  onChange: (state: CampaignTimelineState) => void;
}

function categoryMeta(category: string): { label: string; color: string } {
  return isPreset(category) ? CATEGORY_PRESETS[category] : { label: category, color: autoAccentColor(category) };
}

export function CampaignTimeline({ state, onChange }: Props) {
  const cal = useCalendar();
  const [grouped, setGrouped] = useState(false);
  // null = not editing; "new" = adding; otherwise the entry being edited.
  const [editing, setEditing] = useState<TimelineEntry | "new" | null>(null);

  function saveEntry(entry: TimelineEntry) {
    const exists = state.entries.some((e) => e.id === entry.id);
    const entries = exists ? state.entries.map((e) => (e.id === entry.id ? entry : e)) : [...state.entries, entry];
    onChange({ ...state, entries });
    setEditing(null);
  }

  function deleteEntry(id: string) {
    onChange({ ...state, entries: state.entries.filter((e) => e.id !== id) });
    setEditing(null);
  }

  // Only Chronicle entries are editable; look the real entry up by id (calendar events never reach here).
  function editEntry(id: string) {
    const e = state.entries.find((x) => x.id === id);
    if (e) setEditing(e);
  }

  if (!cal.def) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <p>No calendar yet.</p>
          <p className={styles.emptyHint}>The Chronicle pins entries to your in-game calendar. Add a Calendar widget and set one up first.</p>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className={styles.root}>
        <EntryForm
          def={cal.def}
          initial={editing === "new" ? null : editing}
          defaultDate={cal.currentDate}
          onSave={saveEntry}
          onDelete={deleteEntry}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  const stream = mergeTimeline(state.entries, cal.events, cal.def, cal.currentDate);
  const currentAbs = cal.currentDate ? calDateToAbsDay(cal.currentDate, cal.def) : null;
  // The "Now" divider sits before the first item that isn't in the past (or after everything).
  const dividerBefore = currentAbs === null ? -1 : Math.max(0, stream.findIndex((s) => s.timePos !== "past"));
  const dividerAtEnd = currentAbs !== null && stream.every((s) => s.timePos === "past");

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={() => setEditing("new")}>+ Entry</button>
        <span className={styles.spacer} />
        <ModeToggle
          value={grouped ? "grouped" : "timeline"}
          onChange={(v) => setGrouped(v === "grouped")}
          options={[{ value: "timeline", label: "Timeline" }, { value: "grouped", label: "Grouped" }]}
        />
      </div>

      <div className={styles.stream}>
        {stream.length === 0 ? (
          <div className={styles.empty}>
            <p>Nothing on the timeline yet.</p>
            <p className={styles.emptyHint}>Add plot beats, foreshadowing, or session recaps with <strong>+ Entry</strong>. Calendar events show up here automatically.</p>
          </div>
        ) : grouped ? (
          <GroupedView stream={stream} def={cal.def} currentAbs={currentAbs} onEdit={editEntry} />
        ) : (
          <SpineView stream={stream} def={cal.def} dividerBefore={dividerBefore} dividerAtEnd={dividerAtEnd} nowLabel={cal.currentDate ? formatCalDate(cal.currentDate, cal.def) : ""} onEdit={editEntry} />
        )}
      </div>
    </div>
  );
}

// ── Spine timeline ──────────────────────────────────────────────

function NowDivider({ label }: { label: string }) {
  return (
    <div className={styles.nowDivider}>
      <span className={styles.nowDot} />
      <span className={styles.nowLabel}>Now{label ? ` · ${label}` : ""}</span>
    </div>
  );
}

function SpineView({ stream, def, dividerBefore, dividerAtEnd, nowLabel, onEdit }: {
  stream: StreamItem[]; def: CalendarDef; dividerBefore: number; dividerAtEnd: boolean; nowLabel: string;
  onEdit: (id: string) => void;
}) {
  return (
    <div className={styles.spine}>
      {stream.map((item, i) => (
        <div key={`${item.kind}-${item.id}`}>
          {i === dividerBefore && <NowDivider label={nowLabel} />}
          <SpineRow item={item} def={def} onEdit={onEdit} />
        </div>
      ))}
      {dividerAtEnd && <NowDivider label={nowLabel} />}
    </div>
  );
}

function SpineRow({ item, def, onEdit }: { item: StreamItem; def: CalendarDef; onEdit: (id: string) => void }) {
  return (
    <div className={`${styles.row} ${styles[item.timePos]}`}>
      <div className={styles.spineCol}>
        <span className={`${styles.node} ${item.kind === "event" ? styles.nodeEvent : ""}`} />
      </div>
      <StreamCard item={item} def={def} onEdit={onEdit} />
    </div>
  );
}

// ── Grouped-by-date ─────────────────────────────────────────────

function GroupedView({ stream, def, currentAbs, onEdit }: {
  stream: StreamItem[]; def: CalendarDef; currentAbs: number | null; onEdit: (id: string) => void;
}) {
  const groups: { absDay: number; date: CalDate; items: StreamItem[] }[] = [];
  for (const item of stream) {
    const last = groups[groups.length - 1];
    if (last && last.absDay === item.absDay) last.items.push(item);
    else groups.push({ absDay: item.absDay, date: item.date, items: [item] });
  }
  return (
    <div className={styles.grouped}>
      {groups.map((g) => (
        <div key={g.absDay} className={styles.group}>
          <div className={styles.groupHead}>
            <span>{formatCalDate(g.date, def)}</span>
            {currentAbs === g.absDay && <span className={styles.nowBadge}>Now</span>}
          </div>
          {g.items.map((item) => <StreamCard key={`${item.kind}-${item.id}`} item={item} def={def} onEdit={onEdit} inGroup />)}
        </div>
      ))}
    </div>
  );
}

// ── Shared card ─────────────────────────────────────────────────

function StreamCard({ item, def, onEdit, inGroup }: {
  item: StreamItem; def: CalendarDef; onEdit: (id: string) => void; inGroup?: boolean;
}) {
  const isEvent = item.kind === "event";
  const cat = item.category ? categoryMeta(item.category) : null;
  // Calendar events are read-only here (edited in the Calendar widget); entries open the editor.
  const editable = !isEvent;
  const content = (
    <>
      <div className={styles.cardHead}>
        {!inGroup && <span className={styles.cardDate}>{formatCalDate(item.date, def)}</span>}
        {isEvent
          ? <span className={styles.calTag}>Calendar</span>
          : cat && <span className={styles.chip} style={{ color: cat.color, borderColor: cat.color }}>{cat.label}</span>}
      </div>
      <div className={styles.cardTitle}>{item.title}</div>
      {item.body && <div className={styles.cardBody}>{item.body}</div>}
    </>
  );
  return editable ? (
    <button className={`${styles.card} ${styles.cardEntry}`} onClick={() => onEdit(item.id)}>{content}</button>
  ) : (
    <div className={`${styles.card} ${styles.cardEvent}`} title="Calendar event (edit in the Calendar widget)">{content}</div>
  );
}

// ── Entry editor ────────────────────────────────────────────────

function EntryForm({ def, initial, defaultDate, onSave, onDelete, onCancel }: {
  def: CalendarDef;
  initial: TimelineEntry | null;
  defaultDate: CalDate | null;
  onSave: (e: TimelineEntry) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const start = initial?.date ?? defaultDate ?? { year: 1, month: 0, day: 1 };
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [date, setDate] = useState<CalDate>(start);
  const [category, setCategory] = useState(initial?.category ?? "plot");
  const [customMode, setCustomMode] = useState(initial ? !isPreset(initial.category) : false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // A regular month clamps day to its length; month -1 (intercalary) is not offered when adding.
  const monthDays = date.month >= 0 && date.month < def.months.length ? def.months[date.month].days : 31;

  function save() {
    const t = title.trim();
    if (!t) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: t,
      body: body.trim() || undefined,
      category: category.trim() || "other",
      date: { year: date.year, month: date.month, day: Math.min(Math.max(1, date.day), monthDays) },
    });
  }

  return (
    <div className={styles.form}>
      <div className={styles.formHead}>
        <span className={styles.formTitle}>{initial ? "Edit entry" : "New entry"}</span>
        <button className={styles.iconBtn} onClick={onCancel} aria-label="Cancel">✕</button>
      </div>

      <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Entry title" autoFocus />

      <div className={styles.dateRow}>
        <input className={styles.yearInput} type="number" value={date.year} onChange={(e) => setDate({ ...date, year: parseInt(e.target.value, 10) || 1 })} aria-label="Year" />
        <select className={styles.monthSelect} value={date.month} onChange={(e) => setDate({ ...date, month: parseInt(e.target.value, 10) })} aria-label="Month">
          {def.months.map((m, i) => <option key={m.name} value={i}>{m.name}</option>)}
        </select>
        <input className={styles.dayInput} type="number" min={1} max={monthDays} value={date.day} onChange={(e) => setDate({ ...date, day: parseInt(e.target.value, 10) || 1 })} aria-label="Day" />
      </div>

      <div className={styles.catRow}>
        {CATEGORY_KEYS.map((k) => {
          const active = !customMode && category === k;
          return (
            <button
              key={k}
              className={`${styles.catBtn} ${active ? styles.catActive : ""}`}
              style={active ? { color: CATEGORY_PRESETS[k].color, borderColor: CATEGORY_PRESETS[k].color } : undefined}
              onClick={() => { setCustomMode(false); setCategory(k); }}
              aria-pressed={active}
            >
              {CATEGORY_PRESETS[k].label}
            </button>
          );
        })}
        <button className={`${styles.catBtn} ${customMode ? styles.catActive : ""}`} onClick={() => { setCustomMode(true); setCategory(""); }} aria-pressed={customMode}>Custom</button>
      </div>
      {customMode && (
        <input className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Custom label" aria-label="Custom category" />
      )}

      <textarea className={styles.textarea} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notes (optional)" aria-label="Entry notes" rows={3} />

      <div className={styles.formActions}>
        {initial && (
          <ConfirmDeleteButton
            confirming={confirmDelete}
            trigger="Delete"
            className={styles.deleteBtn}
            rowClassName={styles.confirmRow}
            confirmClassName={styles.confirmYes}
            cancelClassName={styles.confirmNo}
            onRequestConfirm={() => setConfirmDelete(true)}
            onConfirm={() => onDelete(initial.id)}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
        <span className={styles.spacer} />
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button className={styles.saveBtn} onClick={save} disabled={!title.trim() || (customMode && !category.trim())}>Save</button>
      </div>
    </div>
  );
}
