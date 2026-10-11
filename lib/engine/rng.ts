/**
 * Seeded pseudo-random numbers. Integer-only (Math.imul and shifts), so a
 * seed gives the same sequence in every JavaScript engine.
 */

/** FNV-1a hash of a string to an unsigned 32-bit seed. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final avalanche so similar strings ("…:1", "…:2") give unrelated seeds.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  /** Unsigned 32-bit integer. */
  u32(): number;
  /** Integer in 0..n-1. */
  int(n: number): number;
  /** Integer in lo..hi inclusive. */
  range(lo: number, hi: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
}

/** mulberry32: small, fast, and good enough for level generation. */
export function makeRng(seed: string | number): Rng {
  let state = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  const u32 = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  // Multiply-shift keeps the result an exact integer with no modulo bias worth caring about.
  const int = (n: number) => Math.floor((u32() / 4294967296) * n);
  return {
    u32,
    int,
    range: (lo, hi) => lo + int(hi - lo + 1),
    chance: (probability) => u32() / 4294967296 < probability,
    pick: (items) => items[int(items.length)],
    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const swap = items[i];
        items[i] = items[j];
        items[j] = swap;
      }
      return items;
    },
  };
}
