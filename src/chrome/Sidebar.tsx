// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "../icons/Icon";
import { getWidget } from "../registry";
import styles from "./Sidebar.module.css";

export interface RailWidget {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  widgets: RailWidget[];
  focusedId: string | null;
  onFocusWidget: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

interface RailBtnProps {
  widget: RailWidget;
  isFocused: boolean;
  onFocus: () => void;
}

function RailBtn({ widget, isFocused, onFocus }: RailBtnProps) {
  const def = getWidget(widget.type);
  const iconName = (def?.icon ?? "canvas") as Parameters<typeof Icon>[0]["name"];
  const title = def?.title ?? widget.type;

  const [showTip, setShowTip] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.btnWrap}>
      <button
        className={`${styles.railBtn} ${isFocused ? styles.railBtnActive : ""}`}
        onClick={onFocus}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        title={title}
        {...attributes}
        {...listeners}
      >
        <Icon name={iconName} size={18} stroke={1.5} />
      </button>
      {showTip && !isDragging && (
        <div className={styles.tooltip}>
          <span className={styles.tooltipName}>{title}</span>
          <span className={styles.tooltipHint}>click to focus · drag to reorder</span>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ widgets, focusedId, onFocusWidget, onReorder }: Props) {
  // Require 8px movement before drag activates - lets a simple click fire onClick normally.
  // KeyboardSensor is in dnd-kit's own default sensor list (unlike PartyTracker's DndContext,
  // which takes no `sensors` prop and so keeps that default for free) - specifying PointerSensor
  // here without it silently dropped keyboard reordering, the one bit of this list that isn't
  // already covered by the rail buttons' own Tab order and click-to-focus.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.findIndex((w) => w.id === active.id);
    const newIdx = widgets.findIndex((w) => w.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onReorder(arrayMove(widgets, oldIdx, newIdx).map((w) => w.id));
  }

  return (
    <nav className={styles.sidebar} aria-label="Widget rail">
      {/* Head cell */}
      <div className={styles.head}>
        <Icon name="layouts" size={14} stroke={1.4} />
      </div>

      {/* Widget list */}
      <div className={styles.list}>
        {widgets.length === 0 ? (
          <span className={styles.empty}>EMPTY<br />CANVAS</span>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
              {widgets.map((w) => (
                <RailBtn
                  key={w.id}
                  widget={w}
                  isFocused={w.id === focusedId}
                  onFocus={() => {
                    onFocusWidget(w.id);
                    window.dispatchEvent(
                      new CustomEvent("ttcanvas:focus-widget", {
                        detail: { x: w.x, y: w.y, w: w.width, h: w.height },
                      }),
                    );
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.count}>{widgets.length}</span>
      </div>
    </nav>
  );
}
