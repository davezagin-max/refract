/**
 * The optics model. Every rule is a function on integers, so results are exact.
 *
 * Light is a set of colour channels (a 3-bit mask). A beam always travels
 * along one of the six hex directions, from cell centre to cell centre.
 *
 * Mirror, orientation m in 0..5: a two-sided line through the cell centre.
 *   Beam directions sit at 60° steps and the mirror line at 30° steps, so
 *   reflecting angle t across a line at angle p (t' = 2p - t) reduces to
 *       d' = (m - d) mod 6.
 *   - m even: the line lies along a hex axis. The two beams travelling along
 *     that axis hit it edge-on and pass (d' = d); the other four turn 120°.
 *   - m odd: the line is perpendicular to a hex axis. The two beams on that
 *     axis bounce straight back (d' = d + 3); the other four turn 60°.
 *
 * Splitter, orientation m in 0..5: half-silvered mirror. One copy passes
 *   straight on, one copy reflects by the mirror rule.
 *
 * Prism, orientation 0 or 1 (which way it bends): disperses by colour the way
 *   glass does, blue most. Red goes straight, green turns 60°, blue turns
 *   120°, all to the same side (left for orientation 0, right for 1).
 */
import { mod6 } from "./hex";

/** Bitmask of colour channels. */
export type Color = number;

export const RED = 1;
export const GREEN = 2;
export const BLUE = 4;
export const WHITE = 7;
export const CHANNELS: readonly Color[] = [RED, GREEN, BLUE];

export const COLOR_NAMES: readonly string[] = [
  "dark",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
];

export function colorName(color: Color): string {
  return COLOR_NAMES[color & 7];
}

export type PieceKind = "mirror" | "splitter" | "prism";
export const PIECE_KINDS: readonly PieceKind[] = ["mirror", "splitter", "prism"];

/**
 * Number of distinct orientations per kind. A mirror line looks the same
 * after a half turn, so its 12 thirty-degree rotations collapse to 6; a prism
 * only has a handedness. The solver never tries two equivalent orientations.
 */
export const ORIENTATIONS: Readonly<Record<PieceKind, number>> = {
  mirror: 6,
  splitter: 6,
  prism: 2,
};

/** Mirror reflection on hex directions. */
export function reflect(m: number, d: number): number {
  return mod6(m - d);
}

/** How many 60° steps a prism bends a single channel. */
export function prismBend(channel: Color): number {
  return channel === RED ? 0 : channel === GREEN ? 1 : 2;
}

/** Outgoing direction of one channel through a prism. */
export function refract(orient: number, d: number, channel: Color): number {
  const side = orient === 0 ? 1 : -1;
  return mod6(d + side * prismBend(channel));
}

/*
 * Compact cell contents for the fast tracer and the solver.
 *   0 empty, 1 wall, 2 emitter (absorbs), 3 target (transparent),
 *   4.. a piece: 4 + kindIndex * 6 + orientation.
 */
export const EMPTY = 0;
export const WALL = 1;
export const EMITTER = 2;
export const TARGET = 3;
export const PIECE_BASE = 4;
export const CODE_COUNT = PIECE_BASE + 18;

export function pieceCode(kind: PieceKind, orient: number): number {
  return PIECE_BASE + PIECE_KINDS.indexOf(kind) * 6 + orient;
}

export function codeKind(code: number): PieceKind {
  return PIECE_KINDS[Math.floor((code - PIECE_BASE) / 6)];
}

export function codeOrient(code: number): number {
  return (code - PIECE_BASE) % 6;
}

/** One outgoing beam: a direction and the channels that take it. */
export interface Out {
  dir: number;
  color: Color;
}

/** What a piece does to a beam of `color` arriving in direction `d`. */
export function interact(kind: PieceKind, orient: number, d: number, color: Color): Out[] {
  if (kind === "mirror") return [{ dir: reflect(orient, d), color }];
  if (kind === "splitter") {
    const turned = reflect(orient, d);
    return turned === d
      ? [{ dir: d, color }]
      : [
          { dir: d, color },
          { dir: turned, color },
        ];
  }
  const outs: Out[] = [];
  for (const channel of CHANNELS) {
    if (color & channel) outs.push({ dir: refract(orient, d, channel), color: channel });
  }
  return outs;
}

/** True when the piece changes the beam at all (it is not a plain pass-through). */
export function acts(kind: PieceKind, orient: number, d: number, color: Color): boolean {
  if (kind === "prism") return (color & (GREEN | BLUE)) !== 0;
  return reflect(orient, d) !== d;
}

/*
 * Lookup tables used by the hot loops. For piece code c, direction d and a
 * colour mask k (1..7) the outputs are stored as up to three (dir, mask)
 * pairs at ACTION[((c * 6 + d) * 8 + k) * 6 ...], terminated by dir = -1.
 */
export const ACTION = new Int8Array(CODE_COUNT * 6 * 8 * 6).fill(-1);
/** ACTS[(c * 6 + d) * 8 + k] is 1 when the piece changes that beam. */
export const ACTS = new Uint8Array(CODE_COUNT * 6 * 8);

for (const kind of PIECE_KINDS) {
  for (let orient = 0; orient < ORIENTATIONS[kind]; orient++) {
    const code = pieceCode(kind, orient);
    for (let d = 0; d < 6; d++) {
      for (let color = 1; color < 8; color++) {
        const base = ((code * 6 + d) * 8 + color) * 6;
        const outs = interact(kind, orient, d, color);
        outs.forEach((out, i) => {
          ACTION[base + i * 2] = out.dir;
          ACTION[base + i * 2 + 1] = out.color;
        });
        ACTS[(code * 6 + d) * 8 + color] = acts(kind, orient, d, color) ? 1 : 0;
      }
    }
  }
}
