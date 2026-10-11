import { cellAt, makeGrid } from "@/lib/engine/hex";
import { ORIENTATIONS, type PieceKind } from "@/lib/engine/optics";
import {
  baseContent,
  placedKey,
  targetsLit,
  type Placed,
  type Puzzle,
} from "@/lib/engine/puzzle";
import { trace } from "@/lib/engine/trace";

/** Cell index from axial coordinates; throws when off the board. */
export function at(radius: number, q: number, r: number): number {
  const cell = cellAt(makeGrid(radius), q, r);
  if (cell < 0) throw new Error(`(${q}, ${r}) is not on a radius-${radius} board`);
  return cell;
}

export function puzzle(radius: number, parts: Partial<Puzzle>): Puzzle {
  return { radius, emitters: [], targets: [], walls: [], fixed: [], tray: [], ...parts };
}

/** Small deterministic generator for property tests. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Reference solver: tries every way to put any subset of the tray on the empty
 * cells and keeps the boards that light every target with no idle piece.
 * Exponential and obviously correct; only for small boards.
 */
export function bruteForce(p: Puzzle): Placed[][] {
  const base = baseContent(p);
  const empty: number[] = [];
  base.forEach((code, cell) => {
    if (code === 0) empty.push(cell);
  });
  const found = new Map<string, Placed[]>();
  const placed: Placed[] = [];

  const check = () => {
    const result = trace(p, placed);
    if (!targetsLit(p, result.light)) return;
    if (placed.some((piece) => result.hit[piece.cell] === 0)) return;
    found.set(placedKey(placed), placed.map((piece) => ({ ...piece })));
  };

  const recurse = (index: number) => {
    if (index === p.tray.length) return check();
    const kind: PieceKind = p.tray[index];
    recurse(index + 1); // leave this piece in the tray
    for (const cell of empty) {
      if (placed.some((piece) => piece.cell === cell)) continue;
      for (let orient = 0; orient < ORIENTATIONS[kind]; orient++) {
        placed.push({ cell, kind, orient });
        recurse(index + 1);
        placed.pop();
      }
    }
  };
  recurse(0);
  return [...found.values()];
}
