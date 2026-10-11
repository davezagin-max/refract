import { afterEach, describe, expect, it, vi } from "vitest";
import { cellAt, cellName, makeGrid } from "@/lib/engine/hex";
import { GREEN, RED, WHITE } from "@/lib/engine/optics";
import { trace } from "@/lib/engine/trace";
import { moveCursor, type ArrowKey } from "@/lib/game/cursor";
import { describeBoard, describeCell } from "@/lib/game/describe";
import { beatGrid, formatTime, shareText } from "@/lib/game/share";
import { cleanHistory, recordResult, streaks, type History } from "@/lib/game/stats";
import { load, remove, save } from "@/lib/game/storage";
import { at, puzzle } from "../engine/helpers";

describe("share text", () => {
  it("formats times", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(83_400)).toBe("1:23");
    expect(formatTime(3_600_000 + 5 * 60_000 + 7_000)).toBe("1:05:07");
  });

  it("builds a spoiler-free result with one square per move", () => {
    const text = shareText({
      number: 11,
      nodes: 3198,
      moves: 9,
      timeMs: 134_000,
      hints: 1,
      timeline: ["none", "some", "some", "most", "hint", "most", "most", "most", "all"],
      url: "https://refract.vercel.app",
    });
    expect(text).toBe(
      [
        "Refract #11 · Hard ★★★☆☆",
        "9 moves · 2:14 · 1 hint",
        "⬛🟧🟧🟨💡🟨🟨🟨",
        "🟩",
        "https://refract.vercel.app",
      ].join("\n"),
    );
    // Nothing in it says where a piece goes.
    expect(text).not.toMatch(/mirror|prism|splitter|[A-G][1-7]\b/);
  });

  it("handles singular wording, archive plays and very long games", () => {
    const text = shareText({
      number: 3,
      nodes: 20,
      moves: 1,
      timeMs: 4000,
      hints: 0,
      timeline: ["all"],
      late: true,
      url: "u",
    });
    expect(text.split("\n").slice(0, 2)).toEqual([
      "Refract #3 (archive) · Easy ★☆☆☆☆",
      "1 move · 0:04 · no hints",
    ]);
    const long = beatGrid(Array.from({ length: 100 }, () => "some" as const));
    expect(long.startsWith("…")).toBe(true);
    expect([...long.replace(/\n/g, "")]).toHaveLength(40);
  });
});

describe("streaks", () => {
  const result = (solvedOn: string) => ({ moves: 5, timeMs: 1000, hints: 0, solvedOn });
  const history: History = {
    "2026-10-05": result("2026-10-05"),
    "2026-10-06": result("2026-10-06"),
    "2026-10-07": result("2026-10-07"),
    "2026-10-09": result("2026-10-09"),
    "2026-10-10": result("2026-10-10"),
    "2026-10-08": result("2026-10-11"), // solved late, from the archive
  };

  it("counts consecutive days solved on the day", () => {
    expect(streaks(history, "2026-10-10")).toEqual({ current: 2, best: 3, solved: 6 });
  });

  it("keeps the streak alive until the end of the next day", () => {
    expect(streaks(history, "2026-10-11").current).toBe(2);
    expect(streaks(history, "2026-10-12").current).toBe(0);
  });

  it("does not let a late archive solve join or bridge a streak", () => {
    expect(streaks(history, "2026-10-10").best).toBe(3);
    expect(streaks({}, "2026-10-10")).toEqual({ current: 0, best: 0, solved: 0 });
  });

  it("keeps the first result for a day", () => {
    const first = recordResult({}, "2026-10-05", result("2026-10-05"));
    const again = recordResult(first, "2026-10-05", { ...result("2026-10-06"), moves: 1 });
    expect(again).toBe(first);
    expect(again["2026-10-05"].moves).toBe(5);
  });

  it("drops malformed entries from stored history", () => {
    expect(
      cleanHistory({
        "2026-10-05": result("2026-10-05"),
        "not-a-date": result("2026-10-05"),
        "2026-10-06": { moves: "many" },
        "2026-10-07": { ...result("2026-10-07"), timeMs: -1 },
        "2026-10-08": null,
      }),
    ).toEqual({ "2026-10-05": result("2026-10-05") });
    expect(cleanHistory("junk")).toEqual({});
    expect(cleanHistory([1, 2])).toEqual({});
  });
});

describe("keyboard cursor", () => {
  const grid = makeGrid(3);
  const name = (cell: number) => cellName(grid, cell);
  const walk = (from: string, ...keys: ArrowKey[]) => {
    let cell = Array.from({ length: grid.size }, (_, i) => i).find((i) => name(i) === from)!;
    return keys.map((key) => name((cell = moveCursor(grid, cell, key))));
  };

  it("moves up and down a column and stops at the rim", () => {
    expect(walk("D4", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp")).toEqual(["D3", "D2", "D1", "D1"]);
    expect(walk("D6", "ArrowDown", "ArrowDown")).toEqual(["D7", "D7"]);
  });

  it("zigzags sideways so the cursor stays on one visual row", () => {
    const row = walk("A2", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight");
    expect(row).toEqual(["B2", "C3", "D3", "E3", "F2", "G2"]);
    const ys = ["A2", ...row].map((cellLabel) => {
      const cell = Array.from({ length: grid.size }, (_, i) => i).find((i) => name(i) === cellLabel)!;
      return grid.r[cell] + grid.q[cell] / 2;
    });
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(0.5);
    expect(walk("G2", "ArrowLeft", "ArrowLeft", "ArrowLeft")).toEqual(["F2", "E3", "D3"]);
  });

  it("always lands on a neighbouring cell and can reach every cell", () => {
    const reached = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      const cell = queue.pop()!;
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const) {
        const next = moveCursor(grid, cell, key);
        if (next !== cell) {
          expect(Array.from(grid.nbr.slice(cell * 6, cell * 6 + 6))).toContain(next);
        }
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    expect(reached.size).toBe(grid.size);
    // From a corner, sideways still moves where a neighbour exists.
    expect(walk("A1", "ArrowRight")).toEqual(["B1"]);
    expect(moveCursor(grid, cellAt(grid, -3, 0), "ArrowLeft")).toBe(cellAt(grid, -3, 0));
  });
});

describe("board description for screen readers", () => {
  const R = 2;
  const c = (q: number, r: number) => at(R, q, r);
  const p = puzzle(R, {
    emitters: [{ cell: c(-2, 0), dir: 0, color: WHITE }],
    targets: [
      { cell: c(1, 0), color: RED },
      { cell: c(1, -1), color: GREEN },
      { cell: c(-1, 0), color: WHITE },
    ],
    walls: [c(2, -2)],
    fixed: [{ cell: c(0, 1), kind: "mirror", orient: 2 }],
    tray: ["prism", "mirror"],
  });

  it("says where everything is and which targets are lit", () => {
    const placements = [{ cell: c(0, 0), orient: 0 }, null];
    const light = trace(p, [{ cell: c(0, 0), kind: "prism", orient: 0 }]).light;
    expect(describeBoard(p, placements, light)).toEqual([
      "Hexagonal board, 19 cells in 5 columns A to E, rows numbered from the top of each column.",
      "Emitter at A1 sends white light down-right.",
      "3 of 3 targets lit.",
      "Target at D3 needs red: lit.",
      "Target at D2 needs green: lit.",
      "Target at B2 needs white: lit.",
      "Walls at E1.",
      "Fixed mirror at C4, rotation 3 of 6.",
      "Piece 1, prism, at C3, bending left.",
      "Piece 2, mirror, in the tray.",
    ]);
  });

  it("describes single cells, including wrong-colour targets", () => {
    const light = trace(p).light;
    expect(describeCell(p, [null, null], light, c(1, 0))).toBe(
      "D3: red target, wrong colour, receiving white",
    );
    expect(describeCell(p, [null, null], light, c(1, -1))).toBe("D2: green target, dark");
    expect(describeCell(p, [null, null], light, c(0, 0))).toBe("C3: empty, white light passing");
    expect(describeCell(p, [null, null], light, c(0, -1))).toBe("C2: empty");
    expect(describeCell(p, [null, null], light, c(2, -2))).toBe("E1: wall");
    expect(describeCell(p, [null, null], light, c(-2, 0))).toBe(
      "A1: emitter, white light going down-right",
    );
    expect(describeCell(p, [null, { cell: c(0, -1), orient: 4 }], light, c(0, -1))).toBe(
      "C2: your mirror, rotation 5 of 6",
    );
    expect(describeCell(p, [null, null], light, c(0, 1))).toBe("C4: fixed mirror, rotation 3 of 6");
  });
});

describe("guarded storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("works with no window at all (server render, tests)", () => {
    expect(save("k", { a: 1 })).toBe(false);
    expect(load("k")).toEqual({ a: 1 });
    remove("k");
    expect(load("k")).toBeNull();
  });

  it("uses localStorage when it is there and survives bad JSON", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
      },
    });
    expect(save("streak", [1, 2, 3])).toBe(true);
    expect(data.get("refract:v1:streak")).toBe("[1,2,3]");
    expect(load("streak")).toEqual([1, 2, 3]);
    data.set("refract:v1:broken", "{not json");
    expect(load("broken")).toBeNull();
  });

  it("keeps playing from memory when storage throws", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(save("game", { moves: 3 })).toBe(false);
    expect(load("game")).toEqual({ moves: 3 });

    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(save("game2", { moves: 4 })).toBe(false);
    expect(load("game2")).toEqual({ moves: 4 });
    expect(() => remove("game2")).not.toThrow();
  });
});
