import { describe, expect, it } from "vitest";
import { makeGrid } from "@/lib/engine/hex";
import { BLUE, GREEN, ORIENTATIONS, RED, WHITE, type PieceKind } from "@/lib/engine/optics";
import { placedKey, targetsLit, type Placed, type Puzzle } from "@/lib/engine/puzzle";
import { solve, solveFrom } from "@/lib/engine/solver";
import { trace } from "@/lib/engine/trace";
import { at, bruteForce, lcg, puzzle } from "./helpers";

const R = 2;
const c = (q: number, r: number) => at(R, q, r);

/** A random small puzzle built backwards from a solved board, so most are solvable. */
function randomPuzzle(random: () => number, trayMax: number): Puzzle {
  const grid = makeGrid(R);
  const pick = (n: number) => Math.floor(random() * n);
  const cells = Array.from({ length: grid.size }, (_, i) => i).sort(() => random() - 0.5);
  const kinds: PieceKind[] = ["mirror", "splitter", "prism"];
  const emitters = [{ cell: cells[0], dir: pick(6), color: random() < 0.7 ? WHITE : 1 + pick(7) }];
  const walls = cells.slice(1, 1 + pick(3));
  const pieces: Placed[] = cells.slice(4, 4 + 1 + pick(trayMax)).map((cell) => {
    const kind = kinds[pick(3)];
    return { cell, kind, orient: pick(ORIENTATIONS[kind]) };
  });
  const solved = trace(puzzle(R, { emitters, walls }), pieces);
  const lit = cells.slice(8).filter((cell) => solved.light[cell] !== 0);
  const targets = lit.slice(0, 1 + pick(3)).map((cell) => {
    // Now and then ask for a colour the board never produced, to cover unsolvable puzzles.
    const color = random() < 0.15 ? 1 + pick(7) : solved.light[cell];
    return { cell, color };
  });
  if (targets.length === 0) targets.push({ cell: cells[8], color: 1 + pick(7) });
  return puzzle(R, { emitters, walls, targets, tray: pieces.map((piece) => piece.kind) });
}

describe("solver", () => {
  const oneMirror = puzzle(R, {
    emitters: [{ cell: c(-2, 0), dir: 0, color: WHITE }],
    targets: [{ cell: c(2, -2), color: WHITE }],
    tray: ["mirror"],
  });

  it("finds both ways to reach a corner with one mirror", () => {
    const result = solve(oneMirror, { maxSolutions: 10 });
    expect(result.status).toBe("solved");
    expect(result.exhausted).toBe(true);
    expect(result.unique).toBe(false);
    expect(result.solutions.map(placedKey).sort()).toEqual(
      [
        placedKey([{ cell: c(0, 0), kind: "mirror", orient: 1 }]),
        placedKey([{ cell: c(2, 0), kind: "mirror", orient: 2 }]),
      ].sort(),
    );
  });

  it("reports a unique solution once a wall removes the second route", () => {
    const result = solve({ ...oneMirror, walls: [c(2, -1)] });
    expect(result.status).toBe("solved");
    expect(result.unique).toBe(true);
    expect(result.solutions).toEqual([[{ cell: c(0, 0), kind: "mirror", orient: 1 }]]);
  });

  it("proves a puzzle unsolvable when no piece can make the colour", () => {
    const result = solve({ ...oneMirror, targets: [{ cell: c(2, -2), color: RED }] });
    expect(result.status).toBe("unsolvable");
    expect(result.exhausted).toBe(true);
    expect(result.solutions).toEqual([]);
    expect(result.unique).toBe(false);
  });

  it("uses a prism and a mirror together to mix an exact colour", () => {
    // Magenta at the target needs red and blue to meet there without green.
    const p = puzzle(R, {
      emitters: [{ cell: c(-2, 0), dir: 0, color: WHITE }],
      targets: [
        { cell: c(2, 0), color: RED | BLUE },
        { cell: c(0, -1), color: GREEN },
      ],
      tray: ["prism", "mirror", "mirror"],
    });
    const result = solve(p, { maxSolutions: 50 });
    expect(result.status).toBe("solved");
    for (const solution of result.solutions) {
      const light = trace(p, solution).light;
      expect(light[c(2, 0)]).toBe(RED | BLUE);
      expect(light[c(0, -1)]).toBe(GREEN);
    }
    expect(new Set(result.solutions.map(placedKey)).size).toBe(result.solutions.length);
  });

  it("gives up cleanly at the node budget", () => {
    const hard = puzzle(3, {
      emitters: [{ cell: at(3, -3, 0), dir: 0, color: WHITE }],
      targets: [{ cell: at(3, 3, -3), color: BLUE }],
      tray: ["mirror", "mirror", "splitter", "prism"],
    });
    const result = solve(hard, { maxNodes: 25 });
    expect(result.nodes).toBe(25);
    expect(result.exhausted).toBe(false);
    expect(result.unique).toBe(false);
    if (result.solutions.length === 0) expect(result.status).toBe("gave-up");
  });

  it("returns the empty solution when the targets are already lit", () => {
    const p = puzzle(R, {
      emitters: [{ cell: c(-2, 0), dir: 0, color: WHITE }],
      targets: [{ cell: c(1, 0), color: WHITE }],
      tray: ["mirror"],
    });
    const result = solve(p);
    expect(result.solutions).toEqual([[]]);
    expect(result.nodes).toBe(1);
  });

  it("continues from pieces the player has already placed", () => {
    const p = puzzle(R, {
      emitters: [{ cell: c(-2, 0), dir: 0, color: WHITE }],
      targets: [{ cell: c(2, -2), color: WHITE }],
      walls: [c(2, -1)],
      tray: ["mirror", "mirror"],
    });
    // A mirror at (-1,0) turned up-right sends the beam along (0,-1), (1,-2).
    const kept: Placed[] = [{ cell: c(-1, 0), kind: "mirror", orient: 1 }];
    const result = solveFrom(p, kept, ["mirror"], { maxSolutions: 10 });
    expect(result.status).toBe("solved");
    for (const rest of result.solutions) {
      expect(targetsLit(p, trace(p, [...kept, ...rest]).light)).toBe(true);
    }
  });

  it("agrees with brute force on 250 random small puzzles", () => {
    const random = lcg(20261011);
    let solvable = 0;
    let unsolvable = 0;
    for (let round = 0; round < 250; round++) {
      const p = randomPuzzle(random, round % 5 === 0 ? 3 : 2);
      const reference = bruteForce(p);
      const referenceKeys = new Set(reference.map(placedKey));
      const result = solve(p, { maxSolutions: 1e9, maxNodes: 1e9 });
      const keys = result.solutions.map(placedKey);

      expect(result.exhausted).toBe(true);
      // Sound: everything the solver returns really is a solution with no idle piece.
      for (const key of keys) expect(referenceKeys.has(key)).toBe(true);
      // No placement set is ever reported (or visited) twice.
      expect(new Set(keys).size).toBe(keys.length);
      // Complete: every real solution contains one the solver found...
      for (const solution of reference) {
        const cells = new Set(solution.map((piece) => `${piece.cell}:${piece.kind}:${piece.orient}`));
        const covered = result.solutions.some((found) =>
          found.every((piece) => cells.has(`${piece.cell}:${piece.kind}:${piece.orient}`)),
        );
        expect(covered).toBe(true);
      }
      // ...and every solution with no smaller solution inside it is found exactly.
      for (const solution of reference) {
        const minimal = !reference.some(
          (other) =>
            other.length < solution.length &&
            other.every((piece) => solution.some((s) => placedKey([s]) === placedKey([piece]))),
        );
        if (minimal) expect(keys).toContain(placedKey(solution));
      }
      expect(result.status).toBe(reference.length > 0 ? "solved" : "unsolvable");
      if (reference.length > 0) solvable++;
      else unsolvable++;
    }
    // The sample has to exercise both outcomes to mean anything.
    expect(solvable).toBeGreaterThan(100);
    expect(unsolvable).toBeGreaterThan(10);
  });

  it("finds the same solutions as the naive search, in far fewer nodes", () => {
    const random = lcg(99);
    let smart = 0;
    let naive = 0;
    for (let round = 0; round < 80; round++) {
      const p = randomPuzzle(random, 3);
      const fast = solve(p, { maxSolutions: 1e9, maxNodes: 1e9 });
      const slow = solve(p, { maxSolutions: 1e9, maxNodes: 1e9, strategy: "naive" });
      expect(fast.solutions.map(placedKey).sort()).toEqual(slow.solutions.map(placedKey).sort());
      expect(fast.nodes).toBeLessThanOrEqual(slow.nodes);
      smart += fast.nodes;
      naive += slow.nodes;
    }
    expect(smart * 5).toBeLessThan(naive);
  });

  it("finds a solution where the beam meets the same piece twice", () => {
    // A splitter at (-1,1) in orientation 3 passes the beam into a mirror
    // triangle (its reflected copy goes straight back into the emitter). The
    // target is lit only when the beam comes round and reflects off the same
    // splitter a second time. A solver that assumed one visit per piece would
    // miss this solution.
    const p = puzzle(R, {
      emitters: [{ cell: c(-2, 1), dir: 0, color: WHITE }],
      fixed: [
        { cell: c(1, 1), kind: "mirror", orient: 2 },
        { cell: c(1, -1), kind: "mirror", orient: 0 },
      ],
      targets: [{ cell: c(-1, 2), color: WHITE }],
      tray: ["splitter"],
    });
    const twice: Placed[] = [{ cell: c(-1, 1), kind: "splitter", orient: 3 }];
    expect(targetsLit(p, trace(p).light)).toBe(false);
    expect(targetsLit(p, trace(p, twice).light)).toBe(true);
    const result = solve(p, { maxSolutions: 100 });
    expect(result.exhausted).toBe(true);
    expect(result.solutions.map(placedKey)).toContain(placedKey(twice));
    expect(result.solutions.map(placedKey).sort()).toEqual(bruteForce(p).map(placedKey).sort());
  });
});
