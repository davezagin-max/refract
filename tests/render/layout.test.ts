import { describe, expect, it } from "vitest";
import { boardExtent, makeGrid } from "@/lib/engine/hex";
import { alongPx, cellPx, fitBoard, hexCorners, pointToCell } from "@/lib/render/layout";

describe("board layout", () => {
  it("fits the board inside the box, centred, whichever side is the tight one", () => {
    for (const [width, height] of [
      [390, 480],
      [360, 320],
      [748, 700],
      [1200, 300],
    ]) {
      for (const radius of [2, 3, 4]) {
        const layout = fitBoard(radius, width, height);
        const extent = boardExtent(radius);
        expect(extent.width * layout.unit).toBeLessThanOrEqual(width - 12 + 1e-9);
        expect(extent.height * layout.unit).toBeLessThanOrEqual(height - 12 + 1e-9);
        // One of the two dimensions is used up.
        const slackX = width - 12 - extent.width * layout.unit;
        const slackY = height - 12 - extent.height * layout.unit;
        expect(Math.min(slackX, slackY)).toBeCloseTo(0, 6);
        expect(layout.cx).toBe(width / 2);
        expect(layout.cy).toBe(height / 2);
        expect(layout.step).toBeCloseTo(Math.sqrt(3) * layout.unit, 9);
      }
    }
  });

  it("maps every cell centre, and points near it, back to the same cell", () => {
    for (const radius of [1, 3, 4]) {
      const grid = makeGrid(radius);
      const layout = fitBoard(radius, 412, 915);
      for (let cell = 0; cell < grid.size; cell++) {
        const { x, y } = cellPx(layout, grid, cell);
        expect(pointToCell(layout, grid, x, y)).toBe(cell);
        // Anywhere well inside the hexagon (80% of the way to each corner) is still this cell.
        for (const [cx, cy] of hexCorners(x, y, layout.unit * 0.8)) {
          expect(pointToCell(layout, grid, cx, cy)).toBe(cell);
        }
      }
    }
  });

  it("reports -1 off the board", () => {
    const grid = makeGrid(3);
    const layout = fitBoard(3, 400, 440);
    expect(pointToCell(layout, grid, 2, 2)).toBe(-1); // a corner of the box
    expect(pointToCell(layout, grid, -50, 200)).toBe(-1);
    expect(pointToCell(layout, grid, 200, 5000)).toBe(-1);
  });

  it("puts one beam step exactly on the neighbouring cell's centre", () => {
    const grid = makeGrid(3);
    const layout = fitBoard(3, 640, 640);
    for (let cell = 0; cell < grid.size; cell++) {
      for (let dir = 0; dir < 6; dir++) {
        const next = grid.nbr[cell * 6 + dir];
        if (next < 0) continue;
        const stepped = alongPx(layout, grid, cell, dir, 1);
        const centre = cellPx(layout, grid, next);
        expect(stepped.x).toBeCloseTo(centre.x, 6);
        expect(stepped.y).toBeCloseTo(centre.y, 6);
      }
    }
  });
});
