/**
 * Keeps the canvas at 60fps on devices that cannot draw it at full pixel
 * density. The renderer reports every frame interval; if more than one in
 * five recent frames was late, the backing store drops to the next lower
 * density (3x, 2x, 1.5x, 1x). Fewer pixels is the one saving that works everywhere: the
 * glow is soft, so the picture barely changes, and fill cost falls with the
 * square of the density.
 *
 * It only ever steps down. Stepping back up would invite a slow oscillation
 * on a device that sits near the limit.
 */

/** Pixel densities to fall back through, highest first. */
export const DENSITY_STEPS: readonly number[] = [3, 2, 1.5, 1];

const WINDOW = 90; // frames per decision: about a second and a half at 60fps
const LATE_MS = 22; // a frame this long has missed a 60Hz refresh
const TOO_MANY = 18; // one frame in five: below about 52fps on a 60Hz screen
const GAP_MS = 250; // longer than this is a hidden tab or a stall, not a slow draw

export class QualityGovernor {
  private cap: number;
  private frames = 0;
  private late = 0;

  constructor(cap: number = DENSITY_STEPS[0]) {
    this.cap = cap;
  }

  /** The highest density the renderer may use right now. */
  get limit(): number {
    return this.cap;
  }

  /**
   * Record one frame interval in milliseconds. `density` is what the canvas
   * is actually using (the screen may be coarser than the cap). Returns true
   * when the cap has just been lowered and the canvas should be resized.
   */
  sample(intervalMs: number, density: number): boolean {
    if (!(intervalMs > 0) || intervalMs > GAP_MS) return false;
    this.frames++;
    if (intervalMs > LATE_MS) this.late++;
    if (this.frames < WINDOW) return false;
    const struggling = this.late > TOO_MANY;
    this.frames = 0;
    this.late = 0;
    if (!struggling) return false;
    const lower = DENSITY_STEPS.find((step) => step < Math.min(density, this.cap) - 0.01);
    if (lower === undefined) return false;
    this.cap = lower;
    return true;
  }
}
