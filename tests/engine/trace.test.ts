import { describe, expect, it } from "vitest";
import { makeGrid } from "@/lib/engine/hex";
import { BLUE, GREEN, RED, WHITE } from "@/lib/engine/optics";
import { countLit, targetsLit } from "@/lib/engine/puzzle";
import { trace } from "@/lib/engine/trace";
import { at, lcg, puzzle } from "./helpers";

const R = 2;
const c = (q: number, r: number) => at(R, q, r);

describe("trace", () => {
  const base = puzzle(R, { emitters: [{ cell: c(-2, 0), dir: 0, color: WHITE }] });

  it("runs a beam straight across an empty board and off the far edge", () => {
    const result = trace(base);
    expect(result.runs).toEqual([
      { from: c(-2, 0), dir: 0, color: WHITE, len: 4.5, depth: 0, end: "exit" },
    ]);
    for (const q of [-1, 0, 1, 2]) expect(result.light[c(q, 0)]).toBe(WHITE);
    expect(result.light[c(-2, 0)]).toBe(0);
    expect(result.steps).toBe(4);
  });

  it("turns at a mirror", () => {
    const result = trace(base, [{ cell: c(0, 0), kind: "mirror", orient: 1 }]);
    expect(result.runs).toEqual([
      { from: c(-2, 0), dir: 0, color: WHITE, len: 2, depth: 0, end: "piece" },
      { from: c(0, 0), dir: 1, color: WHITE, len: 2.5, depth: 2, end: "exit" },
    ]);
    expect(result.light[c(1, -1)]).toBe(WHITE);
    expect(result.light[c(2, -2)]).toBe(WHITE);
    expect(result.light[c(1, 0)]).toBe(0);
    expect(result.hit[c(0, 0)]).toBe(1);
  });

  it("passes an edge-on mirror untouched", () => {
    const result = trace(base, [{ cell: c(0, 0), kind: "mirror", orient: 0 }]);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].len).toBe(4.5);
    expect(result.hit[c(0, 0)]).toBe(0);
  });

  it("is absorbed by its own emitter when bounced straight back", () => {
    const result = trace(base, [{ cell: c(0, 0), kind: "mirror", orient: 3 }]);
    expect(result.runs).toEqual([
      { from: c(-2, 0), dir: 0, color: WHITE, len: 2, depth: 0, end: "piece" },
      { from: c(0, 0), dir: 3, color: WHITE, len: 1.5, depth: 2, end: "blocked" },
    ]);
  });

  it("stops at a wall, half a step short of the wall's centre", () => {
    const result = trace({ ...base, walls: [c(1, 0)] });
    expect(result.runs).toEqual([
      { from: c(-2, 0), dir: 0, color: WHITE, len: 2.5, depth: 0, end: "blocked" },
    ]);
    expect(result.light[c(1, 0)]).toBe(0);
    expect(result.light[c(2, 0)]).toBe(0);
  });

  it("splits into a straight copy and a reflected copy", () => {
    const result = trace(base, [{ cell: c(0, 0), kind: "splitter", orient: 1 }]);
    expect(result.runs).toEqual([
      { from: c(-2, 0), dir: 0, color: WHITE, len: 2, depth: 0, end: "piece" },
      { from: c(0, 0), dir: 0, color: WHITE, len: 2.5, depth: 2, end: "exit" },
      { from: c(0, 0), dir: 1, color: WHITE, len: 2.5, depth: 2, end: "exit" },
    ]);
  });

  it("fans white light out of a prism by colour", () => {
    const left = trace(base, [{ cell: c(0, 0), kind: "prism", orient: 0 }]);
    expect(left.light[c(1, 0)]).toBe(RED);
    expect(left.light[c(1, -1)]).toBe(GREEN);
    expect(left.light[c(0, -1)]).toBe(BLUE);
    const right = trace(base, [{ cell: c(0, 0), kind: "prism", orient: 1 }]);
    expect(right.light[c(1, 0)]).toBe(RED);
    expect(right.light[c(0, 1)]).toBe(GREEN);
    expect(right.light[c(-1, 1)]).toBe(BLUE);
  });

  it("lets light pass through targets and reports exact colours", () => {
    const p = {
      ...base,
      targets: [
        { cell: c(-1, 0), color: WHITE },
        { cell: c(1, 0), color: RED },
        { cell: c(1, -1), color: GREEN },
      ],
    };
    const before = trace(p);
    // White through a red target is the wrong colour, not a lit target.
    expect(before.light[c(1, 0)]).toBe(WHITE);
    expect(countLit(p, before.light)).toBe(1);
    expect(targetsLit(p, before.light)).toBe(false);
    const after = trace(p, [{ cell: c(0, 0), kind: "prism", orient: 0 }]);
    expect(countLit(p, after.light)).toBe(3);
    expect(targetsLit(p, after.light)).toBe(true);
  });

  it("mixes beams that cross in a cell", () => {
    const p = puzzle(R, {
      emitters: [
        { cell: c(-2, 0), dir: 0, color: RED },
        { cell: c(0, 2), dir: 2, color: GREEN },
      ],
      targets: [{ cell: c(0, 0), color: RED | GREEN }],
    });
    const result = trace(p);
    expect(result.light[c(0, 0)]).toBe(RED | GREEN);
    expect(result.light[c(1, 0)]).toBe(RED);
    expect(result.light[c(0, -1)]).toBe(GREEN);
    expect(targetsLit(p, result.light)).toBe(true);
  });

  it("only sends on the channels that have not taken a path already", () => {
    const p = puzzle(R, {
      emitters: [
        { cell: c(-2, 0), dir: 0, color: RED },
        { cell: c(0, 2), dir: 2, color: WHITE },
      ],
      fixed: [{ cell: c(0, 0), kind: "splitter", orient: 2 }],
    });
    const result = trace(p);
    const east = result.runs.filter((run) => run.from === c(0, 0) && run.dir === 0);
    expect(east.map((run) => run.color)).toEqual([RED, GREEN | BLUE]);
    expect(result.light[c(1, 0)]).toBe(WHITE);
  });

  it("terminates on a mirror loop and walks each stretch once", () => {
    // Splitter at (-1,1) feeds a triangle closed by mirrors at (1,1) and (1,-1).
    const p = puzzle(R, {
      emitters: [{ cell: c(-2, 1), dir: 0, color: WHITE }],
      fixed: [
        { cell: c(-1, 1), kind: "splitter", orient: 4 },
        { cell: c(1, 1), kind: "mirror", orient: 2 },
        { cell: c(1, -1), kind: "mirror", orient: 0 },
      ],
    });
    const result = trace(p);
    expect(result.steps).toBe(8);
    expect(result.runs.map((run) => [run.from, run.dir, run.len, run.end])).toEqual([
      [c(-2, 1), 0, 1, "piece"],
      [c(-1, 1), 0, 2, "piece"],
      [c(1, 1), 2, 2, "piece"],
      [c(1, -1), 4, 2, "piece"],
      [c(-1, 1), 4, 1.5, "exit"],
    ]);
  });

  it("always terminates within the state bound on random boards", () => {
    const grid = makeGrid(3);
    const random = lcg(7);
    const kinds = ["mirror", "splitter", "prism"] as const;
    for (let round = 0; round < 300; round++) {
      const cells = Array.from({ length: grid.size }, (_, i) => i).sort(() => random() - 0.5);
      const p = puzzle(3, {
        emitters: [
          { cell: cells[0], dir: Math.floor(random() * 6), color: WHITE },
          { cell: cells[1], dir: Math.floor(random() * 6), color: 1 + Math.floor(random() * 7) },
        ],
        fixed: cells.slice(2, 22).map((cell) => {
          const kind = kinds[Math.floor(random() * 3)];
          return { cell, kind, orient: Math.floor(random() * (kind === "prism" ? 2 : 6)) };
        }),
      });
      const result = trace(p);
      // Each (cell, direction, channel) state is entered at most once.
      expect(result.steps).toBeLessThanOrEqual(grid.size * 6 * 3);
      const drawn = result.runs.reduce((sum, run) => sum + Math.ceil(run.len), 0);
      expect(drawn).toBeGreaterThanOrEqual(result.steps);
    }
  });
});
