// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PartyTrackerState, PartyMember } from "./types";
import { CharacterCard, portraitColor, usePortraitDataUrl } from "./CharacterCard";
import { ManagePartyModal } from "./ManagePartyModal";
import { PCSheetModal } from "../shared/PCSheetModal";
import styles from "./PartyTracker.module.css";

interface Props {
  state: PartyTrackerState;
  onChange: (state: PartyTrackerState) => void;
}

interface SortableCardProps {
  member: PartyMember;
  onChange: (m: PartyMember) => void;
  onOpenSheet: () => void;
}

function SwitcherBtn({ member, onClick }: { member: PartyMember; onClick: () => void }) {
  const portraitDataUrl = usePortraitDataUrl(member.portraitPath);
  const color = portraitColor(member.id);
  return (
    <button
      className={styles.switcherBtn}
      style={portraitDataUrl ? undefined : { background: color }}
      onClick={onClick}
      title={`Open ${member.name}'s sheet`}
    >
      {portraitDataUrl
        ? <img src={portraitDataUrl} className={styles.switcherImg} alt={member.name} draggable={false} />
        : member.name.charAt(0).toUpperCase()}
    </button>
  );
}

function SortableCard({ member, onChange, onOpenSheet }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <button
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        tabIndex={-1}
      >
        ⠿
      </button>
      <CharacterCard member={member} onChange={onChange} onOpenSheet={onOpenSheet} />
    </div>
  );
}

export function PartyTracker({ state, onChange }: Props) {
  const [showManage, setShowManage] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [sheetMemberId, setSheetMemberId] = useState<string | null>(null);

  const patch = (fields: Partial<PartyTrackerState>) => onChange({ ...state, ...fields });
  const patchMember = (updated: PartyMember) =>
    patch({ members: state.members.map((m) => (m.id === updated.id ? updated : m)) });

  const sheetMember = sheetMemberId ? state.members.find((m) => m.id === sheetMemberId) ?? null : null;

  const tabIdx = Math.min(activeTab, Math.max(0, state.members.length - 1));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = state.members.findIndex((m) => m.id === active.id);
    const newIdx = state.members.findIndex((m) => m.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    patch({ members: arrayMove(state.members, oldIdx, newIdx) });
  }

  return (
    <div className={styles.root}>
      {/* Subheader */}
      <div className={styles.subheader}>
        <span className={styles.memberCount}>
          PARTY <span className={styles.count}>{state.members.length}</span> members
        </span>
        <div className={styles.headerActions}>
          {/* Character switcher - initials row for quick sheet access */}
          {state.members.length > 0 && (
            <div className={styles.switcherRow}>
              {state.members.map((m) => (
                <SwitcherBtn key={m.id} member={m} onClick={() => setSheetMemberId(m.id)} />
              ))}
            </div>
          )}
          <button
            className={styles.dotsBtn}
            onClick={() => setShowManage(true)}
            title="Manage party"
          >
            •••
          </button>
          {state.members.length > 0 && (
            <button
              className={styles.modeBtn}
              onClick={() => patch({ compact: !state.compact })}
              title={state.compact ? "Expand all" : "Focus one"}
            >
              {state.compact ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                    <rect x="0.75" y="0.75" width="4" height="4" rx="0.75" />
                    <rect x="6.25" y="0.75" width="4" height="4" rx="0.75" />
                    <rect x="0.75" y="6.25" width="4" height="4" rx="0.75" />
                    <rect x="6.25" y="6.25" width="4" height="4" rx="0.75" />
                  </svg>
                  Expand
                </>
              ) : (
                <>
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                    <rect x="0.75" y="0.75" width="10.5" height="8.5" rx="1.25" />
                    <line x1="6" y1="0.75" x2="6" y2="9.25" />
                  </svg>
                  Focus
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {state.members.length === 0 ? (
        <div className={styles.empty}>
          No party members.{" "}
          <button className={styles.emptyLink} onClick={() => setShowManage(true)}>
            Add some →
          </button>
        </div>
      ) : state.compact ? (
        <>
          {/* Tab bar */}
          <div className={styles.tabs}>
            {state.members.map((m, i) => (
              <button
                key={m.id}
                className={`${styles.tab} ${i === tabIdx ? styles.activeTab : ""}`}
                onClick={() => setActiveTab(i)}
              >
                <span
                  className={styles.tabAvatar}
                  style={{ background: portraitColor(m.id) }}
                >
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className={styles.tabName}>{m.name}</span>
                {m.inspiration && <span className={styles.tabStar}>✦</span>}
              </button>
            ))}
          </div>

          <div className={styles.scrollArea}>
            {state.members[tabIdx] && (
              <CharacterCard
                member={state.members[tabIdx]}
                onChange={patchMember}
                onOpenSheet={() => setSheetMemberId(state.members[tabIdx].id)}
              />
            )}
          </div>
        </>
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={state.members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className={styles.grid}>
              {state.members.map((m) => (
                <SortableCard
                  key={m.id}
                  member={m}
                  onChange={patchMember}
                  onOpenSheet={() => setSheetMemberId(m.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showManage && (
        <ManagePartyModal
          members={state.members}
          onChange={(members) => patch({ members })}
          onClose={() => setShowManage(false)}
        />
      )}

      {sheetMember && (
        <PCSheetModal
          member={sheetMember}
          onSave={patchMember}
          onClose={() => setSheetMemberId(null)}
        />
      )}
    </div>
  );
}
