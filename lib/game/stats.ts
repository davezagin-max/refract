/** Results history and streaks. Pure functions over a plain record. */
import { addDays, isValidDate } from "@/lib/engine/daily";

export interface DayResult {
  moves: number;
  timeMs: number;
  hints: number;
  /** UTC date the puzzle was finished. Equal to its own date when played on the day. */
  solvedOn: string;
}

/** Results keyed by puzzle date (YYYY-MM-DD). */
export type History = Record<string, DayResult>;

/** Add a result. The first finish of a day stands; replays never overwrite it. */
export function recordResult(history: History, date: string, result: DayResult): History {
  if (history[date]) return history;
  return { ...history, [date]: result };
}

const onTheDay = (history: History, date: string) => history[date]?.solvedOn === date;

export interface Streaks {
  /** Consecutive days solved on the day, ending today (or yesterday, if today is still open). */
  current: number;
  best: number;
  /** All puzzles finished, including late ones from the archive. */
  solved: number;
}

export function streaks(history: History, today: string): Streaks {
  let current = 0;
  for (let day = onTheDay(history, today) ? today : addDays(today, -1); onTheDay(history, day); ) {
    current++;
    day = addDays(day, -1);
  }
  let best = 0;
  const days = Object.keys(history)
    .filter((date) => onTheDay(history, date))
    .sort();
  let run = 0;
  let previous = "";
  for (const day of days) {
    run = previous !== "" && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best: Math.max(best, current), solved: Object.keys(history).length };
}

/** Drop anything malformed from a stored history instead of trusting it. */
export function cleanHistory(value: unknown): History {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: History = {};
  for (const [date, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isValidDate(date) || typeof raw !== "object" || raw === null) continue;
    const r = raw as Partial<DayResult>;
    const whole = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
    if (!whole(r.moves) || !whole(r.hints)) continue;
    if (typeof r.timeMs !== "number" || !Number.isFinite(r.timeMs) || r.timeMs < 0) continue;
    if (typeof r.solvedOn !== "string" || !isValidDate(r.solvedOn)) continue;
    out[date] = { moves: r.moves, hints: r.hints, timeMs: r.timeMs, solvedOn: r.solvedOn };
  }
  return out;
}
