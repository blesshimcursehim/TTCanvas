import { describe, it, expect } from "vitest";
import { fitTransform, measureDistance, panToPoint } from "./utils";

describe("fitTransform", () => {
  it("is constrained by width when map is wider relative to viewport", () => {
    // viewport 800×600, map 1600×600 → scale = min(800/1600, 600/600) = min(0.5, 1.0) = 0.5
    const r = fitTransform({ w: 800, h: 600 }, { w: 1600, h: 600 });
    expect(r.scale).toBeCloseTo(0.5);
    expect(r.panX).toBe(0);
    expect(r.panY).toBe(0);
  });

  it("is constrained by height when map is taller relative to viewport", () => {
    // viewport 800×600, map 400×1200 → scale = min(800/400, 600/1200) = min(2.0, 0.5) = 0.5
    const r = fitTransform({ w: 800, h: 600 }, { w: 400, h: 1200 });
    expect(r.scale).toBeCloseTo(0.5);
  });

  it("scales up when viewport is larger than map", () => {
    // viewport 1920×1080, map 800×450 → scale = min(2.4, 2.4) = 2.4
    const r = fitTransform({ w: 1920, h: 1080 }, { w: 800, h: 450 });
    expect(r.scale).toBeCloseTo(2.4);
  });

  it("returns scale 1 for a map that exactly matches the viewport", () => {
    const r = fitTransform({ w: 1024, h: 768 }, { w: 1024, h: 768 });
    expect(r.scale).toBeCloseTo(1.0);
  });
});

describe("panToPoint", () => {
  it("returns zero pan for the image's dead centre", () => {
    const r = panToPoint({ w: 1000, h: 800 }, { nx: 0.5, ny: 0.5 }, 1);
    expect(r.panX).toBeCloseTo(0);
    expect(r.panY).toBeCloseTo(0);
  });

  it("pans toward an off-centre point at scale 1 (matches toNorm's inverse)", () => {
    // A point at nx=0.75 is a quarter of the image width right of centre; to bring it to the
    // viewport's centre the pan must move left by that much: panX = w * scale * (0.5 - nx).
    const r = panToPoint({ w: 1000, h: 800 }, { nx: 0.75, ny: 0.25 }, 1);
    expect(r.panX).toBeCloseTo(-250);
    expect(r.panY).toBeCloseTo(200);
  });

  it("scales the pan distance with the zoom level", () => {
    const r = panToPoint({ w: 1000, h: 800 }, { nx: 0.75, ny: 0.5 }, 2);
    expect(r.panX).toBeCloseTo(-500);
    expect(r.panY).toBeCloseTo(0);
  });
});

describe("measureDistance", () => {
  const img = { w: 1000, h: 1000 };

  it("falls back to grid squares when no scale is configured", () => {
    // Horizontal drag of 0.1 × 1000px = 100px; 100 / 40px cell = 2.5 squares
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.1, y: 0 }, img, undefined, 40);
    expect(r.pixels).toBeCloseTo(100);
    expect(r.formatted).toBe("2.5 sq");
  });

  it("counts grid squares for larger distances", () => {
    // 0.5 × 1000 = 500px; 500 / 40 = 12.5 squares
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.5, y: 0 }, img, undefined, 40);
    expect(r.formatted).toBe("12.5 sq");
  });

  it("returns an em-dash when no scale and no usable grid", () => {
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.1, y: 0 }, img, undefined, 0);
    expect(r.formatted).toBe("-");
  });

  it("converts using grid scale (1 cell = 5 ft, gridSize = 40px → 8px/ft)", () => {
    // 80px = 10 ft
    const scale = { mode: "grid" as const, unitLabel: "ft", unitsPerCell: 5 };
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.08, y: 0 }, img, scale, 40);
    expect(r.pixels).toBeCloseTo(80);
    expect(r.formatted).toBe("10 ft");
  });

  it("formats grid values < 10 with one decimal place", () => {
    // 1 cell = 5 ft, gridSize = 40 → pixelsPerUnit = 8; 20px = 2.5 ft
    const scale = { mode: "grid" as const, unitLabel: "ft", unitsPerCell: 5 };
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.02, y: 0 }, img, scale, 40);
    expect(r.formatted).toBe("2.5 ft");
  });

  it("converts using calibrate scale", () => {
    // 200 pixelsPerUnit; 400px diagonal → 2 units
    const scale = { mode: "calibrate" as const, unitLabel: "m", pixelsPerUnit: 200 };
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.4, y: 0 }, img, scale, 40);
    expect(r.formatted).toBe("2.0 m");
  });

  it("falls back to grid squares when calibrate has no pixelsPerUnit set", () => {
    // 100px / 40px cell = 2.5 squares
    const scale = { mode: "calibrate" as const, unitLabel: "m" };
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.1, y: 0 }, img, scale, 40);
    expect(r.formatted).toBe("2.5 sq");
  });

  it("computes diagonal distance correctly", () => {
    // 3-4-5 triangle: dx=300, dy=400 → 500px
    const r = measureDistance({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, img, undefined, 40);
    expect(r.pixels).toBeCloseTo(500);
  });
});
