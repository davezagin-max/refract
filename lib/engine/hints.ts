/**
 * Precomputed generator shortcuts. For each day, the index of the first
 * sub-seed whose puzzle lands in the day's difficulty band. Trying that one
 * first skips the rejected attempts, which is most of the generation time on
 * hard days.
 *
 * The generator checks that the hinted attempt really is in band and runs the
 * full search if it is not, and days past the end of the table simply have no
 * hint. The table is tied to one generator version and is ignored for any
 * other, because an entry is only safe while it names the *first* accepted
 * attempt. A test compares hinted and unhinted generation day by day.
 *
 * Rebuild with `pnpm hints` after any change that bumps GENERATOR_VERSION.
 */
import { EPOCH, daysBetween, isValidDate } from "./daily";

/** The generator version the table was built for. */
export const HINTS_VERSION = 1;

/** One character per day from the epoch: 0-9, a-z, A-Z for attempts 0..61. */
export const HINTS =
  "0b27101012002020h1000134100002351011418010224000002170000a3200010760021341000140100001a500001220002610001116710002600121705010252500012e200101110001b22001011300011d101203200030063110266000025111021la1001104j001103i0100f18001251801105120000054000100i0000041004009000004b400000010028203100268000102510010a300000142000001i0010008000023i0010121000022201201120001e20000133500034690023234003001W00000180004";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function encodeHints(attempts: readonly number[]): string {
  return attempts.map((attempt) => DIGITS[attempt] ?? "?").join("");
}

/** The attempt index to try first for a date, if the table covers it. */
export function attemptHint(date: string, generatorVersion: number): number | undefined {
  if (generatorVersion !== HINTS_VERSION || !isValidDate(date)) return undefined;
  const index = DIGITS.indexOf(HINTS[daysBetween(EPOCH, date)] ?? "?");
  return index >= 0 ? index : undefined;
}
