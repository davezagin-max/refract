import { describe, expect, it } from "vitest";
import { makeGrid } from "@/lib/engine/hex";
import { BLUE, GREEN, RED, WHITE } from "@/lib/engine/optics";
import { targetsLit, validatePuzzle } from "@/lib/engine/puzzle";
import { solve } from "@/lib/engine/solver";
import { trace } from "@/lib/engine/trace";
import {
  MAX_TRAY,
  applyTool,
  cleanDraft,
  decodeDraft,
  draftLight,
  draftProblems,
  draftPuzzle,
  draftSolution,
  emptyDraft,
  encodeDraft,
  eraseAt,
  resizeDraft,
  rotateAt,
  sampleDraft,
  verdict,
  whatIsAt,
  type Draft,
} from "@/lib/game/editor";
import { at } from "../engine/helpers";

const tray = { fixed: false, color: WHITE };
const locked = { fixed: true, color: WHITE };

describe("the sample level", () => {
  it("is a valid puzzle whose stored layout is its only solution", () => {
    const draft = sampleDraft();
    const puzzle = draftPuzzle(draft);
    expect(validatePuzzle(puzzle)).toEqual([]);
    expect(draftProblems(draft)).toEqual([]);
    expect(puzzle.tray).toEqual(["mirror", "prism"]);
    expect(targetsLit(puzzle, draftLight(draft))).toBe(true);
    expect(targetsLit(puzzle, trace(puzzle).light)).toBe(false);
    const result = solve(puzzle);
    expect(result.unique).toBe(true);
    const report = verdict(result);
    expect(report.tone).toBe("good");
    expect(report.difficulty?.label).toBe("Easy");
  });
});

describe("editor tools", () => {
  it("aims a new emitter down the longest line and turns it on the next click", () => {
    const cell = at(3, -3, 3); // the bottom-left corner: the long diagonal runs up-right
    let draft = applyTool(emptyDraft(), "emitter", cell, { fixed: false, color: RED });
    expect(draft.emitters).toEqual([{ cell, dir: 1, color: RED }]);
    draft = applyTool(draft, "emitter", cell, tray);
    expect(draft.emitters[0].dir).toBe(2);
    expect(draft.emitters[0].color).toBe(RED);
  });

  it("gives a new target the colour of the light already on its cell", () => {
    let draft = applyTool(emptyDraft(), "emitter", at(3, -3, 0), { fixed: false, color: WHITE });
    draft = { ...draft, emitters: [{ ...draft.emitters[0], dir: 0 }] };
    draft = applyTool(draft, "prism", at(3, -1, 0), tray);
    // Red goes straight on; green leaves one step to the left (up-right).
    draft = applyTool(draft, "target", at(3, 1, 0), { fixed: false, color: BLUE });
    draft = applyTool(draft, "target", at(3, 0, -1), { fixed: false, color: BLUE });
    // A dark cell takes the colour picked in the palette.
    draft = applyTool(draft, "target", at(3, -3, 3), { fixed: false, color: BLUE });
    expect(draft.targets.map((t) => t.color)).toEqual([RED, GREEN, BLUE]);
    expect(draftPuzzle(draft).tray).toEqual(["prism"]);
  });

  it("re-reads a lit target's colour, and steps through colours on a dark one", () => {
    const dark = at(3, 0, 2);
    let draft = applyTool(emptyDraft(), "target", dark, { fixed: false, color: RED });
    draft = applyTool(draft, "target", dark, tray);
    expect(draft.targets[0].color).toBe(GREEN); // red -> green: the next colour
    draft = rotateAt(draft, dark, -1);
    expect(draft.targets[0].color).toBe(RED);
    expect(rotateAt(draft, dark, -1).targets[0].color).toBe(WHITE); // wraps 1 -> 7

    // A target whose light has changed takes the new colour on a click.
    let lit = applyTool(emptyDraft(), "emitter", at(3, -3, 0), tray);
    lit = { ...lit, emitters: [{ ...lit.emitters[0], dir: 0 }], targets: [{ cell: at(3, 0, 0), color: RED }] };
    expect(applyTool(lit, "target", at(3, 0, 0), tray).targets[0].color).toBe(WHITE);
  });

  it("turns a piece on a repeat click and moves it between the tray and the board", () => {
    const cell = at(3, 0, 0);
    let draft = applyTool(emptyDraft(), "mirror", cell, tray);
    expect(whatIsAt(draft, cell)).toEqual({ type: "loose", index: 0 });
    draft = applyTool(draft, "mirror", cell, tray);
    expect(draft.loose[0].orient).toBe(1);
    draft = applyTool(draft, "mirror", cell, locked);
    expect(draft.loose).toEqual([]);
    expect(draft.fixed).toEqual([{ cell, kind: "mirror", orient: 1 }]);
    // A different tool replaces what is there.
    draft = applyTool(draft, "prism", cell, tray);
    expect(draft.fixed).toEqual([]);
    expect(draft.loose).toEqual([{ cell, kind: "prism", orient: 0 }]);
    // A prism has two orientations, so two turns bring it back.
    expect(rotateAt(rotateAt(draft, cell, 1), cell, 1).loose[0].orient).toBe(0);
  });

  it("toggles walls, erases, and never puts two things on one cell", () => {
    const cell = at(3, 1, 1);
    let draft = applyTool(emptyDraft(), "wall", cell, tray);
    expect(draft.walls).toEqual([cell]);
    expect(applyTool(draft, "wall", cell, tray).walls).toEqual([]);
    draft = applyTool(draft, "target", cell, tray);
    expect(draft.walls).toEqual([]);
    expect(draft.targets).toHaveLength(1);
    draft = applyTool(draft, "erase", cell, tray);
    expect(whatIsAt(draft, cell)).toBeNull();
    expect(applyTool(draft, "erase", cell, tray)).toBe(draft);
    expect(applyTool(draft, "wall", -1, tray)).toBe(draft);
    expect(applyTool(draft, "wall", 999, tray)).toBe(draft);
  });

  it("caps the tray", () => {
    let draft = emptyDraft();
    const grid = makeGrid(3);
    for (let cell = 0; cell < grid.size && draft.loose.length < MAX_TRAY; cell++) {
      draft = applyTool(draft, "mirror", cell, tray);
    }
    expect(draft.loose).toHaveLength(MAX_TRAY);
    const full = applyTool(draft, "splitter", grid.size - 1, tray);
    expect(full).toBe(draft);
    // A fixed piece is still allowed.
    expect(applyTool(draft, "splitter", grid.size - 1, locked).fixed).toHaveLength(1);
  });

  it("lists pieces in tray order and reports what is missing", () => {
    let draft = applyTool(emptyDraft(), "prism", at(3, 0, 0), tray);
    draft = applyTool(draft, "mirror", at(3, 1, 0), tray);
    expect(draftSolution(draft).map((p) => p.kind)).toEqual(["mirror", "prism"]);
    expect(draftProblems(emptyDraft())).toHaveLength(3);
    expect(draftProblems(draft)).toHaveLength(2);
  });

  it("keeps what still fits when the board is resized", () => {
    const draft = sampleDraft();
    expect(resizeDraft(draft, 3)).toBe(draft);
    const bigger = resizeDraft(draft, 4);
    // Everything survives growing, at the same axial position.
    expect(bigger.emitters).toHaveLength(1);
    expect(bigger.targets).toHaveLength(draft.targets.length);
    const small = makeGrid(3);
    const big = makeGrid(4);
    const e0 = draft.emitters[0].cell;
    const e1 = bigger.emitters[0].cell;
    expect([big.q[e1], big.r[e1]]).toEqual([small.q[e0], small.r[e0]]);
    // Shrinking drops whatever was on the outer ring, and the result is still a clean draft.
    const smaller = resizeDraft(draft, 2);
    const onRim = (cell: number) => small.ring[cell] === 3;
    expect(smaller.targets).toHaveLength(draft.targets.filter((t) => !onRim(t.cell)).length);
    expect(cleanDraft(smaller)).toEqual(smaller);
  });

  it("erases only the cell it is asked to", () => {
    const draft = sampleDraft();
    const after = eraseAt(draft, draft.fixed[0].cell);
    expect(after.fixed).toHaveLength(draft.fixed.length - 1);
    expect(after.targets).toEqual(draft.targets);
    expect(after.loose).toEqual(draft.loose);
  });
});

describe("stored drafts", () => {
  it("round-trips a draft through JSON", () => {
    const draft = sampleDraft();
    expect(cleanDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it("rejects anything malformed instead of repairing it", () => {
    const good = sampleDraft();
    const bad: unknown[] = [
      null,
      "draft",
      { ...good, radius: 9 },
      { ...good, walls: "none" },
      { ...good, walls: [good.emitters[0].cell] }, // two things on one cell
      { ...good, targets: [{ cell: 5, color: 0 }] },
      { ...good, emitters: [{ cell: 9, dir: 6, color: 7 }] },
      { ...good, loose: [{ cell: 20, kind: "lens", orient: 0 }] },
      { ...good, fixed: [{ cell: 13, kind: "prism", orient: 2 }] },
      { ...good, targets: [{ cell: 400, color: 1 }] },
    ];
    for (const value of bad) expect(cleanDraft(value)).toBeNull();
  });
});

describe("level links", () => {
  it("round-trips a draft through a URL-safe string", () => {
    const draft = sampleDraft();
    const text = encodeDraft(draft);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(text.length).toBeLessThan(300);
    expect(decodeDraft(text)).toEqual(draft);
    expect(decodeDraft(encodeDraft(emptyDraft(2)))).toEqual(emptyDraft(2));
  });

  it("returns null for anything that is not a valid level", () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, "");
    for (const text of [
      "",
      "not base64 !!",
      "AAAA",
      encode({ radius: 3 }),
      encode([3, [], [], [], []]),
      encode([3, [[9, 5, 7]], [[9, 1]], [], [], []]), // a target on the emitter's cell
      encode([3, [[9, 9, 7]], [], [], [], []]),
      encode([3, [], [], [], [[1, 7, 0]], []]), // no such piece kind
      encode([3, "x", [], [], [], []]),
      "A".repeat(5000),
    ]) {
      expect(decodeDraft(text), text.slice(0, 20)).toBeNull();
    }
  });
});

describe("solver verdicts", () => {
  it("reports an unsolvable board", () => {
    // Only red light exists, so a blue target can never be lit.
    const draft: Draft = {
      ...emptyDraft(),
      emitters: [{ cell: at(3, -3, 0), dir: 0, color: RED }],
      targets: [{ cell: at(3, 0, 2), color: BLUE }],
      loose: [{ cell: at(3, 0, 0), kind: "mirror", orient: 0 }],
    };
    const result = solve(draftPuzzle(draft));
    expect(result.status).toBe("unsolvable");
    const report = verdict(result);
    expect(report.tone).toBe("bad");
    expect(report.difficulty).toBeNull();
  });

  it("warns when there is more than one solution or the budget runs out", () => {
    const two = verdict({
      status: "solved",
      solutions: [[], []],
      unique: false,
      exhausted: false,
      nodes: 1234,
      pruned: { wrongColour: 0, unreachable: 0, tooMany: 0 },
    });
    expect(two.tone).toBe("warn");
    expect(two.title).toMatch(/more than one/);
    expect(two.detail).toContain("1,234");
    const gaveUp = verdict({
      status: "gave-up",
      solutions: [],
      unique: false,
      exhausted: false,
      nodes: 300000,
      pruned: { wrongColour: 0, unreachable: 0, tooMany: 0 },
    });
    expect(gaveUp.tone).toBe("warn");
    expect(gaveUp.title).toMatch(/Too big/);
    const unsolvable = verdict({
      status: "unsolvable",
      solutions: [],
      unique: false,
      exhausted: true,
      nodes: 40,
      pruned: { wrongColour: 0, unreachable: 0, tooMany: 0 },
    });
    expect(unsolvable.tone).toBe("bad");
    expect(unsolvable.detail).toContain("40 positions");
  });

  it("says so when the only solution leaves tray pieces over", () => {
    // One mirror at the centre sends the red beam to the target. The prism has
    // no job and can never get one: a prism does nothing to pure red light.
    const draft: Draft = {
      ...emptyDraft(2),
      emitters: [{ cell: at(2, -2, 0), dir: 0, color: RED }],
      targets: [{ cell: at(2, 2, -2), color: RED }],
      walls: [at(2, 2, -1)],
      loose: [
        { cell: at(2, 0, 0), kind: "mirror", orient: 1 },
        { cell: at(2, -1, 2), kind: "prism", orient: 0 },
      ],
    };
    const puzzle = draftPuzzle(draft);
    const result = solve(puzzle);
    // The solver stops at the first lit board, so it reports one solution of one piece.
    expect(result.unique).toBe(true);
    expect(result.solutions[0]).toEqual([{ cell: at(2, 0, 0), kind: "mirror", orient: 1 }]);
    const spare = verdict(result, puzzle.tray.length);
    expect(spare.tone).toBe("warn");
    expect(spare.title).toBe("Solvable, with a piece to spare");
    expect(spare.detail).toContain("1 of the 2 tray pieces");
    expect(spare.difficulty).toBeNull();

    // With the spare piece gone the same board is a clean, unique level.
    const tight = draftPuzzle({ ...draft, loose: draft.loose.slice(0, 1) });
    const clean = verdict(solve(tight), tight.tray.length);
    expect(clean.tone).toBe("good");
    expect(clean.title).toMatch(/exactly one solution/);
    expect(clean.difficulty?.label).toBe("Easy");

    // Targets already lit: nothing is needed at all.
    const idle = verdict(
      {
        status: "solved",
        solutions: [[]],
        unique: true,
        exhausted: true,
        nodes: 1,
        pruned: { wrongColour: 0, unreachable: 0, tooMany: 0 },
      },
      3,
    );
    expect(idle.title).toBe("Solvable, with pieces to spare");
    expect(idle.detail).toContain("already lit");
  });
});
