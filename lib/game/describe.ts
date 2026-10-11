/**
 * Text descriptions of the board for screen readers. The canvas is opaque to
 * assistive technology, so everything it shows is also available as words.
 */
import { DIR_NAMES, cellName, makeGrid } from "@/lib/engine/hex";
import { ORIENTATIONS, colorName } from "@/lib/engine/optics";
import { countLit, type Placement, type Puzzle } from "@/lib/engine/puzzle";

function targetState(wanted: number, light: number): string {
  if (light === wanted) return "lit";
  if (light === 0) return "dark";
  return `wrong colour, receiving ${colorName(light)}`;
}

function turn(kind: Puzzle["tray"][number], orient: number): string {
  if (kind === "prism") return orient === 0 ? "bending left" : "bending right";
  return `rotation ${orient + 1} of ${ORIENTATIONS[kind]}`;
}

/** What is on one cell, for the keyboard cursor. */
export function describeCell(
  puzzle: Puzzle,
  placements: readonly Placement[],
  light: Uint8Array,
  cell: number,
): string {
  const grid = makeGrid(puzzle.radius);
  const name = cellName(grid, cell);
  const emitter = puzzle.emitters.find((e) => e.cell === cell);
  if (emitter) {
    return `${name}: emitter, ${colorName(emitter.color)} light going ${DIR_NAMES[emitter.dir]}`;
  }
  const target = puzzle.targets.find((t) => t.cell === cell);
  if (target) {
    return `${name}: ${colorName(target.color)} target, ${targetState(target.color, light[cell])}`;
  }
  if (puzzle.walls.includes(cell)) return `${name}: wall`;
  const fixed = puzzle.fixed.find((piece) => piece.cell === cell);
  if (fixed) return `${name}: fixed ${fixed.kind}, ${turn(fixed.kind, fixed.orient)}`;
  const index = placements.findIndex((placement) => placement?.cell === cell);
  if (index >= 0) {
    const placement = placements[index] as { cell: number; orient: number };
    return `${name}: your ${puzzle.tray[index]}, ${turn(puzzle.tray[index], placement.orient)}`;
  }
  return `${name}: empty${light[cell] ? `, ${colorName(light[cell])} light passing` : ""}`;
}

/** The whole board as a short list of sentences. */
export function describeBoard(
  puzzle: Puzzle,
  placements: readonly Placement[],
  light: Uint8Array,
): string[] {
  const grid = makeGrid(puzzle.radius);
  const at = (cell: number) => cellName(grid, cell);
  const lines: string[] = [];
  const columns = 2 * puzzle.radius + 1;
  lines.push(
    `Hexagonal board, ${grid.size} cells in ${columns} columns A to ${String.fromCharCode(64 + columns)}, rows numbered from the top of each column.`,
  );
  for (const e of puzzle.emitters) {
    lines.push(`Emitter at ${at(e.cell)} sends ${colorName(e.color)} light ${DIR_NAMES[e.dir]}.`);
  }
  const lit = countLit(puzzle, light);
  lines.push(`${lit} of ${puzzle.targets.length} targets lit.`);
  for (const t of puzzle.targets) {
    lines.push(`Target at ${at(t.cell)} needs ${colorName(t.color)}: ${targetState(t.color, light[t.cell])}.`);
  }
  if (puzzle.walls.length > 0) lines.push(`Walls at ${puzzle.walls.map(at).join(", ")}.`);
  for (const piece of puzzle.fixed) {
    lines.push(`Fixed ${piece.kind} at ${at(piece.cell)}, ${turn(piece.kind, piece.orient)}.`);
  }
  puzzle.tray.forEach((kind, i) => {
    const placement = placements[i];
    lines.push(
      placement
        ? `Piece ${i + 1}, ${kind}, at ${at(placement.cell)}, ${turn(kind, placement.orient)}.`
        : `Piece ${i + 1}, ${kind}, in the tray.`,
    );
  });
  return lines;
}
