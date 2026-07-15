// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Presentational SVG overlay for map markup, shared by the GM widget and the
// player window. Pointer-events are off - all selection / drag interaction is
// handled by the host viewport's mouse handlers via the pure geometry in
// annotations.ts. Geometry is normalised (0-1); the <svg> spans the image so
// shapes stay put under pan / zoom. Strokes use non-scaling-stroke to keep a
// constant on-screen weight; filled decoration (arrowheads, handles) divides by
// `scale` for the same effect.

import type { MapAnnotation, AnnotationColor } from "@ttcanvas/core";
import type { MarkupPreset } from "./types";
import { annotationBounds, handlePoint, HANDLE_IDS } from "./annotations";

const INK_COLORS: Record<AnnotationColor, string> = {
  amber: "oklch(0.82 0.17 80)",
  rose: "oklch(0.66 0.20 15)",
  azure: "oklch(0.70 0.14 240)",
  sage: "oklch(0.74 0.13 150)",
};
const CARTO_COLORS: Record<AnnotationColor, string> = {
  amber: "oklch(0.60 0.08 70)",
  rose: "oklch(0.52 0.09 25)",
  azure: "oklch(0.55 0.06 250)",
  sage: "oklch(0.56 0.06 150)",
};
const HALO = "oklch(0.14 0.01 260 / 0.85)";
const STROKE_PX: Record<1 | 2 | 3, number> = { 1: 2, 2: 3.5, 3: 5 };

function colorOf(preset: MarkupPreset, c: AnnotationColor): string {
  return preset === "ink" ? INK_COLORS[c] : CARTO_COLORS[c];
}

interface Props {
  annotations: MapAnnotation[];
  imgW: number;
  imgH: number;
  preset: MarkupPreset;
  scale: number;
  /** GM-only: id of the selected annotation, renders the transform chrome. Omit in the player window. */
  selectedId?: string | null;
  /** GM view: fade player-hidden (showPlayers === false) shapes as "ghosts". */
  gm?: boolean;
}

export function AnnotationLayer({ annotations, imgW, imgH, preset, scale, selectedId, gm }: Props) {
  const selected = selectedId ? annotations.find((a) => a.id === selectedId) ?? null : null;
  return (
    <svg
      width={imgW}
      height={imgH}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
    >
      <defs>
        {(["amber", "rose", "azure", "sage"] as AnnotationColor[]).map((c) => (
          <pattern key={c} id={`hatch-${c}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke={CARTO_COLORS[c]} strokeWidth="1.4" opacity="0.5" />
          </pattern>
        ))}
      </defs>
      {annotations.map((a) => {
        const ghost = !!gm && a.showPlayers === false;
        return (
          <g key={a.id} opacity={ghost ? 0.4 : 1}>
            <AnnotationShape a={a} imgW={imgW} imgH={imgH} preset={preset} scale={scale} />
          </g>
        );
      })}
      {selected && <SelectionChrome a={selected} imgW={imgW} imgH={imgH} scale={scale} />}
    </svg>
  );
}

function AnnotationShape({ a, imgW, imgH, preset, scale }: { a: MapAnnotation; imgW: number; imgH: number; preset: MarkupPreset; scale: number }) {
  const color = colorOf(preset, a.color);
  const w = STROKE_PX[a.stroke];
  const ink = preset === "ink";
  // Ink gets a dark outer halo drawn as a wider stroke behind the coloured one.
  const halo = ink ? <StrokeShape a={a} imgW={imgW} imgH={imgH} stroke={HALO} width={w + 3} fill="none" /> : null;

  if (a.type === "box") {
    const fill = ink ? "none" : `url(#hatch-${a.color})`;
    return (
      <g>
        {halo}
        <rect x={a.x * imgW} y={a.y * imgH} width={a.w * imgW} height={a.h * imgH}
          fill={fill} stroke={color} strokeWidth={w} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  if (a.type === "ring") {
    return (
      <g>
        {halo}
        <ellipse cx={(a.x + a.w / 2) * imgW} cy={(a.y + a.h / 2) * imgH} rx={(a.w / 2) * imgW} ry={(a.h / 2) * imgH}
          fill="none" stroke={color} strokeWidth={w} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  if (a.type === "highlight") {
    const pts = a.points.map((p) => `${p.x * imgW},${p.y * imgH}`).join(" ");
    return (
      <g opacity={ink ? 0.85 : 0.7}>
        {halo}
        <polyline points={pts} fill="none" stroke={color} strokeWidth={w + 2}
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  if (a.type === "arrow") {
    return (
      <g>
        {halo}
        <line x1={a.x1 * imgW} y1={a.y1 * imgH} x2={a.x2 * imgW} y2={a.y2 * imgH}
          stroke={color} strokeWidth={w} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <Arrowhead a={a} imgW={imgW} imgH={imgH} color={color} scale={scale} />
      </g>
    );
  }
  return null;
}

/** Just the stroked path of a shape (used to paint the ink halo behind it). */
function StrokeShape({ a, imgW, imgH, stroke, width, fill }: { a: MapAnnotation; imgW: number; imgH: number; stroke: string; width: number; fill: string }) {
  if (a.type === "box") {
    return <rect x={a.x * imgW} y={a.y * imgH} width={a.w * imgW} height={a.h * imgH} fill={fill} stroke={stroke} strokeWidth={width} vectorEffect="non-scaling-stroke" />;
  }
  if (a.type === "ring") {
    return <ellipse cx={(a.x + a.w / 2) * imgW} cy={(a.y + a.h / 2) * imgH} rx={(a.w / 2) * imgW} ry={(a.h / 2) * imgH} fill={fill} stroke={stroke} strokeWidth={width} vectorEffect="non-scaling-stroke" />;
  }
  if (a.type === "highlight") {
    const pts = a.points.map((p) => `${p.x * imgW},${p.y * imgH}`).join(" ");
    return <polyline points={pts} fill="none" stroke={stroke} strokeWidth={width + 2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  }
  return <line x1={a.x1 * imgW} y1={a.y1 * imgH} x2={a.x2 * imgW} y2={a.y2 * imgH} stroke={stroke} strokeWidth={width} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
}

function Arrowhead({ a, imgW, imgH, color, scale }: { a: Extract<MapAnnotation, { type: "arrow" }>; imgW: number; imgH: number; color: string; scale: number }) {
  const x1 = a.x1 * imgW, y1 = a.y1 * imgH, x2 = a.x2 * imgW, y2 = a.y2 * imgH;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const size = (10 + STROKE_PX[a.stroke] * 2) / scale; // constant on-screen size
  const bx = x2 - ux * size, by = y2 - uy * size;
  const px = -uy, py = ux;
  const half = size * 0.55;
  return (
    <polygon
      points={`${x2},${y2} ${bx + px * half},${by + py * half} ${bx - px * half},${by - py * half}`}
      fill={color}
    />
  );
}

const HANDLE_FILL = "oklch(0.95 0.02 250)";
const CHROME = "oklch(0.82 0.15 250)";

function SelectionChrome({ a, imgW, imgH, scale }: { a: MapAnnotation; imgW: number; imgH: number; scale: number }) {
  const b = annotationBounds(a);
  const pad = 6 / scale;
  const hs = 7 / scale; // handle box size
  const x = b.x * imgW - pad, y = b.y * imgH - pad;
  const w = b.w * imgW + pad * 2, h = b.h * imgH + pad * 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={CHROME} strokeWidth={1.25} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
      {HANDLE_IDS.map((id) => {
        const p = handlePoint({ x: b.x - pad / imgW, y: b.y - pad / imgH, w: b.w + (pad * 2) / imgW, h: b.h + (pad * 2) / imgH }, id);
        return <rect key={id} x={p.x * imgW - hs / 2} y={p.y * imgH - hs / 2} width={hs} height={hs} fill={HANDLE_FILL} stroke={CHROME} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
      })}
    </g>
  );
}
