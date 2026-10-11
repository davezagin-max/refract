/**
 * Smoke test of the main path, end to end through the same code the app runs:
 * the engine worker's handler produces the day's puzzle, the cache check
 * accepts it, a game is played to a win through the reducer, and the result
 * is saved, shared and counted toward the streak.
 */
import { describe, expect, it } from "vitest";
import { utcToday } from "@/lib/engine/daily";
import { TIERS, type DailyPuzzle } from "@/lib/engine/generator";
import { placedPieces, targetsLit, validatePuzzle } from "@/lib/engine/puzzle";
import type { SolveResult } from "@/lib/engine/solver";
import { trace } from "@/lib/engine/trace";
import { asDailyPuzzle } from "@/lib/game/daily-cache";
import { handle } from "@/lib/game/engine-handle";
import { shareText } from "@/lib/game/share";
import { newGame, pieceAt, reduce, restore, serialize, type GameState } from "@/lib/game/state";
import { recordResult, streaks } from "@/lib/game/stats";

function daily(date: string): DailyPuzzle {
  // What the worker sends back, after the structured clone a postMessage does.
  const sent = structuredClone(handle({ id: 1, type: "daily", date })) as DailyPuzzle;
  const checked = asDailyPuzzle(JSON.parse(JSON.stringify(sent)), date);
  expect(checked, `cache check for ${date}`).not.toBeNull();
  return checked as DailyPuzzle;
}

describe("main path", () => {
  it("plays a daily puzzle from generation to a shared result", () => {
    const date = "2026-10-07";
    const { puzzle, solution, number, nodes, tier } = daily(date);
    expect(number).toBe(7);
    expect(tier).toBe("medium");
    expect(nodes).toBeGreaterThanOrEqual(TIERS.medium.band[0]);

    let state: GameState = newGame(puzzle);
    expect(state.solved).toBe(false);

    // A first, wrong move, then undo it.
    const wrongCell = solution[1].cell;
    state = reduce(state, { type: "place", index: 0, cell: wrongCell });
    expect(pieceAt(state, wrongCell)).toBe(0);
    expect(state.moves).toBe(1);
    state = reduce(state, { type: "undo" });
    expect(state.placements.every((placement) => placement === null)).toBe(true);

    // Then the way a player does it: drop each piece, and turn it until it is right.
    solution.forEach((piece, index) => {
      state = reduce(state, { type: "place", index, cell: piece.cell });
      for (let turns = 0; state.placements[index]?.orient !== piece.orient; turns++) {
        expect(turns).toBeLessThan(6);
        state = reduce(state, { type: "rotate", index, delta: 1 });
      }
    });
    expect(state.solved).toBe(true);
    expect(targetsLit(puzzle, trace(puzzle, placedPieces(puzzle, state.placements)).light)).toBe(true);
    expect(state.timeline.at(-1)).toBe("all");
    expect(state.timeline).toHaveLength(state.moves);
    expect(state.hints).toBe(0);
    // A solved board ignores further moves.
    expect(reduce(state, { type: "reset" })).toBe(state);

    // Saved and restored: still solved, same counters, clock kept.
    const saved = JSON.parse(JSON.stringify(serialize(state, 61_500)));
    const back = restore(puzzle, saved);
    expect(back?.state.solved).toBe(true);
    expect(back?.state.moves).toBe(state.moves);
    expect(back?.elapsedMs).toBe(61_500);

    const text = shareText({
      number,
      nodes,
      moves: state.moves,
      timeMs: 61_500,
      hints: state.hints,
      timeline: state.timeline,
      url: "https://refract.vercel.app",
    });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Refract #7 · Medium ★★☆☆☆");
    expect(lines[1]).toBe(`${state.moves} moves · 1:01 · no hints`);
    expect(lines.at(-1)).toBe("https://refract.vercel.app");
    expect(text).toContain("🟩");

    const history = recordResult({}, date, {
      moves: state.moves,
      timeMs: 61_500,
      hints: 0,
      solvedOn: date,
    });
    expect(streaks(history, date)).toEqual({ current: 1, best: 1, solved: 1 });
  });

  it("solves any day with hints alone, one locked piece per hint", () => {
    const { puzzle, solution } = daily("2026-10-11"); // a Sunday: expert
    let state = newGame(puzzle);
    for (let i = 0; i < puzzle.tray.length; i++) {
      expect(state.solved).toBe(false);
      state = reduce(state, { type: "hint", solution });
      expect(state.hints).toBe(i + 1);
    }
    expect(state.solved).toBe(true);
    expect(state.locked.every(Boolean)).toBe(true);
    expect(state.timeline.every((beat) => beat === "hint")).toBe(true);
    // No more hints to give.
    expect(reduce(state, { type: "hint", solution })).toBe(state);
  });

  it("serves a valid, solvable puzzle today, whatever today is", () => {
    const { puzzle, solution } = daily(utcToday());
    expect(validatePuzzle(puzzle)).toEqual([]);
    expect(targetsLit(puzzle, trace(puzzle, solution).light)).toBe(true);
    expect(targetsLit(puzzle, trace(puzzle).light)).toBe(false);
  });

  it("answers the editor's verify request the way the worker does", () => {
    const { puzzle, solution, nodes } = daily("2026-10-06");
    const result = structuredClone(
      handle({ id: 2, type: "solve", puzzle, maxNodes: 300_000 }),
    ) as SolveResult;
    expect(result.status).toBe("solved");
    expect(result.unique).toBe(true);
    expect(result.nodes).toBe(nodes);
    expect(result.solutions[0].map((p) => p.cell).sort()).toEqual(solution.map((p) => p.cell).sort());
    // The budget is a node count: too small a budget gives up instead of guessing.
    const tiny = handle({ id: 3, type: "solve", puzzle, maxNodes: 3 }) as SolveResult;
    expect(tiny.status).toBe("gave-up");
    expect(tiny.unique).toBe(false);
  });
});

describe("cached puzzles", () => {
  const date = "2026-10-08";
  const good = daily(date);
  const copy = () => JSON.parse(JSON.stringify(good)) as DailyPuzzle;

  it("rejects an entry for another day or with a broken puzzle", () => {
    expect(asDailyPuzzle(copy(), "2026-10-09")).toBeNull();
    expect(asDailyPuzzle(null, date)).toBeNull();
    expect(asDailyPuzzle("puzzle", date)).toBeNull();
    const noTargets = copy();
    noTargets.puzzle.targets = [];
    expect(asDailyPuzzle(noTargets, date)).toBeNull();
    const offBoard = copy();
    offBoard.puzzle.walls = [999];
    expect(asDailyPuzzle(offBoard, date)).toBeNull();
    const wrongTier = { ...copy(), tier: "easy" };
    expect(asDailyPuzzle(wrongTier, date)).toBeNull();
  });

  it("rejects an entry whose stored solution does not solve it", () => {
    const turned = copy();
    turned.solution[0].orient = (turned.solution[0].orient + 1) % 2;
    // Turning one piece breaks a uniquely solvable puzzle.
    expect(asDailyPuzzle(turned, date)).toBeNull();
    const short = copy();
    short.solution.pop();
    expect(asDailyPuzzle(short, date)).toBeNull();
    const onWall = copy();
    onWall.solution[0].cell = onWall.puzzle.walls[0];
    expect(asDailyPuzzle(onWall, date)).toBeNull();
    const swapped = copy();
    swapped.solution[0].kind = swapped.solution[0].kind === "prism" ? "mirror" : "prism";
    expect(asDailyPuzzle(swapped, date)).toBeNull();
    const badOrient = copy();
    badOrient.solution[0].orient = 17;
    expect(asDailyPuzzle(badOrient, date)).toBeNull();
  });
});
