/**
 * Which puzzle belongs to which day. Kept apart from the generator so the
 * page can ask "what tier is Thursday?" without downloading the generator
 * and solver, which only ever run in the worker.
 */
import { weekday } from "./daily";

/** Bump when a change would alter the puzzle generated for a given date. */
export const GENERATOR_VERSION = 1;

export type TierName = "easy" | "medium" | "hard" | "expert";

/** Like a crossword: gentle on Monday, hardest on Sunday (UTC). Indexed by weekday, Sunday first. */
const WEEK: readonly TierName[] = ["expert", "easy", "easy", "medium", "medium", "hard", "hard"];

export function tierForDate(date: string): TierName {
  return WEEK[weekday(date)];
}

export function dailySeed(date: string): string {
  return `refract/v${GENERATOR_VERSION}/${date}`;
}
