#!/usr/bin/env node
/**
 * Captures README screenshots (and an optional demo GIF) with headless Chromium.
 *
 *   pnpm build && pnpm screenshots
 *
 * Reads screenshots.json:
 *   {
 *     "shots": [
 *       { "name": "hero", "path": "/", "viewport": "desktop",
 *         "actions": [{ "click": "text=Hint" }, { "waitFor": "canvas" }, { "wait": 400 }] }
 *     ],
 *     "gif": { "path": "/", "theme": "dark", "actions": [ ... ] }
 *   }
 * Actions: click, fill ([selector, text]), press, hover, waitFor (selector), wait (ms), scroll (px),
 * and solve: { "solve": 3, "pace": 600 } plays the first three pieces of the puzzle on screen
 * with the mouse (drag from the tray, then click to turn), pausing `pace` ms between steps.
 * The moves, clock and share grid in the pictures are therefore real play, not seeded state.
 * Output goes to docs/<name>.png and docs/demo.gif. The GIF needs ffmpeg on PATH.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const config = JSON.parse(readFileSync("screenshots.json", "utf8"));
const port = config.port ?? 3210;
const base = `http://localhost:${port}`;
const out = "docs";
mkdirSync(out, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

const server = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], {
  stdio: "ignore",
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stop);

for (let i = 0; ; i++) {
  try {
    await fetch(base);
    break;
  } catch {
    if (i > 80) throw new Error("Server did not start. Run `pnpm build` first.");
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Play the first `count` pieces of the day's solution, the way a player would with a mouse. */
async function solve(page, count, pace = 0) {
  const board = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("refract:v1:puzzle:"));
    const { puzzle, solution } = JSON.parse(localStorage.getItem(key));
    const R = puzzle.radius;
    const rect = document.querySelector("canvas").getBoundingClientRect();
    // The same fit the renderer uses (lib/render/layout.ts).
    const unit = Math.min((rect.width - 12) / (3 * R + 2), (rect.height - 12) / (Math.sqrt(3) * (2 * R + 1)));
    const cells = [];
    for (let q = -R; q <= R; q++) {
      for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
        cells.push({
          x: rect.left + rect.width / 2 + 1.5 * q * unit,
          y: rect.top + rect.height / 2 + Math.sqrt(3) * (r + q / 2) * unit,
        });
      }
    }
    return { solution, cells };
  });
  for (let i = 0; i < Math.min(count, board.solution.length); i++) {
    const piece = board.solution[i];
    const to = board.cells[piece.cell];
    const box = await page.locator(`button[aria-label^="Piece ${i + 1}:"]`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: pace ? 22 : 6 });
    if (pace) await page.waitForTimeout(pace / 3);
    await page.mouse.up();
    if (pace) await page.waitForTimeout(pace);
    for (let turn = 0; turn < piece.orient; turn++) {
      await page.mouse.click(to.x, to.y);
      if (pace) await page.waitForTimeout(pace / 2);
    }
    if (pace) await page.waitForTimeout(pace / 2);
  }
  // Park the pointer off the board so no hover state is in the picture.
  await page.mouse.move(4, 4);
}

async function perform(page, actions = []) {
  for (const action of actions) {
    if (action.solve) await solve(page, action.solve, action.pace);
    else if (action.click) await page.click(action.click);
    else if (action.fill) await page.fill(action.fill[0], action.fill[1]);
    else if (action.press) await page.keyboard.press(action.press);
    else if (action.hover) await page.hover(action.hover);
    else if (action.waitFor) await page.waitForSelector(action.waitFor, { timeout: 20_000 });
    else if (action.wait) await page.waitForTimeout(action.wait);
    else if (action.scroll) await page.mouse.wheel(0, action.scroll);
  }
}

async function open(browser, spec, extra = {}) {
  const viewport = VIEWPORTS[spec.viewport ?? "desktop"];
  // The app has one (dark) theme; this only sets what the browser reports as preferred.
  const theme = spec.theme ?? "dark";
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: spec.motion ? "no-preference" : "reduce",
    ...extra,
  });
  const page = await context.newPage();
  await page.goto(base + (spec.path ?? "/"), { waitUntil: "networkidle" });
  return { context, page, viewport };
}

const browser = await chromium.launch();
try {
  for (const shot of config.shots ?? []) {
    const { context, page } = await open(browser, shot);
    await perform(page, shot.actions);
    const file = path.join(out, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: Boolean(shot.fullPage) });
    await context.close();
    console.log(`wrote ${file}`);
  }

  if (config.gif) {
    const videoDir = path.join(out, ".video");
    const size = VIEWPORTS[config.gif.viewport ?? "desktop"];
    const { context, page } = await open(
      browser,
      { ...config.gif, motion: true },
      { deviceScaleFactor: 1, recordVideo: { dir: videoDir, size } },
    );
    await perform(page, config.gif.actions);
    await page.waitForTimeout(600);
    const video = await page.video().path();
    await context.close();
    const gif = path.join(out, "demo.gif");
    try {
      execFileSync(
        "ffmpeg",
        ["-y", "-i", video, "-vf", "fps=12,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", gif],
        { stdio: "ignore" },
      );
      console.log(`wrote ${gif}`);
    } catch {
      console.warn("ffmpeg not available: skipped docs/demo.gif (add it to the manual checklist).");
    }
    rmSync(videoDir, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  stop();
}
