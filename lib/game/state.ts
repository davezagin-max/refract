/**
 * The game as a pure reducer: no DOM, no clock, no storage. The UI dispatches
 * actions and renders whatever comes back, which keeps every rule testable.
 */
import { ORIENTATIONS } from "@/lib/engine/optics";
import {
  baseContent,
  countLit,
  placedPieces,
  targetsLit,
  type Placed,
  type Placement,
  type Puzzle,
} from "@/lib/engine/puzzle";
import { trace } from "@/lib/engine/trace";

/** What the board looked like after a move, for the share grid. */
export type Beat = "none" | "some" | "most" | "all" | "hint";

interface Snapshot {
  placements: Placement[];
  locked: boolean[];
}

export interface GameState {
  puzzle: Puzzle;
  /** One entry per tray piece: where it is, or null while in the tray. */
  placements: Placement[];
  /** Pieces fixed in place by a hint. */
  locked: boolean[];
  /** Every change to the board counts, including ones later undone. */
  moves: number;
  hints: number;
  /** One beat per move, in order. */
  timeline: Beat[];
  undo: Snapshot[];
  redo: Snapshot[];
  /** Tray index of the piece the last move rotated, so a burst of turns is one move. */
  rotating: number | null;
  solved: boolean;
}

export type Action =
  | { type: "place"; index: number; cell: number; orient?: number }
  | { type: "rotate"; index: number; delta: number }
  | { type: "remove"; index: number }
  | { type: "hint"; solution: readonly Placed[] }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" };

export function newGame(puzzle: Puzzle): GameState {
  return {
    puzzle,
    placements: puzzle.tray.map(() => null),
    locked: puzzle.tray.map(() => false),
    moves: 0,
    hints: 0,
    timeline: [],
    undo: [],
    redo: [],
    rotating: null,
    solved: false,
  };
}

/** Tray index of the movable piece on a cell, or -1. */
export function pieceAt(state: Pick<GameState, "placements">, cell: number): number {
  return state.placements.findIndex((placement) => placement !== null && placement.cell === cell);
}

const bases = new WeakMap<Puzzle, Uint8Array>();

/** True when a tray piece may be put on the cell (it holds nothing fixed). */
export function isFreeCell(puzzle: Puzzle, cell: number): boolean {
  let base = bases.get(puzzle);
  if (!base) {
    base = baseContent(puzzle);
    bases.set(puzzle, base);
  }
  return cell >= 0 && cell < base.length && base[cell] === 0;
}

function beatFor(puzzle: Puzzle, placements: Placement[]): Beat {
  const lit = countLit(puzzle, trace(puzzle, placedPieces(puzzle, placements)).light);
  const total = puzzle.targets.length;
  if (lit === total) return "all";
  if (lit === 0) return "none";
  return lit * 2 >= total ? "most" : "some";
}

/** Commit a new arrangement as one move. */
function commit(
  state: GameState,
  placements: Placement[],
  locked: boolean[],
  rotating: number | null,
  beat?: Beat,
): GameState {
  const solved = targetsLit(state.puzzle, trace(state.puzzle, placedPieces(state.puzzle, placements)).light);
  return {
    ...state,
    placements,
    locked,
    moves: state.moves + 1,
    timeline: [...state.timeline, beat ?? beatFor(state.puzzle, placements)],
    undo: [...state.undo, { placements: state.placements, locked: state.locked }],
    redo: [],
    rotating,
    solved,
  };
}

/**
 * Which tray piece a hint should place, and where. The solution is matched by
 * kind, not by tray slot: two mirrors are interchangeable, so a mirror the
 * player already put in a correct spot is left alone.
 */
export function nextHint(
  state: Pick<GameState, "puzzle" | "placements" | "locked">,
  solution: readonly Placed[],
): { index: number; cell: number; orient: number } | null {
  const { puzzle, placements } = state;
  const satisfied = new Set<number>(); // tray indexes already sitting in a solution slot
  const open: Placed[] = [];
  for (const slot of solution) {
    const holder = placements.findIndex(
      (placement, i) =>
        placement !== null &&
        !satisfied.has(i) &&
        puzzle.tray[i] === slot.kind &&
        placement.cell === slot.cell &&
        placement.orient === slot.orient,
    );
    if (holder >= 0) satisfied.add(holder);
    else open.push(slot);
  }
  if (open.length === 0) return null;
  const spare = (slot: Placed, accept: (placement: Placement, i: number) => boolean) =>
    placements.findIndex(
      (placement, i) => puzzle.tray[i] === slot.kind && !satisfied.has(i) && accept(placement, i),
    );
  // Best: a piece already on the right cell that only needs turning.
  for (const slot of open) {
    const index = spare(slot, (placement) => placement !== null && placement.cell === slot.cell);
    if (index >= 0) return { index, cell: slot.cell, orient: slot.orient };
  }
  // Then a piece still in the tray, then one that is misplaced.
  for (const slot of open) {
    const index = spare(slot, (placement) => placement === null);
    if (index >= 0) return { index, cell: slot.cell, orient: slot.orient };
  }
  for (const slot of open) {
    const index = spare(slot, () => true);
    if (index >= 0) return { index, cell: slot.cell, orient: slot.orient };
  }
  return null;
}

export function reduce(state: GameState, action: Action): GameState {
  if (state.solved) return state;
  const { puzzle } = state;
  switch (action.type) {
    case "place": {
      const { index, cell } = action;
      const current = state.placements[index];
      if (current === undefined || state.locked[index] || !isFreeCell(puzzle, cell)) return state;
      const orient = action.orient ?? current?.orient ?? 0;
      if (current && current.cell === cell && current.orient === orient) return state;
      const occupant = pieceAt(state, cell);
      if (occupant >= 0 && occupant !== index && state.locked[occupant]) return state;
      const placements = state.placements.slice();
      // A piece already on the cell goes back to the tray.
      if (occupant >= 0 && occupant !== index) placements[occupant] = null;
      placements[index] = { cell, orient };
      return commit(state, placements, state.locked, null);
    }
    case "rotate": {
      const { index } = action;
      const current = state.placements[index];
      if (!current || state.locked[index]) return state;
      const count = ORIENTATIONS[puzzle.tray[index]];
      const orient = (((current.orient + action.delta) % count) + count) % count;
      if (orient === current.orient) return state;
      const placements = state.placements.slice();
      placements[index] = { cell: current.cell, orient };
      if (state.rotating === index) {
        // Still turning the same piece: fold into the move already counted.
        const timeline = state.timeline.slice(0, -1).concat(beatFor(puzzle, placements));
        const solved = targetsLit(puzzle, trace(puzzle, placedPieces(puzzle, placements)).light);
        return { ...state, placements, timeline, redo: [], solved };
      }
      return commit(state, placements, state.locked, index);
    }
    case "remove": {
      const { index } = action;
      if (!state.placements[index] || state.locked[index]) return state;
      const placements = state.placements.slice();
      placements[index] = null;
      return commit(state, placements, state.locked, null);
    }
    case "hint": {
      const hint = nextHint(state, action.solution);
      if (!hint) return state;
      const placements = state.placements.slice();
      const locked = state.locked.slice();
      const occupant = pieceAt(state, hint.cell);
      if (occupant >= 0 && occupant !== hint.index) placements[occupant] = null;
      placements[hint.index] = { cell: hint.cell, orient: hint.orient };
      locked[hint.index] = true;
      const next = commit(state, placements, locked, null, "hint");
      return { ...next, hints: state.hints + 1 };
    }
    case "reset": {
      if (!state.placements.some((placement, i) => placement !== null && !state.locked[i])) {
        return state;
      }
      const placements = state.placements.map((placement, i) => (state.locked[i] ? placement : null));
      return commit(state, placements, state.locked, null);
    }
    case "undo": {
      const previous = state.undo[state.undo.length - 1];
      if (!previous) return state;
      return {
        ...state,
        placements: previous.placements,
        locked: previous.locked,
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, { placements: state.placements, locked: state.locked }],
        rotating: null,
      };
    }
    case "redo": {
      const next = state.redo[state.redo.length - 1];
      if (!next) return state;
      return {
        ...state,
        placements: next.placements,
        locked: next.locked,
        undo: [...state.undo, { placements: state.placements, locked: state.locked }],
        redo: state.redo.slice(0, -1),
        rotating: null,
      };
    }
  }
}

/** The plain-JSON form written to storage. */
export interface SavedGame {
  v: 1;
  placements: Placement[];
  locked: boolean[];
  moves: number;
  hints: number;
  timeline: Beat[];
  undo: Snapshot[];
  redo: Snapshot[];
  solved: boolean;
  elapsedMs: number;
}

export function serialize(state: GameState, elapsedMs: number): SavedGame {
  return {
    v: 1,
    placements: state.placements,
    locked: state.locked,
    moves: state.moves,
    hints: state.hints,
    timeline: state.timeline,
    undo: state.undo,
    redo: state.redo,
    solved: state.solved,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

const BEATS: readonly Beat[] = ["none", "some", "most", "all", "hint"];

function validPlacements(puzzle: Puzzle, value: unknown): value is Placement[] {
  if (!Array.isArray(value) || value.length !== puzzle.tray.length) return false;
  const base = baseContent(puzzle);
  const used = new Set<number>();
  return value.every((placement, i) => {
    if (placement === null) return true;
    if (typeof placement !== "object") return false;
    const { cell, orient } = placement as { cell: unknown; orient: unknown };
    if (!Number.isInteger(cell) || !Number.isInteger(orient)) return false;
    const c = cell as number;
    const o = orient as number;
    if (c < 0 || c >= base.length || base[c] !== 0 || used.has(c)) return false;
    if (o < 0 || o >= ORIENTATIONS[puzzle.tray[i]]) return false;
    used.add(c);
    return true;
  });
}

function validSnapshots(puzzle: Puzzle, value: unknown): value is Snapshot[] {
  return (
    Array.isArray(value) &&
    value.length <= 2000 &&
    value.every(
      (snapshot) =>
        typeof snapshot === "object" &&
        snapshot !== null &&
        validPlacements(puzzle, (snapshot as Snapshot).placements) &&
        validFlags(puzzle, (snapshot as Snapshot).locked),
    )
  );
}

function validFlags(puzzle: Puzzle, value: unknown): value is boolean[] {
  return (
    Array.isArray(value) &&
    value.length === puzzle.tray.length &&
    value.every((flag) => typeof flag === "boolean")
  );
}

/**
 * Rebuild a game from storage. Anything that does not fit this puzzle (a
 * corrupted entry, or a save from an older generator) is rejected whole, and
 * the caller starts a fresh game instead.
 */
export function restore(
  puzzle: Puzzle,
  saved: unknown,
): { state: GameState; elapsedMs: number } | null {
  if (typeof saved !== "object" || saved === null) return null;
  const s = saved as Partial<SavedGame>;
  const count = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
  if (
    s.v !== 1 ||
    !validPlacements(puzzle, s.placements) ||
    !validFlags(puzzle, s.locked) ||
    !validSnapshots(puzzle, s.undo) ||
    !validSnapshots(puzzle, s.redo) ||
    !count(s.moves) ||
    !count(s.hints) ||
    !Array.isArray(s.timeline) ||
    !s.timeline.every((beat) => BEATS.includes(beat)) ||
    typeof s.elapsedMs !== "number" ||
    !Number.isFinite(s.elapsedMs) ||
    s.elapsedMs < 0
  ) {
    return null;
  }
  // Never trust a stored "solved" flag: recompute it from the board.
  const solved = targetsLit(puzzle, trace(puzzle, placedPieces(puzzle, s.placements)).light);
  return {
    state: {
      puzzle,
      placements: s.placements,
      locked: s.locked,
      moves: s.moves,
      hints: s.hints,
      timeline: s.timeline,
      undo: s.undo,
      redo: s.redo,
      rotating: null,
      solved,
    },
    elapsedMs: s.elapsedMs,
  };
}
