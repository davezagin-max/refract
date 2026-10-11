/** Colours shared by the canvas renderer and the SVG piece icons. */
import type { Color } from "@/lib/engine/optics";

type Rgb = readonly [number, number, number];

/** Beam colour for each channel mask (index 0 is "no light"). */
export const LIGHT_RGB: readonly Rgb[] = [
  [0, 0, 0],
  [255, 72, 104], // red
  [56, 255, 150], // green
  [255, 226, 74], // yellow = red + green
  [78, 140, 255], // blue
  [255, 92, 250], // magenta = red + blue
  [72, 240, 255], // cyan = green + blue
  [255, 255, 255], // white
];

/** Halo tint: white light gets a cool cast so its glow does not read as fog. */
export const GLOW_RGB: readonly Rgb[] = LIGHT_RGB.map((rgb, i) =>
  i === 7 ? ([176, 208, 255] as const) : rgb,
);

/** One-letter label drawn inside each target, so colour is never the only cue. */
export const COLOR_LETTERS: readonly string[] = ["", "R", "G", "Y", "B", "M", "C", "W"];

export function rgba(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

export function lightCss(color: Color, alpha = 1): string {
  return rgba(LIGHT_RGB[color & 7], alpha);
}

/** A colour pushed toward white, for the hot core of a beam. */
export function coreCss(color: Color, alpha = 1): string {
  const [r, g, b] = LIGHT_RGB[color & 7];
  const mix = (v: number) => Math.round(v + (255 - v) * 0.62);
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${alpha})`;
}

export const BOARD = {
  cell: "#0b1231",
  cellEdge: "#1d2a5e",
  cellLit: "#101a45",
  wall: "#1b2552",
  wallEdge: "#3a4b8c",
  wallHatch: "rgba(120, 145, 230, 0.16)",
  backing: "#050816",
  plate: "rgba(120, 150, 255, 0.10)",
  plateEdge: "rgba(150, 180, 255, 0.55)",
  mirror: "#d5e0ff",
  mirrorFixed: "#8e9dcc",
  bolt: "#5c6aa3",
  splitter: "#8ef0ff",
  splitterFixed: "#6fb4c9",
  prism: "#e6eeff",
  prismFill: "rgba(190, 215, 255, 0.16)",
  accent: "#5ee6ff",
  danger: "#ff7189",
  gold: "#ffd166",
  socket: "#070c20",
} as const;
