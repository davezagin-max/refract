/**
 * Canvas 2D renderer for the board.
 *
 * What keeps it at 60fps on a phone:
 *  - the cells and walls are painted once into an offscreen canvas and blitted;
 *  - glow is layered strokes with additive blending, never `shadowBlur`: all
 *    runs of one colour go into a single path, so a frame is about five
 *    strokes per colour no matter how many segments there are;
 *  - point glows (beam heads, lit targets) are one cached radial sprite per
 *    colour, drawn with `drawImage`.
 *
 * The renderer owns the animation only. It is handed a scene (what is on the
 * board) and works out the light itself with the same `trace` the game uses.
 */
import { dirAngle, mirrorAngle, type Grid } from "@/lib/engine/hex";
import { pieceCode, type PieceKind } from "@/lib/engine/optics";
import { baseContent, gridOf, type Puzzle } from "@/lib/engine/puzzle";
import { traceContent, type Trace } from "@/lib/engine/trace";
import { planBeams, visibleLength, type BeamPlan, type FadingRun } from "./beams";
import { cellPx, fitBoard, pointToCell, type Layout } from "./layout";
import { BOARD, GLOW_RGB, LIGHT_RGB, coreCss, rgba } from "./palette";
import { drawEmitter, drawPiece, drawTarget, hexPath, type PieceStyle } from "./pieces";

export interface ScenePiece {
  /** Stable identity, so a rotation can be animated and a new piece can pop in. */
  key: string;
  cell: number;
  kind: PieceKind;
  orient: number;
  style: PieceStyle;
}

export interface Scene {
  /** Emitters, targets, walls and fixed pieces are drawn from here. */
  puzzle: Puzzle;
  /** Every other piece on the board, including one being previewed mid-drag. */
  pieces: readonly ScenePiece[];
  /** Keyboard cursor cell, or null to hide it. */
  cursor: number | null;
  /** Cell under a dragged piece, and whether it can be dropped there. */
  hover: { cell: number; ok: boolean } | null;
  solved: boolean;
}

export interface RendererHooks {
  /** A target has just lit up on screen (in step with the beam animation). */
  onTargetLit?: (lit: number, total: number) => void;
  onWinStart?: () => void;
  onWinEnd?: () => void;
}

/** Beam front speed, in cell steps per second. */
const SPEED = 42;
/** No change takes longer than this to draw, however long the path. */
const MAX_REVEAL_MS = 620;
const FADE_MS = 170;
const PULSE_MS = 560;
const POP_MS = 190;
const WIN_MS = 1250;
const MAX_DPR = 3;

interface Pose {
  pose: number;
  cell: number;
  born: number;
}

interface Glow {
  x: number;
  y: number;
  color: number;
  radius: number;
  alpha: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private backdrop: HTMLCanvasElement | null = null;
  private sprites: (HTMLCanvasElement | null)[] = [];
  private dpr = 1;
  private width = 0;
  private height = 0;
  private layout: Layout = { unit: 10, cx: 0, cy: 0, step: 17 };

  private scene: Scene | null = null;
  private grid: Grid | null = null;
  private boardKey = "";
  private lightKey = "";
  private trace: Trace | null = null;
  private plan: BeamPlan | null = null;
  /** How far the beam front has travelled; Infinity once everything is drawn. */
  private front = Infinity;
  private speed = SPEED;
  private paths: (Path2D | null)[] = [];
  private glows: Glow[] = [];
  private pathsStale = true;

  private fades: { runs: FadingRun[]; at: number }[] = [];
  private pulses: { cell: number; color: number; at: number }[] = [];
  private litShown = new Set<number>();
  private poses = new Map<string, Pose>();
  private intro = true;
  private winPending = false;
  private winAt = -1;
  private winEnded = true;

  private reduced = false;
  private raf = 0;
  private last = 0;
  private now = 0;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: RendererHooks = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    this.invalidate();
  }

  /** Match the canvas to its CSS box. Call on mount and whenever the box changes. */
  resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.relayout();
    // Draw now rather than on the next frame, so a resize never shows a blank canvas.
    this.draw(this.now, 0);
    this.invalidate();
  }

  setScene(scene: Scene): void {
    const previous = this.scene;
    this.scene = scene;
    const { puzzle } = scene;
    const grid = gridOf(puzzle);

    const boardKey = `${puzzle.radius}|${puzzle.walls.join(",")}`;
    if (boardKey !== this.boardKey || grid !== this.grid) {
      const radiusChanged = !this.grid || this.grid.radius !== grid.radius;
      this.grid = grid;
      this.boardKey = boardKey;
      if (radiusChanged) {
        // A different board: forget everything that was animating on the old one.
        this.plan = null;
        this.trace = null;
        this.fades = [];
        this.pulses = [];
        this.litShown.clear();
        this.poses.clear();
        this.intro = true;
      }
      this.relayout();
    }

    const lightKey =
      boardKey +
      JSON.stringify([puzzle.emitters, puzzle.fixed]) +
      scene.pieces.map((p) => `${p.cell}:${p.kind}:${p.orient}`).join("|");
    if (lightKey !== this.lightKey || !this.trace) {
      this.lightKey = lightKey;
      const content = baseContent(puzzle);
      for (const piece of scene.pieces) content[piece.cell] = pieceCode(piece.kind, piece.orient);
      const trace = traceContent(grid, content, puzzle.emitters);
      const plan = planBeams(this.plan, this.front, trace, grid);
      this.trace = trace;
      this.plan = plan;
      this.pathsStale = true;
      if (plan.fading.length > 0 && !this.reduced) {
        this.fades.push({ runs: plan.fading, at: this.now });
      }
      if (plan.start <= plan.end && !this.reduced) {
        this.front = plan.start;
        this.speed = Math.max(SPEED, (plan.end - plan.start) / (MAX_REVEAL_MS / 1000));
      } else {
        this.front = Infinity;
      }
    }

    const live = new Set(scene.pieces.map((p) => p.key));
    for (const fixed of puzzle.fixed) live.add(`f${fixed.cell}`);
    for (const key of this.poses.keys()) if (!live.has(key)) this.poses.delete(key);

    if (scene.solved && previous && !previous.solved && previous.puzzle === puzzle) {
      this.winPending = true;
    }
    if (!scene.solved) {
      this.winPending = false;
      this.winAt = -1;
      this.winEnded = true;
    }
    this.invalidate();
  }

  /** The cell under a viewport point, or -1 when it is off the board. */
  cellAt(clientX: number, clientY: number): number {
    if (!this.grid) return -1;
    const rect = this.canvas.getBoundingClientRect();
    return pointToCell(this.layout, this.grid, clientX - rect.left, clientY - rect.top);
  }

  /** Size of one cell on screen, for sizing the drag ghost. */
  get unit(): number {
    return this.layout.unit;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private invalidate(): void {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (time: number): void => {
    this.raf = 0;
    const dt = this.last === 0 ? 16 : Math.min(64, time - this.last);
    this.last = time;
    this.now = time;
    this.draw(time, dt);
    // With reduced motion nothing moves by itself, so one frame per change is enough.
    if (!this.reduced && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
    else this.last = 0;
  };

  private relayout(): void {
    if (!this.grid || this.width === 0) return;
    this.layout = fitBoard(this.grid.radius, this.width, this.height);
    this.buildBackdrop();
    this.buildSprites();
    this.pathsStale = true;
  }

  private buildBackdrop(): void {
    const { grid, layout, scene } = this;
    if (!grid || !scene) return;
    const canvas = this.backdrop ?? document.createElement("canvas");
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    const b = canvas.getContext("2d");
    if (!b) return;
    this.backdrop = canvas;
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    b.clearRect(0, 0, this.width, this.height);

    const u = layout.unit;
    // The haze has to fade out inside the canvas, or its edge shows as a rectangle.
    const reach = Math.min(this.width, this.height) / 2;
    const haze = b.createRadialGradient(layout.cx, layout.cy, u, layout.cx, layout.cy, reach);
    haze.addColorStop(0, "rgba(72, 104, 255, 0.2)");
    haze.addColorStop(0.7, "rgba(72, 104, 255, 0.07)");
    haze.addColorStop(1, "rgba(72, 104, 255, 0)");
    b.fillStyle = haze;
    b.fillRect(0, 0, this.width, this.height);

    const walls = new Set(scene.puzzle.walls);
    b.lineJoin = "round";
    for (let cell = 0; cell < grid.size; cell++) {
      const { x, y } = cellPx(layout, grid, cell);
      const wall = walls.has(cell);
      hexPath(b, x, y, u * 0.94);
      b.fillStyle = wall ? BOARD.wall : BOARD.cell;
      b.fill();
      if (wall) {
        b.save();
        b.clip();
        b.strokeStyle = BOARD.wallHatch;
        b.lineWidth = Math.max(1, u * 0.07);
        for (let k = -3; k <= 3; k++) {
          b.beginPath();
          b.moveTo(x - u + k * u * 0.36, y + u);
          b.lineTo(x + u + k * u * 0.36, y - u);
          b.stroke();
        }
        b.restore();
        hexPath(b, x, y, u * 0.94);
      }
      b.strokeStyle = wall ? BOARD.wallEdge : BOARD.cellEdge;
      b.lineWidth = wall ? Math.max(1.25, u * 0.05) : 1;
      b.stroke();
    }
  }

  private buildSprites(): void {
    const size = Math.max(32, Math.round(this.layout.unit * 2 * this.dpr));
    this.sprites = [null];
    for (let color = 1; color < 8; color++) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const s = canvas.getContext("2d");
      if (s) {
        const half = size / 2;
        const gradient = s.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, coreCss(color, 0.95));
        gradient.addColorStop(0.16, rgba(LIGHT_RGB[color], 0.6));
        gradient.addColorStop(0.5, rgba(GLOW_RGB[color], 0.14));
        gradient.addColorStop(1, rgba(GLOW_RGB[color], 0));
        s.fillStyle = gradient;
        s.fillRect(0, 0, size, size);
      }
      this.sprites.push(canvas);
    }
  }

  private glow(color: number, x: number, y: number, radius: number, alpha: number): void {
    const sprite = this.sprites[color];
    if (!sprite || alpha <= 0) return;
    this.ctx.globalAlpha = Math.min(1, alpha);
    this.ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    this.ctx.globalAlpha = 1;
  }

  /** Rebuild the per-colour beam paths for the current position of the front. */
  private buildPaths(): void {
    const { plan, grid, layout } = this;
    this.paths = [];
    this.glows = [];
    if (!plan || !grid) return;
    const u = layout.unit;
    for (const run of plan.runs) {
      const length = visibleLength(run, this.front);
      if (length <= 0) continue;
      const from = cellPx(layout, grid, run.from);
      const angle = dirAngle(run.dir);
      const x = from.x + Math.cos(angle) * layout.step * length;
      const y = from.y + Math.sin(angle) * layout.step * length;
      const path = (this.paths[run.color] ??= new Path2D());
      path.moveTo(from.x, from.y);
      path.lineTo(x, y);
      if (length < run.len) {
        this.glows.push({ x, y, color: run.color, radius: u * 0.62, alpha: 1 });
      } else if (run.end === "piece") {
        this.glows.push({ x, y, color: run.color, radius: u * 0.7, alpha: 0.5 });
      } else if (run.end === "blocked") {
        this.glows.push({ x, y, color: run.color, radius: u * 0.42, alpha: 0.85 });
      }
    }
  }

  private strokeBeams(paths: readonly (Path2D | null)[], strength: number, time: number): void {
    const { ctx } = this;
    const u = this.layout.unit;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let color = 1; color < 8; color++) {
      const path = paths[color];
      if (!path) continue;
      const glow = GLOW_RGB[color];
      ctx.strokeStyle = rgba(glow, 0.065 * strength);
      ctx.lineWidth = u * 0.62;
      ctx.stroke(path);
      ctx.strokeStyle = rgba(glow, 0.15 * strength);
      ctx.lineWidth = u * 0.3;
      ctx.stroke(path);
      ctx.strokeStyle = rgba(LIGHT_RGB[color], Math.min(1, 0.55 * strength));
      ctx.lineWidth = u * 0.13;
      ctx.stroke(path);
      ctx.strokeStyle = coreCss(color, Math.min(1, 0.95 * strength));
      ctx.lineWidth = u * 0.055;
      ctx.stroke(path);
      if (!this.reduced && time >= 0) {
        // Small bright dashes sliding outward: the light looks like it is flowing.
        ctx.setLineDash([u * 0.2, u * 1.5]);
        ctx.lineDashOffset = -(time / 1000) * u * 2.4;
        ctx.strokeStyle = `rgba(255,255,255,${0.42 * strength})`;
        ctx.lineWidth = u * 0.075;
        ctx.stroke(path);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }
    }
  }

  private draw(time: number, dt: number): void {
    const { ctx, scene, grid, layout, plan, trace } = this;
    if (!scene || !grid || !plan || !trace || !this.backdrop || this.width === 0) return;
    const u = layout.unit;
    const { puzzle } = scene;

    // Advance the beam front.
    if (this.front !== Infinity) {
      this.front = this.reduced ? Infinity : this.front + (this.speed * dt) / 1000;
      if (this.front >= plan.end) this.front = Infinity;
      this.pathsStale = true;
    }
    const settled = this.front === Infinity;
    if (this.pathsStale) {
      this.buildPaths();
      this.pathsStale = false;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.backdrop, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (scene.hover && scene.hover.cell >= 0) {
      const { x, y } = cellPx(layout, grid, scene.hover.cell);
      hexPath(ctx, x, y, u * 0.94);
      ctx.fillStyle = scene.hover.ok ? "rgba(94, 230, 255, 0.10)" : "rgba(255, 113, 137, 0.12)";
      ctx.fill();
      ctx.strokeStyle = scene.hover.ok ? BOARD.accent : BOARD.danger;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // The win sequence: light surges, then a ripple crosses the board ring by ring.
    if (this.winPending && settled) {
      this.winPending = false;
      this.winAt = time;
      this.winEnded = false;
      this.hooks.onWinStart?.();
    }
    const winAge = this.winAt >= 0 ? time - this.winAt : -1;
    if (!this.winEnded && (this.reduced || winAge >= WIN_MS)) {
      this.winEnded = true;
      this.hooks.onWinEnd?.();
    }
    let strength = 1;
    if (scene.solved) {
      strength = 1.12 + (this.reduced ? 0 : 0.06 * Math.sin(time / 520));
      if (winAge >= 0 && !this.reduced) strength += 0.7 * Math.exp(-winAge / 420);
    }

    ctx.globalCompositeOperation = "lighter";
    if (this.fades.length > 0) {
      this.fades = this.fades.filter((fade) => time - fade.at < FADE_MS);
      for (const fade of this.fades) {
        const paths: (Path2D | null)[] = [];
        for (const run of fade.runs) {
          const from = cellPx(layout, grid, run.from);
          const angle = dirAngle(run.dir);
          const cos = Math.cos(angle) * layout.step;
          const sin = Math.sin(angle) * layout.step;
          const path = (paths[run.color] ??= new Path2D());
          path.moveTo(from.x + cos * run.a, from.y + sin * run.a);
          path.lineTo(from.x + cos * run.b, from.y + sin * run.b);
        }
        this.strokeBeams(paths, 0.8 * (1 - (time - fade.at) / FADE_MS), -1);
      }
    }
    this.strokeBeams(this.paths, strength, time);
    const flicker = this.reduced ? 1 : 0.86 + 0.14 * Math.sin(time / 90);
    for (const g of this.glows) this.glow(g.color, g.x, g.y, g.radius, g.alpha * flicker);

    if (winAge >= 0 && winAge < WIN_MS && !this.reduced) {
      for (let cell = 0; cell < grid.size; cell++) {
        const t = (winAge - grid.ring[cell] * 95) / 460;
        if (t <= 0 || t >= 1) continue;
        const { x, y } = cellPx(layout, grid, cell);
        hexPath(ctx, x, y, u * 0.94);
        ctx.fillStyle = `rgba(170, 215, 255, ${0.26 * Math.sin(Math.PI * t)})`;
        ctx.fill();
      }
    }

    // Targets. One lights up when the beam front reaches it, not before.
    let litCount = 0;
    const breathe = this.reduced ? 0 : Math.sin(time / 420);
    for (const target of puzzle.targets) {
      const isLit = trace.light[target.cell] === target.color;
      const shown =
        isLit &&
        (this.litShown.has(target.cell) || settled || this.front >= plan.arrival[target.cell]);
      if (!isLit) this.litShown.delete(target.cell);
      if (shown) {
        litCount++;
        if (!this.litShown.has(target.cell)) {
          this.litShown.add(target.cell);
          if (!this.intro) {
            if (!this.reduced) this.pulses.push({ cell: target.cell, color: target.color, at: time });
            this.hooks.onTargetLit?.(litCount, puzzle.targets.length);
          }
        }
        const { x, y } = cellPx(layout, grid, target.cell);
        this.glow(target.color, x, y, u * (1.05 + 0.06 * breathe), 0.8);
      }
    }
    if (settled) this.intro = false;

    ctx.globalCompositeOperation = "source-over";
    for (const target of puzzle.targets) {
      const { x, y } = cellPx(layout, grid, target.cell);
      drawTarget(ctx, u, x, y, target.color, this.litShown.has(target.cell), breathe);
    }
    for (const emitter of puzzle.emitters) {
      const { x, y } = cellPx(layout, grid, emitter.cell);
      drawEmitter(ctx, u, x, y, emitter.dir, emitter.color);
    }
    const ease = this.reduced ? 1 : 1 - Math.exp(-dt / 55);
    for (const fixed of puzzle.fixed) {
      this.piece(`f${fixed.cell}`, fixed.cell, fixed.kind, fixed.orient, "fixed", time, ease);
    }
    for (const piece of scene.pieces) {
      this.piece(piece.key, piece.cell, piece.kind, piece.orient, piece.style, time, ease);
    }

    if (this.pulses.length > 0) {
      this.pulses = this.pulses.filter((pulse) => time - pulse.at < PULSE_MS);
      ctx.globalCompositeOperation = "lighter";
      for (const pulse of this.pulses) {
        const t = (time - pulse.at) / PULSE_MS;
        const { x, y } = cellPx(layout, grid, pulse.cell);
        ctx.beginPath();
        ctx.arc(x, y, u * (0.47 + 1.25 * (1 - (1 - t) * (1 - t))), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(LIGHT_RGB[pulse.color], 0.9 * (1 - t));
        ctx.lineWidth = u * 0.11 * (1 - t) + 1;
        ctx.stroke();
        this.glow(pulse.color, x, y, u * 1.7, 0.7 * (1 - t));
      }
      ctx.globalCompositeOperation = "source-over";
    }

    if (scene.cursor !== null && scene.cursor >= 0 && scene.cursor < grid.size) {
      const { x, y } = cellPx(layout, grid, scene.cursor);
      hexPath(ctx, x, y, u * 0.97);
      ctx.strokeStyle = "rgba(94, 230, 255, 0.28)";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = BOARD.accent;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  private piece(
    key: string,
    cell: number,
    kind: PieceKind,
    orient: number,
    style: PieceStyle,
    time: number,
    ease: number,
  ): void {
    const { grid, layout } = this;
    if (!grid) return;
    const target = kind === "prism" ? (orient === 0 ? 0 : Math.PI) : mirrorAngle(orient);
    let entry = this.poses.get(key);
    if (!entry) {
      // Pieces already there when the board first appears do not pop.
      entry = { pose: target, cell, born: this.intro || style === "fixed" ? -1e9 : time };
      this.poses.set(key, entry);
    } else if (entry.cell !== cell) {
      entry.cell = cell;
      entry.pose = target;
      entry.born = time;
    }
    // Turn the short way round. A bar looks the same after half a turn.
    const period = kind === "prism" ? Math.PI * 2 : Math.PI;
    let diff = (target - entry.pose) % period;
    if (diff > period / 2) diff -= period;
    if (diff < -period / 2) diff += period;
    if (Math.abs(diff) < 0.004) entry.pose = target;
    else entry.pose += diff * ease;

    let scale = 1;
    const age = time - entry.born;
    if (!this.reduced && age < POP_MS) {
      const t = age / POP_MS;
      scale = 1 + 0.22 * (1 - t) * (1 - t);
    }
    const { x, y } = cellPx(layout, grid, cell);
    if (style === "preview") this.ctx.globalAlpha = 0.72;
    drawPiece(this.ctx, layout.unit, x, y, kind, entry.pose, style, scale);
    this.ctx.globalAlpha = 1;
  }
}
