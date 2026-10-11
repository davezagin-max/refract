/** Calendar helpers. The daily puzzle changes at midnight UTC for everyone. */

/** Day 1 of the daily series. */
export const EPOCH = "2026-10-01";

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Milliseconds at UTC midnight for a YYYY-MM-DD string, or NaN when invalid. */
export function dateToMs(date: string): number {
  const match = DATE_RE.exec(date);
  if (!match) return NaN;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  // Reject dates that roll over, like 2026-02-31.
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return NaN;
  return ms;
}

export function isValidDate(date: string): boolean {
  return !Number.isNaN(dateToMs(date));
}

export function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in UTC as YYYY-MM-DD. */
export function utcToday(now: Date | number = Date.now()): string {
  return msToDate(typeof now === "number" ? now : now.getTime());
}

export function addDays(date: string, days: number): string {
  return msToDate(dateToMs(date) + days * DAY_MS);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateToMs(b) - dateToMs(a)) / DAY_MS);
}

/** Puzzle number: 1 on the epoch date. */
export function dayNumber(date: string): number {
  return daysBetween(EPOCH, date) + 1;
}

/** 0 = Sunday .. 6 = Saturday, in UTC. */
export function weekday(date: string): number {
  return new Date(dateToMs(date)).getUTCDay();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sun 11 Oct" (UTC). */
export function shortDate(date: string): string {
  const d = new Date(dateToMs(date));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A date is playable when it is valid, on or after the epoch, and not in the future. */
export function isPlayable(date: string, today: string): boolean {
  return isValidDate(date) && date >= EPOCH && date <= today;
}
