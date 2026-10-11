/**
 * Ray casting. Follows every beam from the emitters through the board and
 * reports the straight runs to draw plus the colour of light in each cell.
 *
 * Termination: a beam entering a cell is identified by (cell, direction) and
 * the channels it carries. `seen` records which channels have already entered
 * each (cell, direction); a beam only continues with channels that are new
 * there. Each of the size * 6 * 3 states is entered at most once, so mirror
 * loops end after one lap.
 */
import type { Grid } from "./hex";
import { ACTION, ACTS, EMITTER, EMPTY, TARGET, WALL, type Color } from "./optics";
import { contentWith, gridOf, type Emitter, type Placed, type Puzzle } from "./puzzle";

/** Why a run stopped. */
export type RunEnd = "piece" | "exit" | "blocked" | "merge";

/** A straight stretch of beam between two events. */
export interface BeamRun {
  /** Cell whose centre the run starts from. */
  from: number;
  dir: number;
  color: Color;
  /**
   * Length in cell steps. Whole numbers end on a cell centre; a run that
   * leaves the board ends half a step past its last cell, and one absorbed by
   * a wall or emitter ends half a step short of it (on the shared edge).
   */
  len: number;
  /** Steps travelled from the emitter before this run starts. */
  depth: number;
  end: RunEnd;
}

export interface Trace {
  runs: BeamRun[];
  /** Channels of light entering each cell. */
  light: Uint8Array;
  /** 1 for each piece cell that changed a beam. */
  hit: Uint8Array;
  /** Total cell steps walked; a rough measure of beam length. */
  steps: number;
}

export function traceContent(
  grid: Grid,
  content: Uint8Array,
  emitters: readonly Emitter[],
): Trace {
  const { nbr, size } = grid;
  const seen = new Uint8Array(size * 6);
  const light = new Uint8Array(size);
  const hit = new Uint8Array(size);
  const runs: BeamRun[] = [];
  let total = 0;

  // Pending beams as flat (cell, dir, color, depth) quadruples.
  const stack: number[] = [];
  for (let i = emitters.length - 1; i >= 0; i--) {
    const e = emitters[i];
    stack.push(e.cell, e.dir, e.color, 0);
  }

  while (stack.length > 0) {
    let depth = stack.pop() as number;
    let color = stack.pop() as number;
    const dir = stack.pop() as number;
    let from = stack.pop() as number;
    let cur = from;
    let steps = 0;

    for (;;) {
      const next = nbr[cur * 6 + dir];
      if (next < 0) {
        runs.push({ from, dir, color, len: steps + 0.5, depth, end: "exit" });
        break;
      }
      const state = next * 6 + dir;
      const fresh = color & ~seen[state];
      if (fresh === 0) {
        if (steps > 0) runs.push({ from, dir, color, len: steps, depth, end: "merge" });
        break;
      }
      if (fresh !== color) {
        // Some channels have been down this path already: only the rest go on.
        if (steps > 0) runs.push({ from, dir, color, len: steps, depth, end: "merge" });
        from = cur;
        depth += steps;
        steps = 0;
        color = fresh;
      }
      seen[state] |= color;
      steps++;
      total++;
      const code = content[next];
      if (code === WALL || code === EMITTER) {
        runs.push({ from, dir, color, len: steps - 0.5, depth, end: "blocked" });
        break;
      }
      light[next] |= color;
      if (code === EMPTY || code === TARGET || ACTS[(code * 6 + dir) * 8 + color] === 0) {
        cur = next;
        continue;
      }
      hit[next] = 1;
      runs.push({ from, dir, color, len: steps, depth, end: "piece" });
      const base = ((code * 6 + dir) * 8 + color) * 6;
      // Push in reverse so beams are followed in table order.
      for (let i = 2; i >= 0; i--) {
        const outDir = ACTION[base + i * 2];
        if (outDir >= 0) stack.push(next, outDir, ACTION[base + i * 2 + 1], depth + steps);
      }
      break;
    }
  }

  return { runs, light, hit, steps: total };
}

/** Trace a puzzle with the given movable pieces on the board. */
export function trace(puzzle: Puzzle, placed: readonly Placed[] = []): Trace {
  return traceContent(gridOf(puzzle), contentWith(puzzle, placed), puzzle.emitters);
}
