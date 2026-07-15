// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { MapAnnotation } from "@ttcanvas/core";
import {
  annotationBounds,
  translateAnnotation,
  scaleAnnotationToBounds,
  boundsFromHandle,
  handlePoint,
  hitTestAnnotation,
  pickAnnotation,
  nextAutoLabel,
  MIN_EXTENT,
} from "./annotations";

const box: MapAnnotation = { id: "b", type: "box", color: "amber", stroke: 2, x: 0.2, y: 0.2, w: 0.4, h: 0.2 };
const arrow: MapAnnotation = { id: "a", type: "arrow", color: "rose", stroke: 1, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.3 };
const highlight: MapAnnotation = {
  id: "h", type: "highlight", color: "sage", stroke: 3,
  points: [{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 0.3, y: 0.7 }],
};

describe("annotationBounds", () => {
  it("returns the stored rect for bbox types", () => {
    expect(annotationBounds(box)).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.2 });
  });
  it("spans an arrow's endpoints", () => {
    const b = annotationBounds(arrow);
    expect(b.x).toBeCloseTo(0.1); expect(b.y).toBeCloseTo(0.1);
    expect(b.w).toBeCloseTo(0.4); expect(b.h).toBeCloseTo(0.2);
  });
  it("wraps a highlight polyline", () => {
    const b = annotationBounds(highlight);
    expect(b.x).toBeCloseTo(0.1); expect(b.y).toBeCloseTo(0.5);
    expect(b.w).toBeCloseTo(0.2); expect(b.h).toBeCloseTo(0.2);
  });
});

describe("translateAnnotation", () => {
  it("shifts every coordinate", () => {
    expect(translateAnnotation(arrow, 0.1, -0.05)).toMatchObject({ x1: 0.2, y1: 0.05, x2: 0.6, y2: 0.25 });
    const moved = translateAnnotation(highlight, 0.1, 0.1) as Extract<MapAnnotation, { type: "highlight" }>;
    expect(moved.points[0]).toEqual({ x: 0.2, y: 0.6 });
  });
});

describe("scaleAnnotationToBounds", () => {
  it("sets the bbox for box types", () => {
    const to = { x: 0, y: 0, w: 0.8, h: 0.8 };
    expect(scaleAnnotationToBounds(box, annotationBounds(box), to)).toMatchObject(to);
  });
  it("remaps arrow endpoints proportionally when the box doubles", () => {
    const from = annotationBounds(arrow); // {0.1,0.1,0.4,0.2}
    const to = { x: 0.1, y: 0.1, w: 0.8, h: 0.4 };
    const scaled = scaleAnnotationToBounds(arrow, from, to) as Extract<MapAnnotation, { type: "arrow" }>;
    expect(scaled.x1).toBeCloseTo(0.1);
    expect(scaled.x2).toBeCloseTo(0.9); // 0.5 -> stretched to the doubled right edge
    expect(scaled.y2).toBeCloseTo(0.5);
  });
});

describe("boundsFromHandle", () => {
  const b = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };
  it("moves only the dragged edge (east)", () => {
    expect(boundsFromHandle(b, "e", 0.9, 0.5)).toMatchObject({ x: 0.2, w: expect.closeTo(0.7, 5) });
  });
  it("moves both axes for a corner (nw)", () => {
    const r = boundsFromHandle(b, "nw", 0.1, 0.1);
    expect(r.x).toBeCloseTo(0.1);
    expect(r.y).toBeCloseTo(0.1);
  });
  it("clamps to a minimum extent instead of collapsing", () => {
    const r = boundsFromHandle(b, "e", 0.2, 0.5); // drag east edge onto the west edge
    expect(r.w).toBe(MIN_EXTENT);
  });
});

describe("handlePoint", () => {
  it("locates the se corner and the n midpoint", () => {
    const b = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };
    const se = handlePoint(b, "se");
    expect(se.x).toBeCloseTo(0.6); expect(se.y).toBeCloseTo(0.4);
    const n = handlePoint(b, "n");
    expect(n.x).toBeCloseTo(0.4); expect(n.y).toBeCloseTo(0.2);
  });
});

describe("hitTestAnnotation", () => {
  it("selects inside a box but not far outside", () => {
    expect(hitTestAnnotation(box, 0.4, 0.3, 0.02)).toBe(true);
    expect(hitTestAnnotation(box, 0.9, 0.9, 0.02)).toBe(false);
  });
  it("selects near an arrow's line but not off it", () => {
    expect(hitTestAnnotation(arrow, 0.3, 0.2, 0.02)).toBe(true); // midpoint of the segment
    expect(hitTestAnnotation(arrow, 0.3, 0.4, 0.02)).toBe(false);
  });
  it("selects near a highlight segment", () => {
    expect(hitTestAnnotation(highlight, 0.2, 0.5, 0.02)).toBe(true);
    expect(hitTestAnnotation(highlight, 0.8, 0.8, 0.02)).toBe(false);
  });
});

describe("pickAnnotation", () => {
  it("returns the topmost (last) overlapping annotation", () => {
    const under: MapAnnotation = { id: "under", type: "box", color: "azure", stroke: 1, x: 0, y: 0, w: 1, h: 1 };
    expect(pickAnnotation([under, box], 0.4, 0.3, 0.02)).toBe("b");
  });
  it("returns null when nothing is hit", () => {
    expect(pickAnnotation([box, arrow], 0.95, 0.95, 0.01)).toBeNull();
  });
});

describe("nextAutoLabel", () => {
  it("starts at A on an empty or unlabelled scene", () => {
    expect(nextAutoLabel([])).toBe("A");
    expect(nextAutoLabel([box, arrow])).toBe("A");
  });
  it("skips labels already in use", () => {
    const a: MapAnnotation = { ...box, id: "x", label: "A" };
    const b: MapAnnotation = { ...box, id: "y", label: "B" };
    expect(nextAutoLabel([a, b])).toBe("C");
  });
  it("skips a hand-typed label out of sequence", () => {
    const a: MapAnnotation = { ...box, id: "x", label: "trap" };
    expect(nextAutoLabel([a])).toBe("A");
  });
  it("rolls over from Z to AA, then AB", () => {
    const used: MapAnnotation[] = Array.from({ length: 26 }, (_, i) => ({
      ...box, id: `t${i}`, label: String.fromCharCode(65 + i),
    }));
    expect(nextAutoLabel(used)).toBe("AA");
    expect(nextAutoLabel([...used, { ...box, id: "aa", label: "AA" }])).toBe("AB");
  });
});
