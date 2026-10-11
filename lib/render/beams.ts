/**
 * Decides how a change on the board is animated. Light already on screen
 * stays put; only what is new is drawn outward from the point of change, in
 * the order light would travel.
 */
import type { Grid } from "@/lib/engine/hex";
import type { BeamRun, Trace } from "@/lib/engine/trace";

export interface PlannedRun extends BeamRun {
  /** Length that was already on screen before the change (0 for a new run). */
  kept: number;
}

/** A stretch of beam that no longer exists and fades out. */
export interface FadingRun {
  from: number;
  dir: number;
  color: number;
  /** Start and end, in cell steps from the centre of `from`. */
  a: number;
  b: number;
}

export interface BeamPlan {
  runs: PlannedRun[];
  /** Travel distance at which the animation starts and ends (start > end: nothing to animate). */
  start: number;
  end: number;
  /** For each cell, the travel distance at which the last of its light arrives (-1 if dark). */
  arrival: Float32Array;
  fading: FadingRun[];
}

const keyOf = (run: BeamRun) => `${run.from}/${run.dir}/${run.color}/${run.depth}`;

/**
 * `previous` is the plan on screen and `shownFront` how far its own animation
 * had got, so a change made mid-animation continues from what is actually
 * visible instead of popping the rest in.
 */
export function planBeams(
  previous: BeamPlan | null,
  shownFront: number,
  next: Trace,
  grid: Grid,
): BeamPlan {
  const before = new Map<string, BeamRun>();
  if (previous) {
    for (const run of previous.runs) {
      const len = visibleLength(run, shownFront);
      if (len > 0) before.set(keyOf(run), { ...run, len });
    }
  }

  let start = Infinity;
  let end = 0;
  const runs: PlannedRun[] = [];
  const fading: FadingRun[] = [];
  const arrival = new Float32Array(grid.size).fill(-1);

  for (const run of next.runs) {
    const key = keyOf(run);
    const old = before.get(key);
    before.delete(key);
    const kept = old ? Math.min(old.len, run.len) : 0;
    if (kept < run.len) {
      start = Math.min(start, run.depth + kept);
      end = Math.max(end, run.depth + run.len);
    }
    if (old && old.len > run.len) {
      fading.push({ from: run.from, dir: run.dir, color: run.color, a: run.len, b: old.len });
    }
    runs.push({ ...run, kept });

    let cell = run.from;
    for (let k = 1; k <= Math.floor(run.len); k++) {
      cell = grid.nbr[cell * 6 + run.dir];
      if (cell < 0) break;
      if (run.depth + k > arrival[cell]) arrival[cell] = run.depth + k;
    }
  }
  for (const old of before.values()) {
    fading.push({ from: old.from, dir: old.dir, color: old.color, a: 0, b: old.len });
  }
  return { runs, start, end, arrival, fading };
}

/** How much of a run is visible when the animation front is at `front`. */
export function visibleLength(run: PlannedRun, front: number): number {
  return Math.max(run.kept, Math.min(run.len, front - run.depth));
}
