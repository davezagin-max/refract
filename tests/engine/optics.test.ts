import { describe, expect, it } from "vitest";
import { dirAngle, mirrorAngle } from "@/lib/engine/hex";
import {
  ACTION,
  ACTS,
  BLUE,
  GREEN,
  ORIENTATIONS,
  PIECE_KINDS,
  RED,
  WHITE,
  acts,
  interact,
  pieceCode,
  reflect,
  refract,
} from "@/lib/engine/optics";

describe("mirror reflection on hex directions", () => {
  it("matches Euclidean reflection for all 36 mirror and beam combinations", () => {
    for (let m = 0; m < 6; m++) {
      const ux = Math.cos(mirrorAngle(m));
      const uy = Math.sin(mirrorAngle(m));
      for (let d = 0; d < 6; d++) {
        const vx = Math.cos(dirAngle(d));
        const vy = Math.sin(dirAngle(d));
        // Reflect v across the line with unit direction u: v' = 2(v.u)u - v.
        const dot = vx * ux + vy * uy;
        const rx = 2 * dot * ux - vx;
        const ry = 2 * dot * uy - vy;
        const out = reflect(m, d);
        expect(Math.cos(dirAngle(out))).toBeCloseTo(rx, 10);
        expect(Math.sin(dirAngle(out))).toBeCloseTo(ry, 10);
      }
    }
  });

  it("is its own inverse: reflecting the outgoing beam gives the incoming one", () => {
    for (let m = 0; m < 6; m++) {
      for (let d = 0; d < 6; d++) expect(reflect(m, reflect(m, d))).toBe(d);
    }
  });

  it("lets edge-on beams pass an even mirror and turns the other four by 120 degrees", () => {
    for (const m of [0, 2, 4]) {
      const turns = [0, 1, 2, 3, 4, 5].map((d) => (reflect(m, d) - d + 6) % 6);
      expect(turns.filter((t) => t === 0)).toHaveLength(2);
      expect(turns.filter((t) => t === 2 || t === 4)).toHaveLength(4);
      expect(reflect(m, m / 2)).toBe(m / 2);
      expect(reflect(m, m / 2 + 3)).toBe(m / 2 + 3);
    }
  });

  it("bounces head-on beams straight back off an odd mirror and turns the rest by 60 degrees", () => {
    for (const m of [1, 3, 5]) {
      const turns = [0, 1, 2, 3, 4, 5].map((d) => (reflect(m, d) - d + 6) % 6);
      expect(turns.filter((t) => t === 3)).toHaveLength(2);
      expect(turns.filter((t) => t === 1 || t === 5)).toHaveLength(4);
    }
  });

  it("works a few cases by hand", () => {
    // m = 1 is a horizontal line: up-right becomes down-right and back.
    expect(reflect(1, 1)).toBe(0);
    expect(reflect(1, 0)).toBe(1);
    // ...and a vertical beam bounces straight back.
    expect(reflect(1, 2)).toBe(5);
    expect(reflect(1, 5)).toBe(2);
    // m = 4 is a vertical line: vertical beams pass, the diagonals swap sides.
    expect(reflect(4, 2)).toBe(2);
    expect(reflect(4, 5)).toBe(5);
    expect(reflect(4, 1)).toBe(3);
    expect(reflect(4, 0)).toBe(4);
  });
});

describe("splitter", () => {
  it("passes one copy and reflects one copy", () => {
    expect(interact("splitter", 1, 0, WHITE)).toEqual([
      { dir: 0, color: WHITE },
      { dir: 1, color: WHITE },
    ]);
  });

  it("is a plain pass-through when the beam is edge-on", () => {
    expect(interact("splitter", 0, 0, RED)).toEqual([{ dir: 0, color: RED }]);
    expect(acts("splitter", 0, 0, RED)).toBe(false);
    expect(acts("splitter", 1, 0, RED)).toBe(true);
  });
});

describe("prism", () => {
  it("sends red straight, green 60 degrees and blue 120 degrees to one side", () => {
    expect(interact("prism", 0, 0, WHITE)).toEqual([
      { dir: 0, color: RED },
      { dir: 1, color: GREEN },
      { dir: 2, color: BLUE },
    ]);
    expect(interact("prism", 1, 0, WHITE)).toEqual([
      { dir: 0, color: RED },
      { dir: 5, color: GREEN },
      { dir: 4, color: BLUE },
    ]);
  });

  it("bends each channel the same amount whatever else is in the beam", () => {
    for (let d = 0; d < 6; d++) {
      for (const orient of [0, 1]) {
        expect(refract(orient, d, RED)).toBe(d);
        const side = orient === 0 ? 1 : -1;
        expect(refract(orient, d, GREEN)).toBe((d + side + 6) % 6);
        expect(refract(orient, d, BLUE)).toBe((d + 2 * side + 6) % 6);
      }
    }
    expect(interact("prism", 0, 3, RED | BLUE)).toEqual([
      { dir: 3, color: RED },
      { dir: 5, color: BLUE },
    ]);
  });

  it("does nothing to a pure red beam", () => {
    expect(acts("prism", 0, 2, RED)).toBe(false);
    expect(acts("prism", 0, 2, RED | GREEN)).toBe(true);
  });
});

describe("lookup tables", () => {
  it("agree with the rule functions for every piece, direction and colour", () => {
    for (const kind of PIECE_KINDS) {
      for (let orient = 0; orient < ORIENTATIONS[kind]; orient++) {
        const code = pieceCode(kind, orient);
        for (let d = 0; d < 6; d++) {
          for (let color = 1; color <= 7; color++) {
            const base = ((code * 6 + d) * 8 + color) * 6;
            const fromTable = [];
            for (let i = 0; i < 3 && ACTION[base + i * 2] >= 0; i++) {
              fromTable.push({ dir: ACTION[base + i * 2], color: ACTION[base + i * 2 + 1] });
            }
            expect(fromTable).toEqual(interact(kind, orient, d, color));
            expect(ACTS[(code * 6 + d) * 8 + color]).toBe(acts(kind, orient, d, color) ? 1 : 0);
            // No piece creates or destroys a channel, except by splitting copies.
            const union = fromTable.reduce((mask, out) => mask | out.color, 0);
            expect(union).toBe(color);
          }
        }
      }
    }
  });
});
