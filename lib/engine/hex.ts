/**
 * Hex grid in axial coordinates (q, r), laid out flat-top so the board is
 * slightly taller than wide and fills a phone in portrait.
 *
 * Everything in the engine addresses a cell by its integer index and a beam
 * direction by an integer 0..5, so tracing and solving are exact integer math.
 */

/** A beam direction. Turning by +1 is a 60° counter-clockwise turn on screen. */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5;

/** Axial step for each direction: SE, NE, N, NW, SW, S on a flat-top layout. */
export const DIR_Q: readonly number[] = [1, 1, 0, -1, -1, 0];
export const DIR_R: readonly number[] = [0, -1, -1, 0, 1, 1];

export const DIR_NAMES: readonly string[] = [
  "down-right",
  "up-right",
  "up",
  "up-left",
  "down-left",
  "down",
];

export function mod6(n: number): Dir {
  return (((n % 6) + 6) % 6) as Dir;
}

export function opposite(d: number): Dir {
  return mod6(d + 3);
}

export interface Grid {
  readonly radius: number;
  /** Number of cells: 3R(R+1)+1. */
  readonly size: number;
  /** Axial coordinates of each cell, ordered column by column, top to bottom. */
  readonly q: Int8Array;
  readonly r: Int8Array;
  /** `nbr[cell * 6 + dir]` is the neighbouring cell index, or -1 off the board. */
  readonly nbr: Int16Array;
  /** Distance of each cell from the centre (0..radius). */
  readonly ring: Int8Array;
}

const grids = new Map<number, Grid>();

/** Hexagon-shaped board of the given radius. Grids are immutable and cached. */
export function makeGrid(radius: number): Grid {
  const cached = grids.get(radius);
  if (cached) return cached;
  if (!Number.isInteger(radius) || radius < 1 || radius > 6) {
    throw new RangeError(`Unsupported board radius: ${radius}`);
  }
  const size = 3 * radius * (radius + 1) + 1;
  const q = new Int8Array(size);
  const r = new Int8Array(size);
  const ring = new Int8Array(size);
  const lookup = new Map<number, number>();
  let i = 0;
  for (let cq = -radius; cq <= radius; cq++) {
    const rMin = Math.max(-radius, -cq - radius);
    const rMax = Math.min(radius, -cq + radius);
    for (let cr = rMin; cr <= rMax; cr++) {
      q[i] = cq;
      r[i] = cr;
      ring[i] = Math.max(Math.abs(cq), Math.abs(cr), Math.abs(cq + cr));
      lookup.set(cq * 64 + cr, i);
      i++;
    }
  }
  const nbr = new Int16Array(size * 6);
  for (let c = 0; c < size; c++) {
    for (let d = 0; d < 6; d++) {
      const n = lookup.get((q[c] + DIR_Q[d]) * 64 + (r[c] + DIR_R[d]));
      nbr[c * 6 + d] = n === undefined ? -1 : n;
    }
  }
  const grid: Grid = { radius, size, q, r, nbr, ring };
  grids.set(radius, grid);
  return grid;
}

/** Cell index at axial (q, r), or -1 when it is off the board. */
export function cellAt(grid: Grid, q: number, r: number): number {
  const R = grid.radius;
  if (Math.abs(q) > R || Math.abs(r) > R || Math.abs(q + r) > R) return -1;
  // Cells are stored column by column, so the index is a closed form.
  let before = 0;
  for (let cq = -R; cq < q; cq++) before += 2 * R + 1 - Math.abs(cq);
  return before + (r - Math.max(-R, -q - R));
}

/** Chess-style name: column letter (left to right), then row number from the top. */
export function cellName(grid: Grid, cell: number): string {
  const q = grid.q[cell];
  const r = grid.r[cell];
  const column = String.fromCharCode(65 + q + grid.radius);
  const row = r - Math.max(-grid.radius, -q - grid.radius) + 1;
  return `${column}${row}`;
}

/**
 * Centre of a cell in "unit" layout space, where a hexagon has circumradius 1.
 * The renderer scales this to pixels; the engine itself never uses it.
 */
export function cellCenter(grid: Grid, cell: number): { x: number; y: number } {
  const q = grid.q[cell];
  const r = grid.r[cell];
  return { x: 1.5 * q, y: Math.sqrt(3) * (r + q / 2) };
}

/** Size of the whole board in unit layout space. */
export function boardExtent(radius: number): { width: number; height: number } {
  return { width: 3 * radius + 2, height: Math.sqrt(3) * (2 * radius + 1) };
}

/** Screen angle (radians, y pointing down) a beam travels in for a direction. */
export function dirAngle(d: number): number {
  return ((30 - 60 * d) * Math.PI) / 180;
}

/** Screen angle (radians, y pointing down) of a mirror line with orientation m. */
export function mirrorAngle(m: number): number {
  return ((30 - 30 * m) * Math.PI) / 180;
}

/** Nearest cell to a point in unit layout space, or -1 when outside the board. */
export function cellAtPoint(grid: Grid, x: number, y: number): number {
  // Fractional axial coordinates, then cube rounding.
  const fq = x / 1.5;
  const fr = y / Math.sqrt(3) - fq / 2;
  const fs = -fq - fr;
  let rq = Math.round(fq);
  let rr = Math.round(fr);
  const rs = Math.round(fs);
  const dq = Math.abs(rq - fq);
  const dr = Math.abs(rr - fr);
  const ds = Math.abs(rs - fs);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return cellAt(grid, rq, rr);
}
