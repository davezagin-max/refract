/** Canvas drawing for everything that sits on a cell. All sizes scale with `u`. */
import { dirAngle } from "@/lib/engine/hex";
import type { Color, PieceKind } from "@/lib/engine/optics";
import { hexCorners } from "./layout";
import { BOARD, COLOR_LETTERS, lightCss } from "./palette";

type Ctx = CanvasRenderingContext2D;

export type PieceStyle = "fixed" | "movable" | "locked" | "preview";

export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function hexPath(ctx: Ctx, x: number, y: number, radius: number): void {
  const corners = hexCorners(x, y, radius);
  ctx.beginPath();
  ctx.moveTo(corners[0][0], corners[0][1]);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
  ctx.closePath();
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** The straight bar of a mirror (solid) or splitter (dashed, half-silvered). */
function drawBar(ctx: Ctx, u: number, angle: number, kind: "mirror" | "splitter", fixed: boolean): void {
  const half = u * 0.66;
  const dx = Math.cos(angle) * half;
  const dy = Math.sin(angle) * half;
  ctx.lineCap = "round";
  ctx.strokeStyle = BOARD.backing;
  ctx.lineWidth = u * 0.25;
  line(ctx, -dx, -dy, dx, dy);
  if (kind === "mirror") {
    ctx.strokeStyle = fixed ? BOARD.mirrorFixed : BOARD.mirror;
    ctx.lineWidth = u * 0.125;
    line(ctx, -dx, -dy, dx, dy);
    ctx.strokeStyle = fixed ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.95)";
    ctx.lineWidth = u * 0.035;
    line(ctx, -dx * 0.82, -dy * 0.82, dx * 0.82, dy * 0.82);
  } else {
    ctx.lineCap = "butt";
    ctx.setLineDash([u * 0.19, u * 0.13]);
    ctx.strokeStyle = fixed ? BOARD.splitterFixed : BOARD.splitter;
    ctx.lineWidth = u * 0.125;
    line(ctx, -dx, -dy, dx, dy);
    ctx.setLineDash([]);
  }
  if (fixed) {
    // Bolts at both ends: this one is part of the board.
    ctx.fillStyle = BOARD.bolt;
    ctx.strokeStyle = BOARD.backing;
    ctx.lineWidth = u * 0.03;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(dx * sign, dy * sign, u * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** A glass triangle. `turn` is 0 for a left-bending prism and PI for a right-bending one. */
function drawPrism(ctx: Ctx, u: number, turn: number, fixed: boolean): void {
  const radius = u * 0.58;
  ctx.save();
  ctx.rotate(turn);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.strokeStyle = BOARD.backing;
  ctx.lineWidth = u * 0.17;
  ctx.stroke();
  ctx.fillStyle = BOARD.socket;
  ctx.fill();
  ctx.fillStyle = BOARD.prismFill;
  ctx.fill();
  ctx.strokeStyle = fixed ? BOARD.mirrorFixed : BOARD.prism;
  ctx.lineWidth = u * 0.06;
  ctx.stroke();
  ctx.restore();

  // Which way it bends: a curved arrow, counter-clockwise for a left bend.
  const left = Math.cos(turn) > 0;
  const r = u * 0.17;
  const start = left ? Math.PI * 0.15 : Math.PI * 0.85;
  const end = left ? Math.PI * 0.15 - Math.PI * 1.45 : Math.PI * 0.85 + Math.PI * 1.45;
  ctx.lineCap = "round";
  ctx.strokeStyle = fixed ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.92)";
  ctx.lineWidth = u * 0.045;
  ctx.beginPath();
  ctx.arc(0, 0, r, start, end, left);
  ctx.stroke();
  const tipX = Math.cos(end) * r;
  const tipY = Math.sin(end) * r;
  // Tangent at the end of the arc, in the direction of travel.
  const tangent = end + (left ? -Math.PI / 2 : Math.PI / 2);
  const head = u * 0.1;
  ctx.beginPath();
  ctx.moveTo(tipX + Math.cos(tangent - 2.5) * head, tipY + Math.sin(tangent - 2.5) * head);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX + Math.cos(tangent + 2.5) * head, tipY + Math.sin(tangent + 2.5) * head);
  ctx.stroke();
}

/**
 * Draw one piece centred on (x, y). `pose` is the bar's screen angle for a
 * mirror or splitter and the triangle's turn for a prism; the renderer eases
 * it so rotations are animated.
 */
export function drawPiece(
  ctx: Ctx,
  u: number,
  x: number,
  y: number,
  kind: PieceKind,
  pose: number,
  style: PieceStyle,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (scale !== 1) ctx.scale(scale, scale);
  if (style !== "fixed") {
    // A plate under the piece says "this one is yours to move".
    hexPath(ctx, 0, 0, u * 0.8);
    ctx.fillStyle = style === "locked" ? "rgba(255, 209, 102, 0.10)" : BOARD.plate;
    ctx.fill();
    ctx.lineWidth = Math.max(1, u * 0.04);
    ctx.strokeStyle = style === "locked" ? BOARD.gold : BOARD.plateEdge;
    if (style === "preview") ctx.setLineDash([u * 0.14, u * 0.1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (kind === "prism") drawPrism(ctx, u, pose, style === "fixed");
  else drawBar(ctx, u, pose, kind, style === "fixed");
  ctx.restore();
}

export function drawEmitter(ctx: Ctx, u: number, x: number, y: number, dir: number, color: Color): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dirAngle(dir));
  ctx.lineJoin = "round";
  ctx.fillStyle = "#121c47";
  ctx.strokeStyle = lightCss(color, 0.9);
  ctx.lineWidth = u * 0.05;
  ctx.beginPath();
  ctx.rect(u * 0.12, -u * 0.17, u * 0.52, u * 0.34);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, u * 0.43, 0, Math.PI * 2);
  ctx.fillStyle = "#0d1538";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, u * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = lightCss(color);
  ctx.fill();
  ctx.restore();
}

/** A target socket: hollow while it waits, filled once it has exactly its colour. */
export function drawTarget(
  ctx: Ctx,
  u: number,
  x: number,
  y: number,
  color: Color,
  lit: boolean,
  breathe: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, u * 0.47, 0, Math.PI * 2);
  ctx.fillStyle = BOARD.socket;
  ctx.fill();
  ctx.lineWidth = u * (lit ? 0.085 + 0.02 * breathe : 0.06);
  ctx.strokeStyle = lightCss(color, lit ? 1 : 0.8);
  ctx.stroke();
  if (lit) {
    ctx.beginPath();
    ctx.arc(x, y, u * 0.31, 0, Math.PI * 2);
    ctx.fillStyle = lightCss(color);
    ctx.fill();
  }
  ctx.font = `700 ${Math.round(u * 0.36)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = lit ? "#060a18" : lightCss(color, 0.95);
  ctx.fillText(COLOR_LETTERS[color & 7], x, y + u * 0.02);
}
