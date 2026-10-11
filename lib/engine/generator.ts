/**
 * Level generator. Works backwards from a solution so every puzzle is
 * solvable by construction, then uses the solver to make sure the intended
 * solution is the only one and that the puzzle is as hard as the day asks.
 *
 *  1. Build a solved board: drop an emitter, then add pieces one at a time on
 *     cells the light already reaches, each turned so it changes the beam and
 *     opens new ground without cutting off an earlier piece.
 *  2. Derive targets from the traced light: a small set of lit cells chosen
 *     so that removing any tray piece changes at least one target.
 *  3. Move the tray pieces off the board and run the solver. While it finds a
 *     solution other than the intended one, add the constraint that kills it
 *     (a target where the two boards differ in colour, or a wall under a
 *     piece the other solution needs) and solve again.
 *  4. Accept only if the final, exhaustive search effort lands in the tier's
 *     band. Otherwise retry with the next sub-seed.
 *
 * Everything is driven by one seeded generator and by node budgets, never by
 * the clock, so a date produces the same puzzle on every device.
 */
import { dayNumber, isValidDate } from "./daily";
import { makeGrid } from "./hex";
import {
  EMPTY,
  ORIENTATIONS,
  PIECE_KINDS,
  WALL,
  WHITE,
  pieceCode,
  type PieceKind,
} from "./optics";
import { baseContent, placedKey, type Placed, type Puzzle, type Target } from "./puzzle";
import { makeRng, type Rng } from "./rng";
import { dailySeed, tierForDate, type TierName } from "./schedule";
import { solve } from "./solver";
import { traceContent } from "./trace";

export { GENERATOR_VERSION, dailySeed, tierForDate, type TierName } from "./schedule";

export const BOARD_RADIUS = 3;

export interface TierSpec {
  /** Tray make-ups to choose from. */
  trays: PieceKind[][];
  /** How many locked pieces to add to the board (inclusive range). */
  locked: [number, number];
  walls: [number, number];
  /** Targets to aim for before the uniqueness pass adds its own. */
  targets: [number, number];
  /** Accepted solver effort, in nodes of the exhaustive search. */
  band: [number, number];
}

export interface Generated {
  puzzle: Puzzle;
  /** The one solution, in tray order. */
  solution: Placed[];
  /** Nodes the solver expanded to prove the solution unique. */
  nodes: number;
  /** Sub-seeds tried, including the accepted one. */
  attempts: number;
  /** False only if no sub-seed landed in the band and the closest was used. */
  inBand: boolean;
}

const MAX_ATTEMPTS = 60;
const MAX_TARGETS = 7;
const MAX_WALLS = 8;
const MAX_REFINEMENTS = 8;
/** Unintended solutions to collect per solver run during refinement. */
const COUNTEREXAMPLES = 6;

interface Candidate {
  puzzle: Puzzle;
  solution: Placed[];
  nodes: number;
}

function tryBuild(rng: Rng, spec: TierSpec): Candidate | null {
  const grid = makeGrid(BOARD_RADIUS);
  const { size, nbr } = grid;
  const content = new Uint8Array(size);

  // Emitter: on the rim, pointing along a line with room to play in.
  const starts: { cell: number; dir: number }[] = [];
  for (let cell = 0; cell < size; cell++) {
    if (grid.ring[cell] < BOARD_RADIUS) continue;
    for (let dir = 0; dir < 6; dir++) {
      let length = 0;
      for (let c = nbr[cell * 6 + dir]; c >= 0; c = nbr[c * 6 + dir]) length++;
      if (length >= 4) starts.push({ cell, dir });
    }
  }
  const start = rng.pick(starts);
  const emitters = [{ cell: start.cell, dir: start.dir, color: WHITE }];
  content[start.cell] = 2;

  const tray = rng.pick(spec.trays);
  const lockedCount = rng.range(spec.locked[0], spec.locked[1]);
  const queue: { kind: PieceKind; locked: boolean }[] = tray.map((kind) => ({
    kind,
    locked: false,
  }));
  for (let i = 0; i < lockedCount; i++) {
    queue.push({ kind: rng.chance(0.75) ? "mirror" : "splitter", locked: true });
  }
  rng.shuffle(queue);

  const pieces: (Placed & { locked: boolean })[] = [];
  for (const item of queue) {
    const before = traceContent(grid, content, emitters);
    const options: { cell: number; orient: number }[] = [];
    for (let cell = 0; cell < size; cell++) {
      const light = before.light[cell];
      if (content[cell] !== EMPTY || light === 0) continue;
      // A prism should have something to separate.
      if (item.kind === "prism" && (light & (light - 1)) === 0) continue;
      for (let orient = 0; orient < ORIENTATIONS[item.kind]; orient++) {
        content[cell] = pieceCode(item.kind, orient);
        const after = traceContent(grid, content, emitters);
        content[cell] = EMPTY;
        if (after.hit[cell] === 0) continue;
        if (pieces.some((piece) => after.hit[piece.cell] === 0)) continue;
        let gained = 0;
        for (let c = 0; c < size; c++) if (after.light[c] !== 0 && before.light[c] === 0) gained++;
        if (gained >= 2) options.push({ cell, orient });
      }
    }
    if (options.length === 0) return null;
    const choice = rng.pick(options);
    content[choice.cell] = pieceCode(item.kind, choice.orient);
    pieces.push({ cell: choice.cell, kind: item.kind, orient: choice.orient, locked: item.locked });
  }

  const solved = traceContent(grid, content, emitters);
  const movable = pieces.filter((piece) => !piece.locked);
  const fixed: Placed[] = pieces
    .filter((piece) => piece.locked)
    .map(({ cell, kind, orient }) => ({ cell, kind, orient }));

  // Walls go on dark cells, so they never disturb the intended beams.
  const dark: number[] = [];
  const lit: number[] = [];
  for (let cell = 0; cell < size; cell++) {
    if (content[cell] !== EMPTY) continue;
    (solved.light[cell] === 0 ? dark : lit).push(cell);
  }
  rng.shuffle(dark);
  const walls = dark.slice(0, rng.range(spec.walls[0], spec.walls[1]));
  for (const wall of walls) content[wall] = WALL;

  // What the board looks like before the player has placed anything.
  for (const piece of movable) content[piece.cell] = EMPTY;
  const initial = traceContent(grid, content, emitters);

  // For each tray piece, the lit cells whose colour depends on it.
  const affects: Set<number>[] = movable.map((piece) => {
    for (const other of movable) {
      if (other !== piece) content[other.cell] = pieceCode(other.kind, other.orient);
    }
    const without = traceContent(grid, content, emitters);
    for (const other of movable) content[other.cell] = EMPTY;
    return new Set(lit.filter((cell) => without.light[cell] !== solved.light[cell]));
  });
  if (affects.some((cells) => cells.size === 0)) return null;

  // Greedy cover: fewest targets such that every tray piece matters to one.
  const chosen = new Set<number>();
  const uncovered = new Set(movable.map((_, i) => i));
  const order = rng.shuffle([...lit]);
  while (uncovered.size > 0) {
    let best = -1;
    let bestScore = 0;
    for (const cell of order) {
      if (chosen.has(cell)) continue;
      let score = 0;
      for (const i of uncovered) if (affects[i].has(cell)) score += 2;
      // Prefer targets that start out unlit or wrong: they read as goals.
      if (score > 0 && initial.light[cell] !== solved.light[cell]) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    if (best < 0) return null;
    chosen.add(best);
    for (const i of [...uncovered]) if (affects[i].has(best)) uncovered.delete(i);
  }
  const wanted = rng.range(spec.targets[0], spec.targets[1]);
  for (const cell of order) {
    if (chosen.size >= wanted) break;
    if (initial.light[cell] !== solved.light[cell]) chosen.add(cell);
  }

  const targets: Target[] = [...chosen]
    .sort((a, b) => a - b)
    .map((cell) => ({ cell, color: solved.light[cell] }));
  const puzzle: Puzzle = {
    radius: BOARD_RADIUS,
    emitters,
    targets,
    walls: [...walls].sort((a, b) => a - b),
    fixed,
    tray: PIECE_KINDS.flatMap((kind) => tray.filter((k) => k === kind)),
  };
  const intended: Placed[] = movable.map(({ cell, kind, orient }) => ({ cell, kind, orient }));
  const intendedKey = placedKey(intended);
  const intendedCells = new Set(intended.map((piece) => piece.cell));

  // Counterexample-guided refinement: let the solver find unintended
  // solutions, add the constraints that rule them out, repeat. Each round asks
  // for several counterexamples and greedily picks the constraint that kills
  // the most of them, which keeps both the rounds and the targets few.
  const isFree = (cell: number, base: Uint8Array) => base[cell] === EMPTY && !intendedCells.has(cell);
  for (let round = 0; round <= MAX_REFINEMENTS; round++) {
    const result = solve(puzzle, { maxNodes: spec.band[1], maxSolutions: COUNTEREXAMPLES + 1 });
    let others = result.solutions.filter((s) => placedKey(s) !== intendedKey);
    if (others.length === 0) {
      if (!result.unique) return null; // ran out of budget: too hard for this tier
      const solution = puzzle.tray.map((kind, i) => {
        const nth = puzzle.tray.slice(0, i).filter((k) => k === kind).length;
        return intended.filter((piece) => piece.kind === kind)[nth];
      });
      return { puzzle, solution, nodes: result.nodes };
    }

    while (others.length > 0) {
      const base = baseContent(puzzle);
      const boards = others.map((other) => {
        const board = base.slice();
        for (const piece of other) board[piece.cell] = pieceCode(piece.kind, piece.orient);
        return { board, light: traceContent(grid, board, emitters).light };
      });
      // A target on a cell the intended beams light kills every other solution
      // that has a piece there or lights it differently. A wall on a cell the
      // intended beams never touch kills the ones that need that cell.
      let bestCell = -1;
      let bestKills: boolean[] = [];
      let bestScore = 0;
      let bestIsWall = false;
      const cells = rng.shuffle(Array.from({ length: size }, (_, cell) => cell));
      for (const cell of cells) {
        if (!isFree(cell, base)) continue;
        const asWall = solved.light[cell] === 0;
        if (!asWall && puzzle.targets.length >= MAX_TARGETS) continue;
        if (asWall && puzzle.walls.length >= MAX_WALLS) continue;
        const kills = boards.map(({ board, light }) => {
          if (board[cell] !== EMPTY) return true;
          if (!asWall) return light[cell] !== solved.light[cell];
          if (light[cell] === 0) return false;
          // The other solution shines through here: does blocking it break it?
          board[cell] = WALL;
          const blocked = traceContent(grid, board, emitters).light;
          board[cell] = EMPTY;
          return puzzle.targets.some((t) => blocked[t.cell] !== t.color);
        });
        // Prefer targets slightly: they read as goals, walls as clutter.
        const score = kills.filter(Boolean).length * 2 + (asWall ? 0 : 1);
        if (kills.some(Boolean) && score > bestScore) {
          bestScore = score;
          bestCell = cell;
          bestKills = kills;
          bestIsWall = asWall;
        }
      }
      if (bestCell < 0) return null;
      if (bestIsWall) {
        puzzle.walls.push(bestCell);
        puzzle.walls.sort((x, y) => x - y);
      } else {
        puzzle.targets.push({ cell: bestCell, color: solved.light[bestCell] });
        puzzle.targets.sort((x, y) => x.cell - y.cell);
      }
      others = others.filter((_, i) => !bestKills[i]);
    }
  }
  return null;
}

/** Distance from a node count to a band, in doublings (0 inside the band). */
function bandDistance(nodes: number, band: [number, number]): number {
  if (nodes < band[0]) return Math.log2(band[0] / nodes);
  if (nodes > band[1]) return Math.log2(nodes / band[1]);
  return 0;
}

/**
 * Generate a puzzle for a seed. Tries sub-seeds in order and returns the first
 * whose difficulty is inside the band (or, failing that, the closest one).
 *
 * `hint` is an optional shortcut: the sub-seed index known to be the first one
 * in the band (see hints.ts). It is verified, never trusted: if that attempt
 * does not land in the band, the full search runs as if there were no hint.
 */
export function generate(seed: string, spec: TierSpec, hint?: number): Generated {
  if (hint !== undefined && hint >= 0 && hint < MAX_ATTEMPTS) {
    const candidate = tryBuild(makeRng(`${seed}#${hint}`), spec);
    if (candidate && bandDistance(candidate.nodes, spec.band) === 0) {
      return { ...candidate, attempts: hint + 1, inBand: true };
    }
  }
  let best: Candidate | null = null;
  let bestDistance = Infinity;
  let bestAttempt = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS || best === null; attempt++) {
    if (attempt >= MAX_ATTEMPTS * 20) {
      throw new Error(`Generator found no valid puzzle for seed ${seed}`);
    }
    const candidate = tryBuild(makeRng(`${seed}#${attempt}`), spec);
    if (!candidate) continue;
    const distance = bandDistance(candidate.nodes, spec.band);
    if (distance === 0) {
      return { ...candidate, attempts: attempt + 1, inBand: true };
    }
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      bestAttempt = attempt;
    }
  }
  return { ...(best as Candidate), attempts: bestAttempt + 1, inBand: false };
}

const M: PieceKind = "mirror";
const S: PieceKind = "splitter";
const P: PieceKind = "prism";

/**
 * The four tiers. Bands are in solver nodes and were set from the measured
 * distribution of each tray size (see the difficulty notes in the README).
 */
export const TIERS: Readonly<Record<TierName, TierSpec>> = {
  easy: {
    trays: [[M, M], [M, S], [M, P]],
    locked: [1, 2],
    walls: [2, 4],
    targets: [2, 3],
    band: [1, 149],
  },
  medium: {
    trays: [[M, M, S], [M, S, P], [M, M, P]],
    locked: [0, 2],
    walls: [2, 4],
    targets: [3, 4],
    band: [150, 1499],
  },
  hard: {
    trays: [[M, M, S, P], [M, M, M, P], [M, M, S, S]],
    locked: [0, 2],
    walls: [2, 5],
    targets: [3, 5],
    band: [1500, 7999],
  },
  expert: {
    trays: [[M, M, M, S, P], [M, M, S, P, P], [M, M, M, M, P]],
    locked: [0, 2],
    walls: [3, 6],
    targets: [4, 6],
    band: [8000, 29999],
  },
};

export interface DailyPuzzle {
  date: string;
  /** 1 on the first day of the series. */
  number: number;
  tier: TierName;
  puzzle: Puzzle;
  /** The unique solution, in tray order. */
  solution: Placed[];
  /** Solver nodes needed to prove the solution unique. */
  nodes: number;
  /** Sub-seeds tried before this puzzle was accepted. */
  attempts: number;
}

/** The puzzle for a calendar date (YYYY-MM-DD, UTC). Pure and deterministic. */
export function generateDaily(date: string, hint?: number): DailyPuzzle {
  if (!isValidDate(date)) throw new RangeError(`Not a date: ${date}`);
  const tier = tierForDate(date);
  const made = generate(dailySeed(date), TIERS[tier], hint);
  return {
    date,
    number: dayNumber(date),
    tier,
    puzzle: made.puzzle,
    solution: made.solution,
    nodes: made.nodes,
    attempts: made.attempts,
  };
}
