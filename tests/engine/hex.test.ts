import { describe, expect, it } from "vitest";
import {
  DIR_Q,
  DIR_R,
  boardExtent,
  cellAt,
  cellAtPoint,
  cellCenter,
  cellName,
  dirAngle,
  makeGrid,
  opposite,
} from "@/lib/engine/hex";

describe("hex grid", () => {
  it("has 3R(R+1)+1 cells", () => {
    expect(makeGrid(1).size).toBe(7);
    expect(makeGrid(2).size).toBe(19);
    expect(makeGrid(3).size).toBe(37);
    expect(makeGrid(4).size).toBe(61);
  });

  it("indexes every cell and round-trips coordinates", () => {
    const grid = makeGrid(3);
    for (let cell = 0; cell < grid.size; cell++) {
      expect(cellAt(grid, grid.q[cell], grid.r[cell])).toBe(cell);
    }
    expect(cellAt(grid, 4, 0)).toBe(-1);
    expect(cellAt(grid, 2, 2)).toBe(-1);
    expect(cellAt(grid, -3, -1)).toBe(-1);
  });

  it("links neighbours symmetrically and marks the edge with -1", () => {
    const grid = makeGrid(3);
    let offBoard = 0;
    for (let cell = 0; cell < grid.size; cell++) {
      for (let d = 0; d < 6; d++) {
        const n = grid.nbr[cell * 6 + d];
        if (n < 0) {
          offBoard++;
          continue;
        }
        expect(grid.q[n] - grid.q[cell]).toBe(DIR_Q[d]);
        expect(grid.r[n] - grid.r[cell]).toBe(DIR_R[d]);
        expect(grid.nbr[n * 6 + opposite(d)]).toBe(cell);
      }
    }
    // A hexagon of radius R has 6(2R+1) outward-facing edges.
    expect(offBoard).toBe(6 * (2 * 3 + 1));
  });

  it("names cells by column letter and row from the top", () => {
    const grid = makeGrid(3);
    expect(cellName(grid, cellAt(grid, 0, 0))).toBe("D4");
    expect(cellName(grid, cellAt(grid, -3, 0))).toBe("A1");
    expect(cellName(grid, cellAt(grid, -3, 3))).toBe("A4");
    expect(cellName(grid, cellAt(grid, 0, -3))).toBe("D1");
    expect(cellName(grid, cellAt(grid, 3, 0))).toBe("G4");
    const names = new Set(Array.from({ length: grid.size }, (_, c) => cellName(grid, c)));
    expect(names.size).toBe(grid.size);
  });

  it("lays neighbours out at the angle the beam is drawn at", () => {
    const grid = makeGrid(2);
    const centre = cellAt(grid, 0, 0);
    const origin = cellCenter(grid, centre);
    for (let d = 0; d < 6; d++) {
      const p = cellCenter(grid, grid.nbr[centre * 6 + d]);
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      expect(Math.hypot(dx, dy)).toBeCloseTo(Math.sqrt(3), 10);
      expect(Math.cos(dirAngle(d))).toBeCloseTo(dx / Math.sqrt(3), 10);
      expect(Math.sin(dirAngle(d))).toBeCloseTo(dy / Math.sqrt(3), 10);
    }
  });

  it("maps points back to cells", () => {
    const grid = makeGrid(3);
    for (let cell = 0; cell < grid.size; cell++) {
      const { x, y } = cellCenter(grid, cell);
      expect(cellAtPoint(grid, x, y)).toBe(cell);
      expect(cellAtPoint(grid, x + 0.4, y - 0.3)).toBe(cell);
    }
    const extent = boardExtent(3);
    expect(cellAtPoint(grid, extent.width, extent.height)).toBe(-1);
  });
});
