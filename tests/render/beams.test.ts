import { describe, expect, it } from "vitest";
import { makeGrid } from "@/lib/engine/hex";
import { WHITE } from "@/lib/engine/optics";
import { trace } from "@/lib/engine/trace";
import { planBeams, visibleLength } from "@/lib/render/beams";
import { at, puzzle } from "../engine/helpers";

/*
 * A white emitter on the left rim of a radius-3 board, shining down-right
 * (direction 0) along the row r = 0: cells (-2,0) ... (3,0), six steps, then
 * off the board.
 */
const grid = makeGrid(3);
const base = puzzle(3, { emitters: [{ cell: at(3, -3, 0), dir: 0, color: WHITE }] });
const mirrorAt = (q: number, orient = 2) => [{ cell: at(3, q, 0), kind: "mirror" as const, orient }];

describe("beam animation plan", () => {
  it("draws everything from the emitter the first time", () => {
    const plan = planBeams(null, Infinity, trace(base), grid);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0]).toMatchObject({ kept: 0, depth: 0, len: 6.5, end: "exit" });
    expect(plan.start).toBe(0);
    expect(plan.end).toBe(6.5);
    expect(plan.fading).toEqual([]);
    // Light reaches each cell after as many steps as it is from the emitter.
    expect(plan.arrival[at(3, -2, 0)]).toBe(1);
    expect(plan.arrival[at(3, 3, 0)]).toBe(6);
    expect(plan.arrival[at(3, 0, 1)]).toBe(-1);
  });

  it("has nothing to animate when the light did not change", () => {
    const first = planBeams(null, Infinity, trace(base), grid);
    const again = planBeams(first, Infinity, trace(base), grid);
    expect(again.start).toBeGreaterThan(again.end);
    expect(again.fading).toEqual([]);
    expect(again.runs[0].kept).toBe(again.runs[0].len);
  });

  it("keeps the beam up to a new mirror, fades the cut-off tail and grows the reflection", () => {
    const before = planBeams(null, Infinity, trace(base), grid);
    // A mirror three steps in. Orientation 2 turns direction 0 into direction 2 (straight up).
    const after = planBeams(before, Infinity, trace(base, mirrorAt(0)), grid);
    const [incoming, reflected] = after.runs;
    expect(incoming).toMatchObject({ dir: 0, len: 3, kept: 3, end: "piece" });
    expect(reflected).toMatchObject({ dir: 2, depth: 3, kept: 0 });
    // The animation starts at the mirror, not back at the emitter.
    expect(after.start).toBe(3);
    expect(after.end).toBe(3 + reflected.len);
    expect(after.fading).toEqual([{ from: at(3, -3, 0), dir: 0, color: WHITE, a: 3, b: 6.5 }]);
    expect(visibleLength(incoming, after.start)).toBe(3);
    expect(visibleLength(reflected, after.start)).toBe(0);
    expect(visibleLength(reflected, after.start + 1.25)).toBe(1.25);
    expect(visibleLength(reflected, Infinity)).toBe(reflected.len);
  });

  it("extends the beam from where it used to stop when a mirror is removed", () => {
    const withMirror = planBeams(null, Infinity, trace(base, mirrorAt(0)), grid);
    const without = planBeams(withMirror, Infinity, trace(base), grid);
    expect(without.runs[0]).toMatchObject({ len: 6.5, kept: 3 });
    expect(without.start).toBe(3);
    expect(without.end).toBe(6.5);
    // The old reflection is gone and fades out whole.
    expect(without.fading).toHaveLength(1);
    expect(without.fading[0]).toMatchObject({ dir: 2, a: 0 });
  });

  it("continues from what is on screen when a change arrives mid-animation", () => {
    const first = planBeams(null, Infinity, trace(base), grid);
    // Only two steps of the first beam had been drawn when the mirror went in at step five.
    const next = planBeams(first, 2, trace(base, mirrorAt(2)), grid);
    expect(next.runs[0]).toMatchObject({ len: 5, kept: 2 });
    expect(next.start).toBe(2);
    // Nothing fades: the tail beyond the mirror was never on screen.
    expect(next.fading).toEqual([]);
  });

  it("gives every cell an arrival no earlier than any beam that crosses it", () => {
    // A splitter sends one copy straight on and one copy up, so there are three runs.
    const lit = trace(base, [{ cell: at(3, -1, 0), kind: "splitter", orient: 2 }]);
    const plan = planBeams(null, Infinity, lit, grid);
    expect(plan.runs.length).toBeGreaterThanOrEqual(3);
    for (const run of plan.runs) {
      let cell = run.from;
      for (let k = 1; k <= Math.floor(run.len); k++) {
        cell = grid.nbr[cell * 6 + run.dir];
        expect(plan.arrival[cell]).toBeGreaterThanOrEqual(run.depth + k);
      }
    }
    expect(plan.end).toBe(Math.max(...plan.runs.map((run) => run.depth + run.len)));
  });
});
