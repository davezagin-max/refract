import { describe, expect, it } from "vitest";
import { DENSITY_STEPS, QualityGovernor } from "@/lib/render/quality";

/** Feed a run of identical frame intervals; report whether any of them lowered the cap. */
function run(governor: QualityGovernor, frames: number, intervalMs: number, density: number): boolean {
  let lowered = false;
  for (let i = 0; i < frames; i++) lowered = governor.sample(intervalMs, density) || lowered;
  return lowered;
}

describe("render quality governor", () => {
  it("leaves the density alone while frames arrive on time", () => {
    const governor = new QualityGovernor();
    expect(governor.limit).toBe(3);
    expect(run(governor, 600, 16.7, 3)).toBe(false);
    // A 120Hz screen and the odd late frame are fine too.
    expect(run(governor, 600, 8.3, 3)).toBe(false);
    for (let i = 0; i < 900; i++) governor.sample(i % 10 === 0 ? 34 : 16.7, 3);
    expect(governor.limit).toBe(3);
  });

  it("steps down one density at a time while frames keep arriving late", () => {
    const governor = new QualityGovernor();
    expect(run(governor, 89, 33, 3)).toBe(false); // not a full window yet
    expect(governor.sample(33, 3)).toBe(true);
    expect(governor.limit).toBe(2);
    expect(run(governor, 90, 33, 2)).toBe(true);
    expect(governor.limit).toBe(1.5);
    expect(run(governor, 90, 33, 1.5)).toBe(true);
    expect(governor.limit).toBe(1);
    // Nothing lower to fall back to.
    expect(run(governor, 500, 33, 1)).toBe(false);
    expect(governor.limit).toBe(1);
    expect(DENSITY_STEPS.at(-1)).toBe(1);
  });

  it("drops below what the screen is really using, not just below the cap", () => {
    // A 2x screen under a 3x cap: lowering the cap to 2 would change nothing.
    const governor = new QualityGovernor();
    expect(run(governor, 90, 40, 2)).toBe(true);
    expect(governor.limit).toBe(1.5);
    // A 1x screen cannot be helped this way, so nothing is reported.
    const coarse = new QualityGovernor();
    expect(run(coarse, 300, 40, 1)).toBe(false);
    expect(coarse.limit).toBe(3);
  });

  it("never steps back up, and ignores gaps from a hidden tab", () => {
    const governor = new QualityGovernor();
    run(governor, 90, 33, 3);
    expect(governor.limit).toBe(2);
    expect(run(governor, 2000, 16.7, 2)).toBe(false);
    expect(governor.limit).toBe(2);
    // Coming back from another tab produces one enormous interval, and the
    // first frame has none at all: neither counts as a slow frame.
    const fresh = new QualityGovernor();
    for (let i = 0; i < 400; i++) fresh.sample(i % 2 === 0 ? 5000 : 0, 3);
    expect(fresh.limit).toBe(3);
    expect(fresh.sample(Number.NaN, 3)).toBe(false);
  });
});
