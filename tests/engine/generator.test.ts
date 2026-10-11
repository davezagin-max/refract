import { describe, expect, it } from "vitest";
import { addDays, dayNumber, weekday } from "@/lib/engine/daily";
import { difficultyOf } from "@/lib/engine/difficulty";
import {
  BOARD_RADIUS,
  TIERS,
  dailySeed,
  generate,
  generateDaily,
  tierForDate,
} from "@/lib/engine/generator";
import { placedKey, targetsLit, validatePuzzle } from "@/lib/engine/puzzle";
import { hashString, makeRng } from "@/lib/engine/rng";
import { solve } from "@/lib/engine/solver";
import { trace } from "@/lib/engine/trace";

describe("seeded random numbers", () => {
  it("gives the same sequence for the same seed and a different one otherwise", () => {
    const a = makeRng("refract/2026-10-11");
    const b = makeRng("refract/2026-10-11");
    const c = makeRng("refract/2026-10-12");
    const seqA = Array.from({ length: 20 }, () => a.u32());
    expect(Array.from({ length: 20 }, () => b.u32())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.u32())).not.toEqual(seqA);
  });

  it("pins the hash and the first outputs, so a change in the generator is noticed", () => {
    expect(hashString("refract")).toBe(1315966402);
    expect(hashString("a")).not.toBe(hashString("b"));
    const rng = makeRng(12345);
    expect([rng.u32(), rng.u32(), rng.u32()]).toEqual([4207900869, 1317490944, 2079646450]);
  });

  it("stays in range and shuffles without losing items", () => {
    const rng = makeRng("range");
    for (let i = 0; i < 500; i++) {
      const n = rng.int(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      const r = rng.range(3, 5);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(5);
    }
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(rng.shuffle([...items]).sort((x, y) => x - y)).toEqual(items);
    expect(rng.shuffle([...items])).not.toEqual(items);
  });
});

describe("daily generator", () => {
  it("is deterministic: the same date always gives the same puzzle", () => {
    for (const date of ["2026-10-05", "2026-10-07", "2026-10-09"]) {
      const first = generateDaily(date);
      const second = generateDaily(date);
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it("gives different puzzles on different days", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 6; i++) {
      keys.add(JSON.stringify(generateDaily(addDays("2026-10-05", i)).puzzle));
    }
    expect(keys.size).toBe(6);
  });

  it("ramps the tier through the week, hardest on Sunday", () => {
    // 2026-10-05 is a Monday.
    expect(weekday("2026-10-05")).toBe(1);
    expect(
      [0, 1, 2, 3, 4, 5, 6].map((offset) => tierForDate(addDays("2026-10-05", offset))),
    ).toEqual(["easy", "easy", "medium", "medium", "hard", "hard", "expert"]);
  });

  it("generates 70 consecutive days of valid, uniquely solvable puzzles in band", () => {
    const start = "2026-10-01";
    for (let offset = 0; offset < 70; offset++) {
      const date = addDays(start, offset);
      const daily = generateDaily(date);
      const { puzzle, solution } = daily;
      expect(daily.number).toBe(dayNumber(date));
      expect(validatePuzzle(puzzle), date).toEqual([]);
      expect(puzzle.radius).toBe(BOARD_RADIUS);

      // The stored solution really lights every target, using every tray piece...
      expect(solution.map((piece) => piece.kind)).toEqual(puzzle.tray);
      const solved = trace(puzzle, solution);
      expect(targetsLit(puzzle, solved.light), date).toBe(true);
      // ...the board does not start out solved, and no piece is a spare.
      expect(targetsLit(puzzle, trace(puzzle).light), date).toBe(false);
      for (let skip = 0; skip < solution.length; skip++) {
        const without = solution.filter((_, i) => i !== skip);
        expect(targetsLit(puzzle, trace(puzzle, without).light), date).toBe(false);
      }

      // The solver, run from scratch, finds exactly that solution and no other.
      const result = solve(puzzle);
      expect(result.status, date).toBe("solved");
      expect(result.unique, date).toBe(true);
      expect(placedKey(result.solutions[0])).toBe(placedKey(solution));
      expect(result.nodes).toBe(daily.nodes);

      // Difficulty is the measured search effort and sits in the day's band.
      const band = TIERS[daily.tier].band;
      expect(daily.nodes, date).toBeGreaterThanOrEqual(band[0]);
      expect(daily.nodes, date).toBeLessThanOrEqual(band[1]);
      expect(difficultyOf(daily.nodes).label.toLowerCase()).toBe(daily.tier);
    }
  }, 180_000);

  it("treats the attempt hint as a shortcut that cannot change the result", () => {
    const seed = dailySeed("2026-10-09");
    const plain = generate(seed, TIERS.hard);
    expect(plain.inBand).toBe(true);
    expect(generate(seed, TIERS.hard, plain.attempts - 1)).toEqual(plain);
    // A wrong hint is verified, rejected, and the full search runs instead.
    const wrong = plain.attempts - 1 === 0 ? 1 : 0;
    expect(generate(seed, TIERS.hard, wrong)).toEqual(plain);
    expect(generate(seed, TIERS.hard, 9999)).toEqual(plain);
  });
});
