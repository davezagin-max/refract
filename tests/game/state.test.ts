import { describe, expect, it } from "vitest";
import { generateDaily } from "@/lib/engine/generator";
import { WHITE } from "@/lib/engine/optics";
import type { Puzzle } from "@/lib/engine/puzzle";
import {
  newGame,
  nextHint,
  pieceAt,
  reduce,
  restore,
  serialize,
  type Action,
  type GameState,
} from "@/lib/game/state";
import { at, puzzle } from "../engine/helpers";

const R = 2;
const c = (q: number, r: number) => at(R, q, r);

/** One mirror at the centre turned to orientation 1 lights the corner target. */
const small: Puzzle = puzzle(R, {
  emitters: [{ cell: c(-2, 0), dir: 0, color: WHITE }],
  targets: [{ cell: c(2, -2), color: WHITE }],
  walls: [c(2, -1)],
  tray: ["mirror", "mirror"],
});

const play = (state: GameState, ...actions: Action[]) => actions.reduce(reduce, state);

describe("game reducer", () => {
  it("starts with every piece in the tray and nothing counted", () => {
    const state = newGame(small);
    expect(state.placements).toEqual([null, null]);
    expect(state.moves).toBe(0);
    expect(state.solved).toBe(false);
  });

  it("places, moves and removes pieces, one move each", () => {
    let state = play(newGame(small), { type: "place", index: 0, cell: c(-1, 0) });
    expect(state.placements[0]).toEqual({ cell: c(-1, 0), orient: 0 });
    expect(state.moves).toBe(1);
    state = play(state, { type: "place", index: 0, cell: c(1, 1) });
    expect(state.placements[0]).toEqual({ cell: c(1, 1), orient: 0 });
    expect(pieceAt(state, c(-1, 0))).toBe(-1);
    state = play(state, { type: "remove", index: 0 });
    expect(state.placements[0]).toBeNull();
    expect(state.moves).toBe(3);
  });

  it("refuses cells that hold an emitter, target or wall", () => {
    const start = newGame(small);
    for (const cell of [c(-2, 0), c(2, -2), c(2, -1), -1, 999]) {
      expect(reduce(start, { type: "place", index: 0, cell })).toBe(start);
    }
  });

  it("sends a piece back to the tray when another is dropped on it", () => {
    const state = play(
      newGame(small),
      { type: "place", index: 0, cell: c(0, 0) },
      { type: "place", index: 1, cell: c(0, 0) },
    );
    expect(state.placements).toEqual([null, { cell: c(0, 0), orient: 0 }]);
  });

  it("counts a burst of turns on one piece as a single move and a single undo", () => {
    let state = play(newGame(small), { type: "place", index: 0, cell: c(1, 1) });
    state = play(
      state,
      { type: "rotate", index: 0, delta: 1 },
      { type: "rotate", index: 0, delta: 1 },
      { type: "rotate", index: 0, delta: 1 },
    );
    expect(state.placements[0]?.orient).toBe(3);
    expect(state.moves).toBe(2);
    expect(state.timeline).toHaveLength(2);
    state = play(state, { type: "undo" });
    expect(state.placements[0]?.orient).toBe(0);
    // Turning a different piece, or after another action, starts a new move.
    state = play(
      state,
      { type: "rotate", index: 0, delta: -1 },
      { type: "place", index: 1, cell: c(0, 1) },
      { type: "rotate", index: 0, delta: -1 },
    );
    expect(state.placements[0]?.orient).toBe(4);
    expect(state.moves).toBe(5);
  });

  it("wraps rotation both ways and respects each kind's symmetry", () => {
    const prism = newGame({ ...small, tray: ["prism"] });
    let state = play(prism, { type: "place", index: 0, cell: c(0, 0) });
    state = play(state, { type: "rotate", index: 0, delta: 1 });
    expect(state.placements[0]?.orient).toBe(1);
    state = play(state, { type: "rotate", index: 0, delta: 1 });
    expect(state.placements[0]?.orient).toBe(0);
    state = play(state, { type: "rotate", index: 0, delta: -1 });
    expect(state.placements[0]?.orient).toBe(1);
  });

  it("undoes and redoes without changing the move count, and a new move clears redo", () => {
    let state = play(
      newGame(small),
      { type: "place", index: 0, cell: c(0, 1) },
      { type: "place", index: 1, cell: c(1, 0) },
    );
    state = play(state, { type: "undo" });
    expect(state.placements).toEqual([{ cell: c(0, 1), orient: 0 }, null]);
    expect(state.moves).toBe(2);
    state = play(state, { type: "redo" });
    expect(state.placements[1]).toEqual({ cell: c(1, 0), orient: 0 });
    state = play(state, { type: "undo" }, { type: "place", index: 1, cell: c(-1, 1) });
    expect(state.redo).toEqual([]);
    expect(reduce(state, { type: "redo" })).toBe(state);
  });

  it("wins when every target has its colour, then ignores further input", () => {
    let state = play(
      newGame(small),
      { type: "place", index: 0, cell: c(0, 0) },
      { type: "rotate", index: 0, delta: 1 },
    );
    expect(state.solved).toBe(true);
    expect(state.timeline).toEqual(["none", "all"]);
    const frozen = state;
    state = play(state, { type: "rotate", index: 0, delta: 1 }, { type: "undo" }, { type: "reset" });
    expect(state).toBe(frozen);
  });

  it("clears the board on reset but keeps counting", () => {
    let state = play(
      newGame(small),
      { type: "place", index: 0, cell: c(0, 1) },
      { type: "place", index: 1, cell: c(1, 0) },
      { type: "reset" },
    );
    expect(state.placements).toEqual([null, null]);
    expect(state.moves).toBe(3);
    state = play(state, { type: "undo" });
    expect(state.placements[1]).toEqual({ cell: c(1, 0), orient: 0 });
    const empty = newGame(small);
    expect(reduce(empty, { type: "reset" })).toBe(empty);
  });
});

describe("hints", () => {
  const solution = [{ cell: c(0, 0), kind: "mirror" as const, orient: 1 }];

  it("places one correct piece, locks it, and marks the move", () => {
    const state = play(newGame(small), { type: "hint", solution });
    expect(state.placements[0]).toEqual({ cell: c(0, 0), orient: 1 });
    expect(state.locked[0]).toBe(true);
    expect(state.hints).toBe(1);
    expect(state.timeline).toEqual(["hint"]);
    expect(state.solved).toBe(true);
  });

  it("turns a piece that is already on the right cell rather than using another", () => {
    const start = play(newGame(small), { type: "place", index: 1, cell: c(0, 0) });
    expect(nextHint(start, solution)).toEqual({ index: 1, cell: c(0, 0), orient: 1 });
  });

  it("treats same-kind pieces as interchangeable and stops when nothing is left to reveal", () => {
    const done = play(
      newGame(small),
      { type: "place", index: 1, cell: c(0, 0), orient: 1 },
    );
    expect(done.solved).toBe(true);
    expect(nextHint(done, solution)).toBeNull();
  });

  it("clears a wrong piece off the cell it needs and cannot be moved afterwards", () => {
    const blocker: Puzzle = { ...small, tray: ["mirror", "prism"] };
    let state = play(newGame(blocker), { type: "place", index: 1, cell: c(0, 0) });
    state = play(state, { type: "hint", solution });
    expect(state.placements).toEqual([{ cell: c(0, 0), orient: 1 }, null]);
    const locked = { ...state, solved: false };
    expect(reduce(locked, { type: "rotate", index: 0, delta: 1 })).toBe(locked);
    expect(reduce(locked, { type: "remove", index: 0 })).toBe(locked);
    expect(reduce(locked, { type: "place", index: 1, cell: c(0, 0) })).toBe(locked);
  });

  it("solves any daily puzzle in exactly as many hints as it has pieces", () => {
    const daily = generateDaily("2026-10-09");
    let state = newGame(daily.puzzle);
    for (let i = 0; i < daily.puzzle.tray.length; i++) {
      expect(state.solved).toBe(false);
      state = reduce(state, { type: "hint", solution: daily.solution });
    }
    expect(state.solved).toBe(true);
    expect(state.hints).toBe(daily.puzzle.tray.length);
  });
});

describe("save and restore", () => {
  it("round-trips a game in progress through JSON, as a reload does", () => {
    const state = play(
      newGame(small),
      { type: "place", index: 0, cell: c(0, 1) },
      { type: "rotate", index: 0, delta: 2 },
      { type: "place", index: 1, cell: c(1, 0) },
      { type: "undo" },
    );
    const saved = JSON.parse(JSON.stringify(serialize(state, 12_345.6)));
    const restored = restore(small, saved);
    expect(restored?.elapsedMs).toBe(12_346);
    expect(restored?.state).toEqual({ ...state, rotating: null });
    // The restored game keeps working: redo is still there.
    const again = reduce(restored!.state, { type: "redo" });
    expect(again.placements[1]).toEqual({ cell: c(1, 0), orient: 0 });
  });

  it("recomputes the solved flag instead of trusting the stored one", () => {
    const state = play(newGame(small), { type: "place", index: 0, cell: c(0, 1) });
    const lying = { ...serialize(state, 0), solved: true };
    expect(restore(small, lying)?.state.solved).toBe(false);
  });

  it("rejects saves that do not fit the puzzle", () => {
    const good = serialize(play(newGame(small), { type: "place", index: 0, cell: c(0, 1) }), 5);
    expect(restore(small, good)).not.toBeNull();
    const bad: unknown[] = [
      null,
      "text",
      { ...good, v: 2 },
      { ...good, placements: [null] },
      { ...good, placements: [{ cell: c(2, -1), orient: 0 }, null] }, // on a wall
      { ...good, placements: [{ cell: c(0, 1), orient: 9 }, null] },
      { ...good, placements: [{ cell: c(0, 1), orient: 0 }, { cell: c(0, 1), orient: 0 }] },
      { ...good, moves: -1 },
      { ...good, timeline: ["nope"] },
      { ...good, elapsedMs: Number.NaN },
      { ...good, undo: [{ placements: [], locked: [] }] },
      { ...good, locked: [true] },
    ];
    for (const value of bad) expect(restore(small, value)).toBeNull();
  });
});
