/** Keyboard cursor movement on the hex board. */
import { cellAt, type Grid } from "@/lib/engine/hex";

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/**
 * Up and down follow a column. Left and right step to the next column and
 * keep the cursor on the same visual row: columns are staggered by half a
 * cell, so the step alternates between the upper and lower neighbour
 * ("odd-q" offset rows). At the rim the other diagonal is used if it exists.
 */
export function moveCursor(grid: Grid, cell: number, key: ArrowKey): number {
  const q = grid.q[cell];
  const r = grid.r[cell];
  if (key === "ArrowUp" || key === "ArrowDown") {
    const next = cellAt(grid, q, r + (key === "ArrowUp" ? -1 : 1));
    return next >= 0 ? next : cell;
  }
  const step = key === "ArrowRight" ? 1 : -1;
  const row = r + Math.floor(q / 2);
  const nq = q + step;
  const preferred = cellAt(grid, nq, row - Math.floor(nq / 2));
  if (preferred >= 0) return preferred;
  // The two cells in the next column that touch this one are (nq, r) and (nq, r - step).
  for (const nr of [r, r - step]) {
    const fallback = cellAt(grid, nq, nr);
    if (fallback >= 0) return fallback;
  }
  return cell;
}
