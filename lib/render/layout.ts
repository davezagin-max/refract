/** Board geometry in CSS pixels. Pure, so hit testing can be unit tested. */
import { boardExtent, cellAtPoint, cellCenter, dirAngle, type Grid } from "@/lib/engine/hex";

const SQRT3 = Math.sqrt(3);

export interface Layout {
  /** Circumradius of one hexagon in pixels. */
  unit: number;
  /** Pixel position of the centre cell. */
  cx: number;
  cy: number;
  /** Distance between the centres of two neighbouring cells. */
  step: number;
}

/** Largest board that fits a box, centred, with a margin for the glow. */
export function fitBoard(radius: number, width: number, height: number, margin = 6): Layout {
  const extent = boardExtent(radius);
  const unit = Math.max(
    4,
    Math.min((width - margin * 2) / extent.width, (height - margin * 2) / extent.height),
  );
  return { unit, cx: width / 2, cy: height / 2, step: SQRT3 * unit };
}

export function cellPx(layout: Layout, grid: Grid, cell: number): { x: number; y: number } {
  const c = cellCenter(grid, cell);
  return { x: layout.cx + c.x * layout.unit, y: layout.cy + c.y * layout.unit };
}

/** The cell under a pixel, or -1 when the point is off the board. */
export function pointToCell(layout: Layout, grid: Grid, x: number, y: number): number {
  return cellAtPoint(grid, (x - layout.cx) / layout.unit, (y - layout.cy) / layout.unit);
}

/** A point `steps` cell-steps along a direction from a cell centre. */
export function alongPx(
  layout: Layout,
  grid: Grid,
  cell: number,
  dir: number,
  steps: number,
): { x: number; y: number } {
  const from = cellPx(layout, grid, cell);
  const angle = dirAngle(dir);
  return {
    x: from.x + Math.cos(angle) * layout.step * steps,
    y: from.y + Math.sin(angle) * layout.step * steps,
  };
}

/** Corner points of a flat-top hexagon. */
export function hexCorners(x: number, y: number, radius: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    points.push([x + radius * Math.cos(angle), y + radius * Math.sin(angle)]);
  }
  return points;
}
