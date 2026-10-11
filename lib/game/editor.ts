/**
 * The level editor's model. A draft is a board with the designer's intended
 * solution still on it: "loose" pieces are the ones the player will get in the
 * tray. Everything here is pure, so the editor UI is a thin layer on top.
 */
import { difficultyOf } from "@/lib/engine/difficulty";
import { cellAt, makeGrid } from "@/lib/engine/hex";
import { ORIENTATIONS, PIECE_KINDS, WHITE, type Color, type PieceKind } from "@/lib/engine/optics";
import type { Emitter, Placed, Puzzle, Target } from "@/lib/engine/puzzle";
import type { SolveResult } from "@/lib/engine/solver";
import { trace } from "@/lib/engine/trace";

export interface Draft {
  radius: number;
  emitters: Emitter[];
  targets: Target[];
  walls: number[];
  /** Pieces that stay on the board when the puzzle is played. */
  fixed: Placed[];
  /** The intended solution: these go to the player's tray. */
  loose: Placed[];
}

export type Tool = "emitter" | "target" | "wall" | PieceKind | "erase";

export interface ToolOptions {
  /** Piece tools: lock the piece to the board instead of giving it to the player. */
  fixed: boolean;
  /** Colour for a new emitter, or for a target placed on a dark cell. */
  color: Color;
}

export const MAX_TRAY = 8;
export const EDITOR_RADII = [2, 3, 4] as const;
/** Node budget for "verify solvable". */
export const VERIFY_NODES = 300_000;

export function emptyDraft(radius = 3): Draft {
  return { radius, emitters: [], targets: [], walls: [], fixed: [], loose: [] };
}

/**
 * A small finished level, so the editor opens on something that can be
 * verified and played straight away. It is the daily puzzle from day 5.
 */
export function sampleDraft(): Draft {
  return {
    radius: 3,
    emitters: [{ cell: 9, dir: 5, color: WHITE }],
    targets: [
      { cell: 5, color: 2 },
      { cell: 12, color: 1 },
      { cell: 26, color: 1 },
      { cell: 32, color: 1 },
    ],
    walls: [2, 34],
    fixed: [
      { cell: 13, kind: "mirror", orient: 5 },
      { cell: 19, kind: "mirror", orient: 2 },
    ],
    loose: [
      { cell: 20, kind: "mirror", orient: 2 },
      { cell: 10, kind: "prism", orient: 1 },
    ],
  };
}

export type Occupant =
  | { type: "emitter" | "target" | "wall" | "fixed" | "loose"; index: number }
  | null;

export function whatIsAt(draft: Draft, cell: number): Occupant {
  let index = draft.emitters.findIndex((e) => e.cell === cell);
  if (index >= 0) return { type: "emitter", index };
  index = draft.targets.findIndex((t) => t.cell === cell);
  if (index >= 0) return { type: "target", index };
  index = draft.walls.indexOf(cell);
  if (index >= 0) return { type: "wall", index };
  index = draft.fixed.findIndex((p) => p.cell === cell);
  if (index >= 0) return { type: "fixed", index };
  index = draft.loose.findIndex((p) => p.cell === cell);
  if (index >= 0) return { type: "loose", index };
  return null;
}

/** The puzzle a player would get: loose pieces leave the board for the tray. */
export function draftPuzzle(draft: Draft): Puzzle {
  return {
    radius: draft.radius,
    emitters: draft.emitters,
    targets: draft.targets,
    walls: draft.walls,
    fixed: draft.fixed,
    tray: draftSolution(draft).map((piece) => piece.kind),
  };
}

/** The designer's layout in tray order (mirrors, then splitters, then prisms). */
export function draftSolution(draft: Draft): Placed[] {
  return PIECE_KINDS.flatMap((kind) => draft.loose.filter((piece) => piece.kind === kind));
}

/** Light on the board with the designer's pieces in place. */
export function draftLight(draft: Draft): Uint8Array {
  return trace(draftPuzzle(draft), draft.loose).light;
}

export function eraseAt(draft: Draft, cell: number): Draft {
  return {
    ...draft,
    emitters: draft.emitters.filter((e) => e.cell !== cell),
    targets: draft.targets.filter((t) => t.cell !== cell),
    walls: draft.walls.filter((w) => w !== cell),
    fixed: draft.fixed.filter((p) => p.cell !== cell),
    loose: draft.loose.filter((p) => p.cell !== cell),
  };
}

const wrap = (value: number, count: number) => (((value % count) + count) % count);

/** Turn whatever is on the cell: an emitter's aim, a piece's rotation, a target's colour. */
export function rotateAt(draft: Draft, cell: number, delta: number): Draft {
  const found = whatIsAt(draft, cell);
  if (!found) return draft;
  if (found.type === "emitter") {
    const emitters = draft.emitters.map((e, i) =>
      i === found.index ? { ...e, dir: wrap(e.dir + delta, 6) } : e,
    );
    return { ...draft, emitters };
  }
  if (found.type === "target") {
    const targets = draft.targets.map((t, i) =>
      i === found.index ? { ...t, color: wrap(t.color - 1 + delta, 7) + 1 } : t,
    );
    return { ...draft, targets };
  }
  if (found.type === "fixed" || found.type === "loose") {
    const turn = (pieces: Placed[]) =>
      pieces.map((p, i) =>
        i === found.index ? { ...p, orient: wrap(p.orient + delta, ORIENTATIONS[p.kind]) } : p,
      );
    return found.type === "fixed"
      ? { ...draft, fixed: turn(draft.fixed) }
      : { ...draft, loose: turn(draft.loose) };
  }
  return draft;
}

/** The direction with the longest clear run across the board from a cell. */
function longestRun(radius: number, cell: number): number {
  const { nbr } = makeGrid(radius);
  let best = 0;
  let bestLength = -1;
  for (let dir = 0; dir < 6; dir++) {
    let length = 0;
    for (let c = nbr[cell * 6 + dir]; c >= 0; c = nbr[c * 6 + dir]) length++;
    if (length > bestLength) {
      bestLength = length;
      best = dir;
    }
  }
  return best;
}

/**
 * One click with a tool. Clicking something of the same kind adjusts it
 * (turn, re-read the colour, switch between tray and fixed); clicking anything
 * else replaces it.
 */
export function applyTool(draft: Draft, tool: Tool, cell: number, options: ToolOptions): Draft {
  if (cell < 0 || cell >= makeGrid(draft.radius).size) return draft;
  const found = whatIsAt(draft, cell);
  if (tool === "erase") return found ? eraseAt(draft, cell) : draft;

  if (found) {
    if (tool === "wall" && found.type === "wall") return eraseAt(draft, cell);
    if (tool === "emitter" && found.type === "emitter") return rotateAt(draft, cell, 1);
    if (tool === "target" && found.type === "target") {
      // Re-read the colour arriving here; on a dark cell, step through the colours instead.
      const light = draftLight(draft)[cell];
      if (light === 0 || light === draft.targets[found.index].color) return rotateAt(draft, cell, 1);
      const targets = draft.targets.map((t, i) => (i === found.index ? { ...t, color: light } : t));
      return { ...draft, targets };
    }
    if (found.type === "fixed" || found.type === "loose") {
      const piece = (found.type === "fixed" ? draft.fixed : draft.loose)[found.index];
      if (piece.kind === tool) {
        if ((found.type === "fixed") === options.fixed) return rotateAt(draft, cell, 1);
        // Same piece, other role: move it between the board and the tray.
        if (!options.fixed && draft.loose.length >= MAX_TRAY) return draft;
        const cleared = eraseAt(draft, cell);
        return options.fixed
          ? { ...cleared, fixed: [...cleared.fixed, piece] }
          : { ...cleared, loose: [...cleared.loose, piece] };
      }
    }
  }

  const cleared = found ? eraseAt(draft, cell) : draft;
  if (tool === "wall") return { ...cleared, walls: [...cleared.walls, cell].sort((a, b) => a - b) };
  if (tool === "emitter") {
    const emitter = { cell, dir: longestRun(draft.radius, cell), color: options.color };
    return { ...cleared, emitters: [...cleared.emitters, emitter] };
  }
  if (tool === "target") {
    const light = draftLight(cleared)[cell];
    const target = { cell, color: light === 0 ? options.color : light };
    return { ...cleared, targets: [...cleared.targets, target] };
  }
  const piece: Placed = { cell, kind: tool, orient: 0 };
  if (options.fixed) return { ...cleared, fixed: [...cleared.fixed, piece] };
  if (cleared.loose.length >= MAX_TRAY) return draft;
  return { ...cleared, loose: [...cleared.loose, piece] };
}

/** Change the board size, keeping whatever still fits (matched by position, not index). */
export function resizeDraft(draft: Draft, radius: number): Draft {
  if (radius === draft.radius) return draft;
  const from = makeGrid(draft.radius);
  const to = makeGrid(radius);
  const move = (cell: number) => cellAt(to, from.q[cell], from.r[cell]);
  const keep = <T extends { cell: number }>(items: T[]): T[] =>
    items.map((item) => ({ ...item, cell: move(item.cell) })).filter((item) => item.cell >= 0);
  return {
    radius,
    emitters: keep(draft.emitters),
    targets: keep(draft.targets),
    walls: draft.walls.map(move).filter((cell) => cell >= 0),
    fixed: keep(draft.fixed),
    loose: keep(draft.loose),
  };
}

/** What still has to be done before the draft can be verified or played. */
export function draftProblems(draft: Draft): string[] {
  const problems: string[] = [];
  if (draft.emitters.length === 0) problems.push("Add an emitter: the board needs a light source.");
  if (draft.targets.length === 0) problems.push("Add at least one target for the light to reach.");
  if (draft.loose.length === 0) {
    problems.push("Add at least one piece for the player's tray (a piece that is not fixed).");
  }
  return problems;
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** Rebuild a draft from storage or a link, dropping it whole if anything is off. */
export function cleanDraft(value: unknown): Draft | null {
  if (typeof value !== "object" || value === null) return null;
  const d = value as Partial<Draft>;
  if (!isInt(d.radius) || !(EDITOR_RADII as readonly number[]).includes(d.radius)) return null;
  const lists = [d.emitters, d.targets, d.walls, d.fixed, d.loose];
  if (!lists.every(Array.isArray)) return null;
  const size = makeGrid(d.radius).size;
  const used = new Set<number>();
  const claim = (cell: unknown): cell is number => {
    if (!isInt(cell) || cell < 0 || cell >= size || used.has(cell)) return false;
    used.add(cell);
    return true;
  };
  const color = (c: unknown): c is number => isInt(c) && c >= 1 && c <= 7;
  const piece = (p: unknown): p is Placed => {
    if (typeof p !== "object" || p === null) return false;
    const { cell, kind, orient } = p as Partial<Placed>;
    if (!PIECE_KINDS.includes(kind as PieceKind) || !claim(cell)) return false;
    return isInt(orient) && orient >= 0 && orient < ORIENTATIONS[kind as PieceKind];
  };
  const emitters = d.emitters as unknown[];
  const targets = d.targets as unknown[];
  const ok =
    emitters.every((e) => {
      if (typeof e !== "object" || e === null) return false;
      const { cell, dir, color: c } = e as Partial<Emitter>;
      return claim(cell) && isInt(dir) && dir >= 0 && dir < 6 && color(c);
    }) &&
    targets.every((t) => {
      if (typeof t !== "object" || t === null) return false;
      const { cell, color: c } = t as Partial<Target>;
      return claim(cell) && color(c);
    }) &&
    (d.walls as unknown[]).every(claim) &&
    (d.fixed as unknown[]).every(piece) &&
    (d.loose as unknown[]).every(piece) &&
    (d.loose as unknown[]).length <= MAX_TRAY;
  if (!ok) return null;
  const pick = ({ cell, kind, orient }: Placed): Placed => ({ cell, kind, orient });
  return {
    radius: d.radius,
    emitters: (d.emitters as Emitter[]).map(({ cell, dir, color: c }) => ({ cell, dir, color: c })),
    targets: (d.targets as Target[]).map(({ cell, color: c }) => ({ cell, color: c })),
    walls: [...(d.walls as number[])],
    fixed: (d.fixed as Placed[]).map(pick),
    loose: (d.loose as Placed[]).map(pick),
  };
}

/**
 * A draft as a short URL-safe string, for sharing a level as a link. The
 * decoder runs the result through `cleanDraft`, so a hand-edited link can at
 * worst fail to load.
 */
export function encodeDraft(draft: Draft): string {
  const piece = (p: Placed) => [p.cell, PIECE_KINDS.indexOf(p.kind), p.orient];
  const compact = [
    draft.radius,
    draft.emitters.map((e) => [e.cell, e.dir, e.color]),
    draft.targets.map((t) => [t.cell, t.color]),
    draft.walls,
    draft.fixed.map(piece),
    draft.loose.map(piece),
  ];
  return btoa(JSON.stringify(compact)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDraft(text: string): Draft | null {
  if (text.length === 0 || text.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const compact: unknown = JSON.parse(atob(text.replace(/-/g, "+").replace(/_/g, "/")));
    if (!Array.isArray(compact) || compact.length !== 6) return null;
    const [radius, emitters, targets, walls, fixed, loose] = compact as unknown[];
    const rows = (value: unknown): unknown[][] | null =>
      Array.isArray(value) && value.every(Array.isArray) ? (value as unknown[][]) : null;
    const e = rows(emitters);
    const t = rows(targets);
    const f = rows(fixed);
    const l = rows(loose);
    if (!e || !t || !f || !l) return null;
    const piece = ([cell, kind, orient]: unknown[]) => ({
      cell,
      kind: PIECE_KINDS[kind as number],
      orient,
    });
    return cleanDraft({
      radius,
      emitters: e.map(([cell, dir, color]) => ({ cell, dir, color })),
      targets: t.map(([cell, color]) => ({ cell, color })),
      walls,
      fixed: f.map(piece),
      loose: l.map(piece),
    });
  } catch {
    return null;
  }
}

export interface Verdict {
  tone: "good" | "warn" | "bad";
  title: string;
  detail: string;
  /** Set only when the solution is unique, which is when the measure means something. */
  difficulty: ReturnType<typeof difficultyOf> | null;
}

/** Put the solver's answer into words. */
export function verdict(result: SolveResult): Verdict {
  const nodes = result.nodes.toLocaleString("en-US");
  if (result.status === "unsolvable") {
    return {
      tone: "bad",
      title: "No solution",
      detail: `The solver tried every placement (${nodes} positions) and none lights all the targets.`,
      difficulty: null,
    };
  }
  if (result.status === "gave-up") {
    return {
      tone: "warn",
      title: "Too big to verify",
      detail: `The solver stopped after ${nodes} positions without an answer. Fewer tray pieces or more walls and targets will narrow the search.`,
      difficulty: null,
    };
  }
  if (result.unique) {
    const difficulty = difficultyOf(result.nodes);
    return {
      tone: "good",
      title: "Solvable, with exactly one solution",
      detail: `The solver needed ${nodes} positions to find it and rule out every other placement.`,
      difficulty,
    };
  }
  if (result.solutions.length > 1) {
    return {
      tone: "warn",
      title: "Solvable, but in more than one way",
      detail: `The solver found a second solution after ${nodes} positions. Add a target or a wall where the two differ to pin the puzzle down.`,
      difficulty: null,
    };
  }
  return {
    tone: "warn",
    title: "Solvable",
    detail: `The solver found a solution but ran out of budget (${nodes} positions) before it could rule out others.`,
    difficulty: null,
  };
}
