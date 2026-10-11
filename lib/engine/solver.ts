/**
 * The solver: a depth-first search over where the tray pieces go and how they
 * are turned. It returns a solution, whether it is the only one, and how many
 * nodes the search expanded (the difficulty measure).
 *
 * A node traces the board, lists the unmet "needs", and branches on the cells
 * that could serve one of them. Two kinds of need:
 *
 *  - Missing: target T lacks channel c. In any solution c reaches T along some
 *    path, and the first new piece on that path sits on an empty cell that c
 *    already lights now (everything before it is unchanged). So the next
 *    piece to try must be on a cell lit by c from which T is still reachable
 *    with the pieces left. Reachability is a relaxed backward search from T
 *    that lets a future piece turn light any way at any open cell.
 *  - Unwanted: target T receives channel c it must not have. Every path that
 *    delivers it has to be broken, so a piece must go on an open cell
 *    upstream of T on those paths.
 *
 * The search branches on the need with the fewest candidate cells
 * (fail-first), trying every remaining piece kind in every distinct rotation
 * on each. What keeps the tree small:
 *
 *  1. Out of reach. A missing need with no candidate cell kills the node: the
 *     target needs more turns than there are pieces left.
 *  2. Wrong colour for good. Unwanted light with no open cell upstream to
 *     interrupt it kills the node. The trace also tracks "committed" beams
 *     (every cell behind them is decided) to catch this for a single path.
 *  3. Too many needs. Each need names a set of cells one of which must get a
 *     piece (for a missing channel: the cells with a clear run to the target,
 *     because the last new piece on the beam's path is on one of them). A
 *     solution needs a hitting set of those sets no larger than the number of
 *     pieces left. If none exists the node is dead; if one exists only with
 *     every piece used, all cells outside every such set are closed.
 *  4. Last piece. With one piece left it must fix the chosen need by itself,
 *     so only rotations that send the channel down a clear run to the target
 *     (or round a loop back to the same piece) are traced at all.
 *
 * No placement set is visited twice. After every piece and rotation has been
 * tried on a candidate cell, the cell is closed (declared empty) for its later
 * siblings, so each set of placements has exactly one path from the root and
 * no transposition table is needed. Identical tray pieces are interchangeable
 * (branch per kind, not per piece) and symmetric rotations are never tried
 * twice (see ORIENTATIONS).
 *
 * A node is one call of the search function, i.e. one board traced.
 *
 * What "unique" means. The search stops going deeper as soon as the targets
 * are lit, and it only reports boards on which every placed piece changes a
 * beam. So it finds the minimal solutions: sets of pieces that all matter and
 * contain no smaller solution. `unique` says there is exactly one of those.
 * If that solution leaves tray pieces over, the spares can sit anywhere
 * harmless, so the puzzle still has many finished boards; the level editor
 * reports that case separately. The daily generator only accepts a puzzle
 * whose one solution uses the whole tray, and then the claim is exact: any
 * winning board, stripped of idle pieces, contains a minimal solution, which
 * must be that full-tray one, so it is the same board.
 */
import {
  ACTION,
  ACTS,
  BLUE,
  EMITTER,
  EMPTY,
  ORIENTATIONS,
  PIECE_KINDS,
  RED,
  TARGET,
  WALL,
  codeKind,
  codeOrient,
  pieceCode,
} from "./optics";
import { baseContent, gridOf, type Placed, type Puzzle } from "./puzzle";

export interface SolveOptions {
  /** Give up after this many nodes. Always a node budget, never a time limit. */
  maxNodes?: number;
  /** Stop after finding this many solutions (2 is enough to decide uniqueness). */
  maxSolutions?: number;
  /**
   * "needs" (default) is the search described above. "naive" tries every
   * piece on every lit cell with no pruning; it exists to measure the gain.
   */
  strategy?: "needs" | "naive";
}

export interface SolveResult {
  status: "solved" | "unsolvable" | "gave-up";
  /** Solutions found, each a list of tray pieces with a cell and rotation. */
  solutions: Placed[][];
  /** True when the whole search finished and found exactly one solution. */
  unique: boolean;
  /** True when the whole search space was covered. */
  exhausted: boolean;
  nodes: number;
  /** Nodes cut off by each pruning rule. */
  pruned: { wrongColour: number; unreachable: number; tooMany: number };
}

export const DEFAULT_MAX_NODES = 200_000;

/** The cover test is exponential in the pieces left, so it runs near the leaves only. */
const MAX_COVER_DEPTH = 3;

export function solve(puzzle: Puzzle, options: SolveOptions = {}): SolveResult {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const maxSolutions = options.maxSolutions ?? 2;
  const naive = options.strategy === "naive";

  const grid = gridOf(puzzle);
  const { nbr, size } = grid;
  const content = baseContent(puzzle);
  /** 1 for empty cells this branch has ruled out. */
  const closed = new Uint8Array(size);
  const need = new Uint8Array(size);
  const targetCells = puzzle.targets.map((t) => t.cell);
  for (const t of puzzle.targets) need[t.cell] = t.color;

  const counts = [0, 0, 0];
  for (const kind of puzzle.tray) counts[PIECE_KINDS.indexOf(kind)]++;
  let remaining = puzzle.tray.length;
  const placedCells: number[] = [];
  const emitters = puzzle.emitters;

  // Scratch buffers, reused by every node.
  const light = new Uint8Array(size);
  const acted = new Uint8Array(size);
  /** Channels that have entered each (cell, direction) in the current trace. */
  const seenAny = new Uint8Array(size * 6);
  const seenCommitted = new Uint8Array(size * 6);
  const stack = new Int32Array(size * 6 * 3 * 2 * 3 * 4 + 64);

  /**
   * Trace the current board into `light`, `acted` and `seenAny`. Returns
   * false when a committed beam puts an unwanted channel into a target.
   */
  function scan(): boolean {
    light.fill(0);
    acted.fill(0);
    seenAny.fill(0);
    seenCommitted.fill(0);
    let top = 0;
    for (let i = emitters.length - 1; i >= 0; i--) {
      stack[top++] = emitters[i].cell;
      stack[top++] = emitters[i].dir;
      stack[top++] = emitters[i].color;
      stack[top++] = 1;
    }
    while (top > 0) {
      let committed = stack[--top];
      let color = stack[--top];
      const dir = stack[--top];
      let cur = stack[--top];
      for (;;) {
        const next = nbr[cur * 6 + dir];
        if (next < 0) break;
        const state = next * 6 + dir;
        // A committed beam must be followed even where an uncommitted one has
        // already been, because only it can prove a target permanently wrong.
        color &= committed ? ~seenCommitted[state] : ~seenAny[state];
        if (color === 0) break;
        seenAny[state] |= color;
        if (committed) seenCommitted[state] |= color;
        const code = content[next];
        if (code === WALL || code === EMITTER) break;
        light[next] |= color;
        if (code === EMPTY) {
          if (closed[next] === 0) committed = 0;
          cur = next;
          continue;
        }
        if (code === TARGET) {
          if (committed && !naive && (color & ~need[next]) !== 0) return false;
          cur = next;
          continue;
        }
        const index = (code * 6 + dir) * 8 + color;
        if (ACTS[index] === 0) {
          cur = next;
          continue;
        }
        acted[next] = 1;
        const base = index * 6;
        for (let i = 2; i >= 0; i--) {
          const outDir = ACTION[base + i * 2];
          if (outDir >= 0) {
            stack[top++] = next;
            stack[top++] = outDir;
            stack[top++] = ACTION[base + i * 2 + 1];
            stack[top++] = committed;
          }
        }
        break;
      }
    }
    return true;
  }

  // Buffers for the backward searches. A state (cell, d) reads "light arriving
  // at this cell travelling in direction d". Sized generously: a typed array
  // silently drops writes past its end, which would make the pruning unsound.
  const cost = new Int8Array(size * 6);
  const fanned = new Int8Array(size);
  const beyond = new Int8Array(size);
  const marked = new Uint8Array(size * 6);
  let frontier = new Int32Array(size * 6 * 16 + 64);
  let upcoming = new Int32Array(size * 6 * 16 + 64);
  const found = new Int16Array(size);
  /** Cells one of which must hold a piece for the need just analysed. */
  const cover = new Int16Array(size);
  let coverCount = 0;

  // Hitting-set bound. Each unmet need names a set of cells, one of which
  // must get a piece: for a missing channel, the cells with a clear run to the
  // target (the last new piece on the beam's path is on one of them); for an
  // unwanted channel, the cells where it can be intercepted. A solution needs
  // one cell from every set, with at most `remaining` cells in total.
  const MAX_NEEDS = 30;
  /** Bit n of hits[cell] is set when the cell is in need n's set. */
  const hits = new Int32Array(size);
  // Cells that serve the same needs are interchangeable for this test, so it
  // works on the distinct bitmasks (a handful) rather than on cells.
  const masks = new Int32Array(size);
  const maskOk = new Uint8Array(size);
  let maskCount = 0;

  /** Can at most k cells cover every need in the `unhit` bitmask? */
  function coverable(unhit: number, k: number): boolean {
    if (unhit === 0) return true;
    if (k === 0) return false;
    const lowest = unhit & -unhit;
    for (let i = 0; i < maskCount; i++) {
      const mask = masks[i];
      if ((mask & lowest) !== 0 && coverable(unhit & ~mask, k - 1)) return true;
    }
    return false;
  }

  /**
   * Candidate cells for a missing channel at a target: open cells the channel
   * lights now, from which the target can still be reached using at most
   * `remaining - 1` further pieces. Writes them to `found`, returns the count.
   *
   * Relaxation: a future piece may turn the beam any way its kind allows at
   * any open cell, and existing pieces act normally. A real solution's path
   * from its first new piece to the target is one such route, so no cell that
   * can start a real solution is ever left out.
   */
  function cellsForMissing(target: number, bit: number, budget: number): number {
    // Mirrors and splitters turn every channel; a prism turns all but red.
    // The fan is deliberately "any direction": a real beam may meet the same
    // new piece twice, and only an unconstrained turn lets the relaxed route
    // shortcut that loop while still counting the piece once.
    const canTurn = counts[0] + counts[1] > 0 || (counts[2] > 0 && bit !== RED);
    cost.fill(127);
    fanned.fill(127);
    beyond.fill(127);
    let count = 0;
    let nextCount = 0;
    for (let d = 0; d < 6; d++) {
      frontier[count++] = target;
      frontier[count++] = d;
    }
    for (let level = 0; level <= budget && count > 0; level++) {
      while (count > 0) {
        const dir = frontier[--count];
        const cell = frontier[--count];
        const state = cell * 6 + dir;
        if (cost[state] <= level) continue;
        cost[state] = level;
        // Where did light arriving here in this direction come from?
        const prev = nbr[cell * 6 + ((dir + 3) % 6)];
        if (prev < 0) continue;
        const code = content[prev];
        if (code === WALL || code === EMITTER) continue;
        if (code === EMPTY || code === TARGET) {
          frontier[count++] = prev;
          frontier[count++] = dir;
          if (code === EMPTY && closed[prev] === 0) {
            // A piece placed here could send the beam this way.
            if (beyond[prev] > level) beyond[prev] = level;
            if (canTurn && level < budget && fanned[prev] > level + 1) {
              fanned[prev] = level + 1;
              for (let d = 0; d < 6; d++) {
                upcoming[nextCount++] = prev;
                upcoming[nextCount++] = d;
              }
            }
          }
          continue;
        }
        // An existing piece: every incoming direction it would turn this way.
        for (let d = 0; d < 6; d++) {
          const base = ((code * 6 + d) * 8 + bit) * 6;
          if (ACTION[base] === dir || ACTION[base + 2] === dir || ACTION[base + 4] === dir) {
            frontier[count++] = prev;
            frontier[count++] = d;
          }
        }
      }
      const swap = frontier;
      frontier = upcoming;
      upcoming = swap;
      count = nextCount;
      nextCount = 0;
    }
    let n = 0;
    coverCount = 0;
    for (let cell = 0; cell < size; cell++) {
      if (beyond[cell] <= budget && (light[cell] & bit) !== 0) found[n++] = cell;
      // Level 0 is special: the last new piece on the path has to sit here.
      if (beyond[cell] === 0) cover[coverCount++] = cell;
    }
    return n;
  }

  // Fast path for the zero-turn case, which is asked far more often than the
  // general one: a plain backward ray walk with stamp-based visited marks.
  const walked = new Int32Array(size * 6);
  const counted = new Int32Array(size);
  let stamp = 0;

  /**
   * Zero-turn version of `cellsForMissing`: the open cells with a clear run
   * to the target (into `cover`) and those of them the channel lights now
   * (into `found`). Afterwards `walked[state] === stamp` marks every state
   * from which the channel reaches the target with no new piece.
   */
  function cellsInDirectReach(target: number, bit: number): number {
    stamp++;
    coverCount = 0;
    let n = 0;
    let count = 0;
    for (let d = 0; d < 6; d++) {
      frontier[count++] = target;
      frontier[count++] = d;
    }
    while (count > 0) {
      const dir = frontier[--count];
      let cell = frontier[--count];
      const back = (dir + 3) % 6;
      for (;;) {
        const state = cell * 6 + dir;
        if (walked[state] === stamp) break;
        walked[state] = stamp;
        const prev = nbr[cell * 6 + back];
        if (prev < 0) break;
        const code = content[prev];
        if (code === EMPTY) {
          if (closed[prev] === 0 && counted[prev] !== stamp) {
            counted[prev] = stamp;
            cover[coverCount++] = prev;
            if ((light[prev] & bit) !== 0) found[n++] = prev;
          }
          cell = prev;
          continue;
        }
        if (code === TARGET) {
          cell = prev;
          continue;
        }
        if (code === WALL || code === EMITTER) break;
        for (let d = 0; d < 6; d++) {
          const base = ((code * 6 + d) * 8 + bit) * 6;
          if (ACTION[base] === dir || ACTION[base + 2] === dir || ACTION[base + 4] === dir) {
            frontier[count++] = prev;
            frontier[count++] = d;
          }
        }
        break;
      }
    }
    return n;
  }

  /**
   * Candidate cells for an unwanted channel at a target: every open cell on a
   * path that currently delivers it. Walks the lit states backwards.
   */
  function cellsForUnwanted(target: number, bit: number): number {
    marked.fill(0);
    fanned.fill(0);
    let count = 0;
    for (let d = 0; d < 6; d++) {
      if (seenAny[target * 6 + d] & bit) {
        frontier[count++] = target;
        frontier[count++] = d;
      }
    }
    while (count > 0) {
      const dir = frontier[--count];
      const cell = frontier[--count];
      const state = cell * 6 + dir;
      if (marked[state]) continue;
      marked[state] = 1;
      const prev = nbr[cell * 6 + ((dir + 3) % 6)];
      if (prev < 0) continue;
      const code = content[prev];
      if (code === WALL || code === EMITTER) continue;
      if (code === EMPTY || code === TARGET) {
        if (code === EMPTY && closed[prev] === 0) fanned[prev] = 1;
        frontier[count++] = prev;
        frontier[count++] = dir;
        continue;
      }
      for (let d = 0; d < 6; d++) {
        if ((seenAny[prev * 6 + d] & bit) === 0) continue;
        const base = ((code * 6 + d) * 8 + bit) * 6;
        if (ACTION[base] === dir || ACTION[base + 2] === dir || ACTION[base + 4] === dir) {
          frontier[count++] = prev;
          frontier[count++] = d;
        }
      }
    }
    let n = 0;
    for (let cell = 0; cell < size; cell++) if (fanned[cell] === 1) found[n++] = cell;
    for (let i = 0; i < n; i++) cover[i] = found[i];
    coverCount = n;
    return n;
  }

  /** Baseline: every open cell with any light in it. */
  function cellsLit(): number {
    let n = 0;
    for (let cell = 0; cell < size; cell++) {
      if (light[cell] !== 0 && content[cell] === EMPTY && closed[cell] === 0) found[n++] = cell;
    }
    return n;
  }

  /**
   * Does this channel, leaving `cell` in direction `dir`, come back into
   * `cell` on the current board? (A piece placed there would be hit twice.)
   */
  function returnsTo(cell: number, dir: number, bit: number): boolean {
    marked.fill(0);
    let count = 0;
    frontier[count++] = cell;
    frontier[count++] = dir;
    while (count > 0) {
      const d = frontier[--count];
      let cur = frontier[--count];
      for (;;) {
        const next = nbr[cur * 6 + d];
        if (next < 0) break;
        if (next === cell) return true;
        const state = next * 6 + d;
        if (marked[state]) break;
        marked[state] = 1;
        const code = content[next];
        if (code === WALL || code === EMITTER) break;
        if (code === EMPTY || code === TARGET) {
          cur = next;
          continue;
        }
        const base = ((code * 6 + d) * 8 + bit) * 6;
        for (let i = 0; i < 3; i++) {
          const outDir = ACTION[base + i * 2];
          if (outDir < 0) break;
          frontier[count++] = next;
          frontier[count++] = outDir;
        }
        break;
      }
    }
    return false;
  }

  const solutions: Placed[][] = [];
  const pruned = { wrongColour: 0, unreachable: 0, tooMany: 0 };
  // One candidate list per search depth (depth is at most the tray size).
  const lists = Array.from({ length: puzzle.tray.length + 1 }, () => new Int16Array(size));
  const shuts = Array.from({ length: puzzle.tray.length + 1 }, () => new Int16Array(size));
  /** (cell, piece code) pairs to try with the last piece. */
  const lastMoves = new Int16Array(size * 18 * 2);
  let killerTarget = -1;
  let killerBit = 0;
  let nodes = 0;
  let stopped = false;
  let gaveUp = false;

  /** Place one piece, search below it, take it back. */
  function tryPiece(cell: number, k: number, code: number, depth: number): void {
    counts[k]--;
    remaining--;
    placedCells.push(cell);
    content[cell] = code;
    search(depth + 1);
    content[cell] = EMPTY;
    placedCells.pop();
    remaining++;
    counts[k]++;
  }

  function search(depth: number): void {
    if (nodes >= maxNodes) {
      gaveUp = true;
      stopped = true;
      return;
    }
    nodes++;
    if (!scan()) {
      pruned.wrongColour++;
      return;
    }
    let satisfied = true;
    for (const cell of targetCells) {
      if (light[cell] !== need[cell]) {
        satisfied = false;
        break;
      }
    }
    if (satisfied) {
      // A solution only counts when every piece on the board does something;
      // otherwise the same board without the idle piece is found elsewhere.
      for (const cell of placedCells) if (acted[cell] === 0) return;
      solutions.push(
        placedCells.map((cell) => ({
          cell,
          kind: codeKind(content[cell]),
          orient: codeOrient(content[cell]),
        })),
      );
      if (solutions.length >= maxSolutions) stopped = true;
      return;
    }
    if (remaining === 0) return;

    // Analyse every unmet need; branch on the one with the fewest candidate cells.
    const list = lists[depth];
    const shut = shuts[depth];
    let shutCount = 0;
    let best = -1;
    let bestTarget = -1;
    let bestBit = 0;
    let bestMissing = false;
    if (naive) {
      best = cellsLit();
      for (let i = 0; i < best; i++) list[i] = found[i];
    } else {
      // Most children of a node die for the same reason as their siblings,
      // so test the need that killed the last dead node before anything else.
      const budget = remaining - 1;
      if (killerTarget >= 0) {
        const lit = light[killerTarget];
        const wanted = need[killerTarget];
        if ((wanted & killerBit) !== 0 && (lit & killerBit) === 0) {
          const n =
            budget === 0
              ? cellsInDirectReach(killerTarget, killerBit)
              : cellsForMissing(killerTarget, killerBit, budget);
          if (n === 0) {
            pruned.unreachable++;
            return;
          }
        } else if ((wanted & killerBit) === 0 && (lit & killerBit) !== 0) {
          if (cellsForUnwanted(killerTarget, killerBit) === 0) {
            pruned.wrongColour++;
            return;
          }
        }
      }
      // The full reachability search is the expensive part, so each missing
      // need first gets the cheap zero-turn version. If that already finds a
      // lit cell the need is alive and its exact candidates can wait; only a
      // need that is out of direct reach pays for the full search.
      let needs = 0;
      let exact = false; // is `list` the complete candidate set for the best need?
      let shallow = -1;
      let shallowTarget = -1;
      let shallowBit = 0;
      hits.fill(0);
      for (const target of targetCells) {
        const lit = light[target];
        const wanted = need[target];
        if (lit === wanted) continue;
        for (let bit = RED; bit <= BLUE; bit <<= 1) {
          const missing = (wanted & bit) !== 0 && (lit & bit) === 0;
          const unwanted = (wanted & bit) === 0 && (lit & bit) !== 0;
          if (!missing && !unwanted) continue;
          let n = missing ? cellsInDirectReach(target, bit) : cellsForUnwanted(target, bit);
          if (needs < MAX_NEEDS) {
            for (let i = 0; i < coverCount; i++) hits[cover[i]] |= 1 << needs;
            needs++;
          }
          if (missing && n > 0 && budget > 0) {
            if (shallow < 0 || n < shallow) {
              shallow = n;
              shallowTarget = target;
              shallowBit = bit;
            }
            continue;
          }
          if (missing && n === 0 && budget > 0) n = cellsForMissing(target, bit, budget);
          if (n === 0) {
            if (missing) pruned.unreachable++;
            else pruned.wrongColour++;
            killerTarget = target;
            killerBit = bit;
            return;
          }
          if (best < 0 || n < best) {
            best = n;
            bestTarget = target;
            bestBit = bit;
            bestMissing = missing;
            exact = true;
            for (let i = 0; i < n; i++) list[i] = found[i];
          }
        }
      }
      if (!exact) {
        // Every unmet need is within direct reach: branch on the tightest.
        best = cellsForMissing(shallowTarget, shallowBit, budget);
        bestTarget = shallowTarget;
        bestBit = shallowBit;
        bestMissing = true;
        for (let i = 0; i < best; i++) list[i] = found[i];
      }
      if (remaining <= MAX_COVER_DEPTH) {
        const all = (1 << needs) - 1;
        maskCount = 0;
        for (let cell = 0; cell < size; cell++) {
          const mask = hits[cell];
          if (mask === 0) continue;
          let known = false;
          for (let i = 0; i < maskCount && !known; i++) known = masks[i] === mask;
          if (!known) masks[maskCount++] = mask;
        }
        if (!coverable(all, remaining - 1)) {
          let open = 0;
          for (let i = 0; i < maskCount; i++) {
            maskOk[i] = coverable(all & ~masks[i], remaining - 1) ? 1 : 0;
          }
          for (let cell = 0; cell < size; cell++) {
            if (content[cell] !== EMPTY || closed[cell] !== 0) continue;
            let ok = false;
            const mask = hits[cell];
            if (mask !== 0) {
              for (let i = 0; i < maskCount; i++) {
                if (masks[i] === mask) {
                  ok = maskOk[i] === 1;
                  break;
                }
              }
            }
            if (ok) open++;
            else shut[shutCount++] = cell;
          }
          if (open === 0) {
            pruned.tooMany++;
            return;
          }
          for (let i = 0; i < shutCount; i++) closed[shut[i]] = 1;
          let kept = 0;
          for (let i = 0; i < best; i++) if (closed[list[i]] === 0) list[kept++] = list[i];
          best = kept;
        }
      }
    }

    if (remaining === 1 && !naive) {
      // Last piece: it must fix the chosen need by itself, so only rotations
      // that actually do so are worth a trace. Collect them first, because
      // tracing a child overwrites the buffers read here.
      let moves = 0;
      if (bestMissing) cellsInDirectReach(bestTarget, bestBit); // refill `walked` for this need
      for (let i = 0; i < best; i++) {
        const cell = list[i];
        let direct = 0; // directions out of this cell with a clear run to the target
        if (bestMissing) {
          for (let d = 0; d < 6; d++) {
            const next = nbr[cell * 6 + d];
            if (next >= 0 && walked[next * 6 + d] === stamp) direct |= 1 << d;
          }
        }
        let loops = 0; // directions known to come back to this cell
        let loopsKnown = 0;
        for (let k = 0; k < 3; k++) {
          if (counts[k] === 0) continue;
          const kind = PIECE_KINDS[k];
          for (let orient = 0; orient < ORIENTATIONS[kind]; orient++) {
            const code = pieceCode(kind, orient);
            let useful = false;
            for (let d = 0; d < 6 && !useful; d++) {
              if ((seenAny[cell * 6 + d] & bestBit) === 0) continue;
              const index = (code * 6 + d) * 8 + bestBit;
              if (ACTS[index] === 0) continue;
              if (!bestMissing) {
                // Unwanted light: any piece that diverts it here might do.
                useful = true;
                break;
              }
              for (let j = 0; j < 3; j++) {
                const out = ACTION[index * 6 + j * 2];
                if (out < 0) break;
                if (out === d) continue;
                if ((direct >> out) & 1) {
                  useful = true;
                  break;
                }
                // Or the beam loops round and meets this piece a second time.
                if (((loopsKnown >> out) & 1) === 0) {
                  loopsKnown |= 1 << out;
                  if (returnsTo(cell, out, bestBit)) loops |= 1 << out;
                }
                if ((loops >> out) & 1) {
                  useful = true;
                  break;
                }
              }
            }
            if (useful) {
              lastMoves[moves++] = cell;
              lastMoves[moves++] = code;
            }
          }
        }
      }
      for (let i = 0; i < moves && !stopped; i += 2) {
        const code = lastMoves[i + 1];
        tryPiece(lastMoves[i], PIECE_KINDS.indexOf(codeKind(code)), code, depth);
      }
      for (let i = 0; i < shutCount; i++) closed[shut[i]] = 0;
      return;
    }

    for (let i = 0; i < best && !stopped; i++) {
      const cell = list[i];
      for (let k = 0; k < 3 && !stopped; k++) {
        if (counts[k] === 0) continue;
        const kind = PIECE_KINDS[k];
        for (let orient = 0; orient < ORIENTATIONS[kind] && !stopped; orient++) {
          tryPiece(cell, k, pieceCode(kind, orient), depth);
        }
      }
      // Later siblings must not put a piece here: that board was just covered.
      closed[cell] = 1;
    }
    for (let i = 0; i < best; i++) closed[list[i]] = 0;
    for (let i = 0; i < shutCount; i++) closed[shut[i]] = 0;
  }

  search(0);

  const exhausted = !stopped;
  return {
    status: solutions.length > 0 ? "solved" : gaveUp ? "gave-up" : "unsolvable",
    solutions,
    unique: exhausted && solutions.length === 1,
    exhausted,
    nodes,
    pruned,
  };
}
