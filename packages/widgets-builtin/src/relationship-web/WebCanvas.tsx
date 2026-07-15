// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { RelNode, RelEdge } from "./types";
import { EDGE_TYPES } from "./types";
import { npcInitials } from "../npc-library/npcFormat";
import styles from "./RelationshipWeb.module.css";

const NODE_R = 26;
const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag rather than a click
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

interface View {
  panX: number;
  panY: number;
  k: number;
}

interface Props {
  nodes: RelNode[];
  edges: RelEdge[];
  selectedId: string | null;
  linking: boolean;
  linkSource: string | null;
  displayName: (node: RelNode) => string;
  nodeColor: (node: RelNode) => string;
  nodePortrait: (node: RelNode) => string | null;
  onSelect: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onNodeActivate: (id: string) => void; // click (below drag threshold) in normal or link mode
}

export function WebCanvas(props: Props) {
  const { nodes, edges, selectedId, linking, linkSource, displayName, nodeColor, nodePortrait, onSelect, onMoveNode, onNodeActivate } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ panX: 0, panY: 0, k: 1 });
  const centred = useRef(false);

  // Centre the origin in the viewport on first mount (nodes cluster around 0,0).
  // Deliberately no dependency array: on the very first layout the wrapper can still
  // report a zero-size rect, so this retries on every render until it succeeds once -
  // the `centred` ref guard (checked and set within the same run, before any other
  // render can occur) makes `setView` fire exactly once, so this can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (centred.current || !wrapRef.current) return;
    const { width, height } = wrapRef.current.getBoundingClientRect();
    if (width > 0 && height > 0) {
      setView((v) => ({ ...v, panX: width / 2, panY: height / 2 }));
      centred.current = true;
    }
  });

  // A single active pointer gesture: either dragging a node or panning the background.
  const gesture = useRef<
    | { kind: "node"; id: string; offX: number; offY: number; startX: number; startY: number; moved: boolean }
    | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
    | null
  >(null);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nodePos = (id: string) => byId.get(id);

  function toGraph(clientX: number, clientY: number): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.panX) / view.k, y: (clientY - rect.top - view.panY) / view.k };
  }

  function onNodePointerDown(e: ReactPointerEvent, node: RelNode) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const g = toGraph(e.clientX, e.clientY);
    gesture.current = { kind: "node", id: node.id, offX: node.x - g.x, offY: node.y - g.y, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function onBackgroundPointerDown(e: ReactPointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "node") {
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD) return;
      g.moved = true;
      const p = toGraph(e.clientX, e.clientY);
      onMoveNode(g.id, Math.round(p.x + g.offX), Math.round(p.y + g.offY));
    } else {
      setView((v) => ({ ...v, panX: g.panX + (e.clientX - g.startX), panY: g.panY + (e.clientY - g.startY) }));
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "node" && !g.moved) onNodeActivate(g.id);
    else if (g.kind === "pan" && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD) onSelect(null);
  }

  // Native, non-passive wheel listener so preventDefault actually fires, and stopPropagation keeps
  // the zoom on the graph instead of bubbling to the app canvas (see MapDisplay for the same pattern).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
        const scale = k / v.k;
        // Keep the point under the cursor fixed whilst zooming.
        return { k, panX: cx - (cx - v.panX) * scale, panY: cy - (cy - v.panY) * scale };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={wrapRef}
      className={styles.canvas}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg className={styles.svg} role="presentation">
        <defs>
          {/* One shared circular clip - each node's <image> sits in its own translated <g>, so the
              clip at the local origin lines up with that node. */}
          <clipPath id="rw-node-clip"><circle r={NODE_R} /></clipPath>
        </defs>
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.k})`}>
          {edges.map((edge) => {
            const a = nodePos(edge.from), b = nodePos(edge.to);
            if (!a || !b) return null;
            return <EdgeShape key={edge.id} edge={edge} a={a} b={b} selected={edge.id === selectedId} onSelect={onSelect} />;
          })}
          {nodes.map((node) => {
            const isSel = node.id === selectedId;
            const isLinkSrc = node.id === linkSource;
            const color = nodeColor(node);
            const portrait = nodePortrait(node);
            const ring = `${styles.nodeCircle} ${isSel ? styles.nodeSelected : ""} ${isLinkSrc ? styles.nodeLinkSrc : ""}`;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                className={styles.node}
                onPointerDown={(e) => onNodePointerDown(e, node)}
                style={{ cursor: linking ? "crosshair" : "grab" }}
              >
                {portrait ? (
                  <>
                    {/* Colour backs the portrait in case it has transparency; the ring sits on top. */}
                    <circle r={NODE_R} fill={color} />
                    <image
                      href={portrait}
                      xlinkHref={portrait} // belt-and-braces: older WebKit renders SVG <image> only via xlink:href
                      x={-NODE_R}
                      y={-NODE_R}
                      width={NODE_R * 2}
                      height={NODE_R * 2}
                      clipPath="url(#rw-node-clip)"
                      preserveAspectRatio="xMidYMid slice"
                    />
                    <circle r={NODE_R} fill="none" className={ring} />
                  </>
                ) : (
                  <>
                    <circle r={NODE_R} fill={color} className={ring} />
                    <text className={styles.nodeInitials} textAnchor="middle" dominantBaseline="central">{npcInitials(displayName(node))}</text>
                  </>
                )}
                <text className={styles.nodeLabel} textAnchor="middle" y={NODE_R + 14}>{displayName(node)}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function EdgeShape({ edge, a, b, selected, onSelect }: {
  edge: RelEdge; a: RelNode; b: RelNode; selected: boolean; onSelect: (id: string) => void;
}) {
  const meta = EDGE_TYPES[edge.type];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // Stop the line at each node's rim so it doesn't run under the disc.
  const x1 = a.x + ux * NODE_R, y1 = a.y + uy * NODE_R;
  const x2 = b.x - ux * NODE_R, y2 = b.y - uy * NODE_R;
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  const label = edge.label || (edge.type === "custom" ? "" : meta.label);

  // Manual arrowhead (a small filled triangle) for directed types - robust across webviews.
  const arrow = meta.directed
    ? `${x2},${y2} ${x2 - ux * 11 - uy * 6},${y2 - uy * 11 + ux * 6} ${x2 - ux * 11 + uy * 6},${y2 - uy * 11 - ux * 6}`
    : null;

  return (
    <g className={styles.edge} onPointerDown={(e) => { e.stopPropagation(); onSelect(edge.id); }}>
      {/* Fat transparent hit line so thin edges are still easy to click. */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={meta.color} strokeWidth={selected ? 4 : 2.25} strokeLinecap="round" opacity={selected ? 1 : 0.85} />
      {arrow && <polygon points={arrow} fill={meta.color} />}
      {label && (
        <text className={styles.edgeLabel} x={midX} y={midY} textAnchor="middle" dominantBaseline="central" fill={meta.color} paintOrder="stroke">
          {label}
        </text>
      )}
    </g>
  );
}
