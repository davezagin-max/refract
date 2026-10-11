/** The puzzle model: what is fixed on the board and what the player may place. */
import { makeGrid, type Grid } from "./hex";
import {
  EMITTER,
  ORIENTATIONS,
  PIECE_KINDS,
  TARGET,
  WALL,
  pieceCode,
  type Color,
  type PieceKind,
} from "./optics";

export interface Emitter {
  cell: number;
  dir: number;
  color: Color;
}

export interface Target {
  cell: number;
  /** The exact colour this target must receive. Extra channels make it wrong. */
  color: Color;
}

export interface Placed {
  cell: number;
  kind: PieceKind;
  orient: number;
}

export interface Puzzle {
  radius: number;
  emitters: Emitter[];
  targets: Target[];
  walls: number[];
  /** Pieces locked in place on the board. */
  fixed: Placed[];
  /** Pieces the player places and rotates. */
  tray: PieceKind[];
}

/** A tray piece on the board, or null while it is still in the tray. */
export type Placement = { cell: number; orient: number } | null;

export function gridOf(puzzle: Puzzle): Grid {
  return makeGrid(puzzle.radius);
}

/** Cell contents with only the fixed parts of the puzzle. */
export function baseContent(puzzle: Puzzle): Uint8Array {
  const content = new Uint8Array(gridOf(puzzle).size);
  for (const wall of puzzle.walls) content[wall] = WALL;
  for (const emitter of puzzle.emitters) content[emitter.cell] = EMITTER;
  for (const target of puzzle.targets) content[target.cell] = TARGET;
  for (const piece of puzzle.fixed) content[piece.cell] = pieceCode(piece.kind, piece.orient);
  return content;
}

/** Cell contents with the fixed parts plus the given movable pieces. */
export function contentWith(puzzle: Puzzle, placed: readonly Placed[]): Uint8Array {
  const content = baseContent(puzzle);
  for (const piece of placed) content[piece.cell] = pieceCode(piece.kind, piece.orient);
  return content;
}

/** The movable pieces that are currently on the board. */
export function placedPieces(puzzle: Puzzle, placements: readonly Placement[]): Placed[] {
  const out: Placed[] = [];
  placements.forEach((placement, i) => {
    if (placement) {
      out.push({ cell: placement.cell, kind: puzzle.tray[i], orient: placement.orient });
    }
  });
  return out;
}

/** True when every target receives exactly its colour. */
export function targetsLit(puzzle: Puzzle, light: Uint8Array): boolean {
  for (const target of puzzle.targets) {
    if (light[target.cell] !== target.color) return false;
  }
  return true;
}

export function countLit(puzzle: Puzzle, light: Uint8Array): number {
  let lit = 0;
  for (const target of puzzle.targets) if (light[target.cell] === target.color) lit++;
  return lit;
}

/** Stable text form of a set of pieces, used to compare solutions. */
export function placedKey(placed: readonly Placed[]): string {
  return placed
    .map((p) => `${p.cell}:${p.kind}:${p.orient}`)
    .sort()
    .join("|");
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/**
 * Structural validation for anything that did not come from the generator
 * (editor imports, saved drafts). Returns a list of problems; empty means valid.
 */
export function validatePuzzle(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return ["Puzzle must be an object."];
  const p = input as Partial<Puzzle>;
  if (!isInt(p.radius) || p.radius < 1 || p.radius > 6) {
    return ["Board radius must be a whole number from 1 to 6."];
  }
  if (
    !Array.isArray(p.emitters) ||
    !Array.isArray(p.targets) ||
    !Array.isArray(p.walls) ||
    !Array.isArray(p.fixed) ||
    !Array.isArray(p.tray)
  ) {
    return ["Puzzle is missing emitters, targets, walls, fixed pieces, or the tray."];
  }
  const size = makeGrid(p.radius).size;
  const used = new Set<number>();
  const claim = (cell: unknown, what: string): boolean => {
    if (!isInt(cell) || cell < 0 || cell >= size) {
      errors.push(`${what} is on a cell that is not on the board.`);
      return false;
    }
    if (used.has(cell)) {
      errors.push(`${what} shares a cell with something else.`);
      return false;
    }
    used.add(cell);
    return true;
  };
  const validColor = (c: unknown) => isInt(c) && c >= 1 && c <= 7;
  const validKind = (k: unknown): k is PieceKind => PIECE_KINDS.includes(k as PieceKind);

  p.emitters.forEach((e, i) => {
    if (typeof e !== "object" || e === null) return void errors.push(`Emitter ${i + 1} is malformed.`);
    claim(e.cell, `Emitter ${i + 1}`);
    if (!isInt(e.dir) || e.dir < 0 || e.dir > 5) errors.push(`Emitter ${i + 1} has no direction.`);
    if (!validColor(e.color)) errors.push(`Emitter ${i + 1} has no colour.`);
  });
  p.targets.forEach((t, i) => {
    if (typeof t !== "object" || t === null) return void errors.push(`Target ${i + 1} is malformed.`);
    claim(t.cell, `Target ${i + 1}`);
    if (!validColor(t.color)) errors.push(`Target ${i + 1} has no colour.`);
  });
  p.walls.forEach((w, i) => claim(w, `Wall ${i + 1}`));
  p.fixed.forEach((f, i) => {
    if (typeof f !== "object" || f === null) return void errors.push(`Fixed piece ${i + 1} is malformed.`);
    claim(f.cell, `Fixed piece ${i + 1}`);
    if (!validKind(f.kind)) errors.push(`Fixed piece ${i + 1} has an unknown kind.`);
    else if (!isInt(f.orient) || f.orient < 0 || f.orient >= ORIENTATIONS[f.kind]) {
      errors.push(`Fixed piece ${i + 1} has an invalid rotation.`);
    }
  });
  p.tray.forEach((k, i) => {
    if (!validKind(k)) errors.push(`Tray piece ${i + 1} has an unknown kind.`);
  });
  if (p.emitters.length === 0) errors.push("Add at least one emitter.");
  if (p.targets.length === 0) errors.push("Add at least one target.");
  if (p.tray.length > 8) errors.push("The tray holds at most 8 pieces.");
  return errors;
}
