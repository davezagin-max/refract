/** Loading a day's puzzle: from the cache when it is trustworthy, else from the worker. */
import { dayNumber } from "@/lib/engine/daily";
import { GENERATOR_VERSION, tierForDate, type DailyPuzzle } from "@/lib/engine/generator";
import { ORIENTATIONS } from "@/lib/engine/optics";
import { baseContent, targetsLit, validatePuzzle, type Placed } from "@/lib/engine/puzzle";
import { trace } from "@/lib/engine/trace";
import { requestDaily } from "./engine-client";
import { KEYS, load, save } from "./storage";

/**
 * Check a stored puzzle before using it. Storage can be edited or left over
 * from an older build, so the entry has to be a structurally valid puzzle for
 * this date whose stored solution really solves it.
 */
export function asDailyPuzzle(value: unknown, date: string): DailyPuzzle | null {
  if (typeof value !== "object" || value === null) return null;
  const d = value as Partial<DailyPuzzle>;
  if (d.date !== date || d.number !== dayNumber(date) || d.tier !== tierForDate(date)) return null;
  if (!Number.isInteger(d.nodes) || (d.nodes as number) < 1) return null;
  if (!Number.isInteger(d.attempts)) return null;
  if (validatePuzzle(d.puzzle).length > 0 || !d.puzzle) return null;
  const { puzzle, solution } = d;
  if (!Array.isArray(solution) || solution.length !== puzzle.tray.length) return null;
  const base = baseContent(puzzle);
  const used = new Set<number>();
  for (let i = 0; i < solution.length; i++) {
    const piece = solution[i] as Partial<Placed> | null;
    if (typeof piece !== "object" || piece === null || piece.kind !== puzzle.tray[i]) return null;
    const { cell, orient } = piece;
    if (!Number.isInteger(cell) || !Number.isInteger(orient)) return null;
    if ((cell as number) < 0 || (cell as number) >= base.length) return null;
    if (base[cell as number] !== 0 || used.has(cell as number)) return null;
    if ((orient as number) < 0 || (orient as number) >= ORIENTATIONS[piece.kind]) return null;
    used.add(cell as number);
  }
  if (!targetsLit(puzzle, trace(puzzle, solution as Placed[]).light)) return null;
  return d as DailyPuzzle;
}

export async function loadDaily(date: string): Promise<DailyPuzzle> {
  const key = KEYS.puzzle(date, GENERATOR_VERSION);
  const cached = asDailyPuzzle(load(key), date);
  if (cached) return cached;
  const { daily } = await requestDaily(date);
  save(key, daily);
  return daily;
}
