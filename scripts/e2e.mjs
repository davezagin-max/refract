#!/usr/bin/env node
/**
 * Browser-level check of the built app, driven the way a visitor would:
 * mouse, touch and keyboard, on a desktop and on two phone sizes.
 *
 *   pnpm build && pnpm e2e
 *
 * It starts `next start` on the screenshot port, plays real puzzles to a win
 * with each input method, reloads mid-game, opens every dialog, uses the
 * level editor, and fails on any console error or sideways page scroll.
 * Set E2E_SHOTS=<dir> to keep a PNG of each stage.
 *
 * The unit tests cover the rules; this covers the wiring between the page,
 * the canvas, the worker and storage, which they cannot see.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = JSON.parse(readFileSync("screenshots.json", "utf8")).port ?? 3260;
const base = `http://localhost:${port}`;
const shots = process.env.E2E_SHOTS ?? "";
if (shots) mkdirSync(shots, { recursive: true });

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

let checks = 0;
function ok(condition, what) {
  if (!condition) throw new Error(`FAILED: ${what}`);
  checks++;
}

const utcDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = utcDay();
/** Past days to play, so each flow starts on a board nobody has touched. */
const DAY_A = "2026-10-05"; // easy
const DAY_B = "2026-10-07"; // medium
const DAY_C = "2026-10-06"; // easy
/**
 * A level link the solver cannot finish inside its budget (a large board,
 * eight mirrors, five targets), for checking that a search can be stopped.
 */
const HEAVY_LEVEL =
  "WzQsW1swLDAsN11dLFtbMjYsN10sWzU2LDddLFs0LDddLFszNCw3XSxbNDgsN11dLFtdLFtdLFtbNywwLDBdLFsxNSwwLDBdLFsyNCwwLDBdLFszNiwwLDBdLFs0NSwwLDBdLFs1MywwLDBdLFs0MCwwLDBdLFsyMCwwLDBdXV0";

const browser = await chromium.launch();

async function session({ width, height, touch = false, motion = "reduce" }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: motion,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));
  page.on("requestfailed", (request) => problems.push(`request failed: ${request.url()}`));
  return { context, page, problems };
}

async function shot(page, name) {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

async function open(page, url) {
  await page.goto(base + url, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas");
}

/** The day's puzzle and solution, as the page cached them. */
async function cached(page, date) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), `refract:v1:puzzle:1:${date}`);
  ok(raw, `puzzle for ${date} is cached after load`);
  return JSON.parse(raw);
}

/** Viewport position of every cell centre, from the same layout rule the renderer uses. */
async function centres(page, radius) {
  return page.evaluate((R) => {
    const rect = document.querySelector("canvas").getBoundingClientRect();
    const unit = Math.max(
      4,
      Math.min((rect.width - 12) / (3 * R + 2), (rect.height - 12) / (Math.sqrt(3) * (2 * R + 1))),
    );
    const cells = [];
    for (let q = -R; q <= R; q++) {
      for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
        cells.push({
          x: rect.left + rect.width / 2 + 1.5 * q * unit,
          y: rect.top + rect.height / 2 + Math.sqrt(3) * (r + q / 2) * unit,
          name: String.fromCharCode(65 + q + R) + (r - Math.max(-R, -q - R) + 1),
        });
      }
    }
    return { cells, unit, top: rect.top, bottom: rect.bottom };
  }, radius);
}

const stat = (page, label) => page.locator(`dt:text-is("${label}") + dd`).first().innerText();
const tray = (page, index) => page.locator(`button[aria-label^="Piece ${index + 1}:"]`);
const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function noSidewaysScroll(page, when) {
  ok((await overflow(page)) <= 0, `no horizontal page scroll ${when}`);
}

/** At least some beam is on the canvas (bright pixels), i.e. the renderer drew. */
async function canvasIsLit(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) bright++;
    }
    return bright > 40;
  });
}

async function expectSolved(page, total) {
  await page.waitForSelector("section[aria-label='Result']", { timeout: 8000 });
  ok((await stat(page, "Lit")) === `${total}/${total}`, "every target is lit");
}

try {
  // ---- 1. Desktop, mouse: first screen, drag, turn, undo, win, share, reload ----
  {
    const { context, page, problems } = await session({ width: 1280, height: 800, motion: "no-preference" });
    await open(page, "/");
    ok((await page.title()).startsWith("Refract"), "page title");
    ok((await page.locator("h1").innerText()).startsWith("Today #"), "the first screen is today's puzzle");
    ok(await page.locator("ol[aria-label='How to play']:visible").count(), "how-to strip is shown");
    await page.waitForTimeout(900);
    ok(await canvasIsLit(page), "the emitter's beam is drawn");
    await shot(page, "desktop-first");

    const { puzzle, solution } = await cached(page, TODAY);
    const total = puzzle.targets.length;
    let geo = await centres(page, puzzle.radius);

    // Opening the text description makes the side column taller; the board must not grow with it.
    await page.locator("summary:has-text('Board in words')").click();
    ok(await page.locator("details[open] li").count() > 4, "the board is described in words");
    const withWords = await centres(page, puzzle.radius);
    ok(Math.abs(withWords.unit - geo.unit) < 0.01, "the board keeps its size when the description opens");
    ok(withWords.bottom <= 800, "the whole board stays on screen");
    await page.locator("summary:has-text('Board in words')").click();
    geo = await centres(page, puzzle.radius);

    // Drag the first piece from the tray onto its cell.
    const first = solution[0];
    const box = await tray(page, 0).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const to = geo.cells[first.cell];
    await page.mouse.move(to.x - 60, to.y - 20, { steps: 8 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await shot(page, "desktop-dragging");
    await page.mouse.up();
    ok((await stat(page, "Moves")) === "1", "a drag from the tray is one move");
    ok((await page.locator("ol[aria-label='How to play']:visible").count()) === 0, "how-to strip went away");
    ok((await tray(page, 0).getAttribute("aria-label")).includes(`on the board at ${to.name}`), "tray shows where the piece is");

    // Turn it into place: a burst of turns is one move.
    for (let i = 0; i < first.orient; i++) await page.mouse.click(to.x, to.y);
    ok((await stat(page, "Moves")) === (first.orient > 0 ? "2" : "1"), "a burst of turns counts once");

    // Right-click turns back, then forward again.
    await page.mouse.click(to.x, to.y, { button: "right" });
    await page.mouse.click(to.x, to.y);

    // Undo everything, redo everything.
    const movesBefore = await stat(page, "Moves");
    while (await page.getByRole("button", { name: "Undo" }).isEnabled()) {
      await page.getByRole("button", { name: "Undo" }).click();
    }
    ok((await tray(page, 0).getAttribute("aria-label")).includes("in the tray"), "undo returns the piece");
    while (await page.getByRole("button", { name: "Redo" }).isEnabled()) {
      await page.getByRole("button", { name: "Redo" }).click();
    }
    ok((await stat(page, "Moves")) === movesBefore, "undo and redo do not change the move count");

    // Drag it off the board and back on (returns it to the tray, then replace).
    await page.mouse.move(to.x, to.y);
    await page.mouse.down();
    await page.mouse.move(to.x + 30, to.y + 30, { steps: 4 });
    await page.mouse.move(5, geo.bottom - 5, { steps: 6 });
    await page.mouse.up();
    ok((await tray(page, 0).getAttribute("aria-label")).includes("in the tray"), "dragging off the board returns the piece");

    // Tap-to-place the rest (and the first again): click the tray piece, then the cell.
    for (let i = 0; i < solution.length; i++) {
      const piece = solution[i];
      const at = geo.cells[piece.cell];
      await tray(page, i).click();
      await page.mouse.click(at.x, at.y);
      for (let k = 0; k < piece.orient; k++) await page.mouse.click(at.x, at.y);
    }
    await expectSolved(page, total);
    await page.waitForTimeout(500);
    await shot(page, "desktop-solved");

    await page.getByRole("button", { name: "Copy result" }).click();
    await page.waitForSelector("text=Copied to clipboard");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    ok(copied.startsWith("Refract #"), "share text is on the clipboard");
    ok(copied.includes("no hints") && copied.includes("🟩"), "share text has the result and the grid");
    ok(!/[A-G][1-7]\b/.test(copied.split("\n").slice(0, -1).join("\n")), "share text names no cells");
    const moves = await stat(page, "Moves");

    await page.reload({ waitUntil: "networkidle" });
    await expectSolved(page, total);
    ok((await stat(page, "Moves")) === moves, "a finished game survives a reload");
    ok((await page.locator("dt:text-is('Streak') + dd").first().innerText()) === "1", "the streak counts today");

    // Archive: today is marked solved; pick an earlier day.
    await page.getByRole("button", { name: "Past puzzles and streak" }).click();
    await page.waitForSelector("dialog[open]");
    ok(await page.locator("dialog[open] button[aria-label*='solved in'][aria-label*='today']").count(), "calendar marks today as solved");
    await shot(page, "desktop-archive");
    await page.locator(`dialog[open] button[aria-label*="puzzle 5,"]`).click();
    await page.waitForSelector("h1:has-text('Archive #5')");
    ok(new URL(page.url()).searchParams.get("day") === DAY_A, "the address bar follows the chosen day");

    // Help dialog opens, closes with Escape, and focus goes back to its button.
    await page.getByRole("button", { name: "How to play" }).click();
    await page.waitForSelector("dialog[open]");
    await shot(page, "desktop-help");
    await page.keyboard.press("Escape");
    ok((await page.locator("dialog[open]").count()) === 0, "Escape closes the dialog");
    ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "How to play"), "focus returns to the button that opened the dialog");

    // Sound toggle flips and is remembered.
    await page.getByRole("button", { name: "Sound off" }).click();
    ok(await page.getByRole("button", { name: "Sound on" }).count(), "sound toggles on");
    await page.getByRole("button", { name: "Hint" }).click(); // a sound-making move with sound on
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    ok(await page.getByRole("button", { name: "Sound on" }).count(), "the sound setting is remembered");
    await page.getByRole("button", { name: "Sound on" }).click();

    ok(problems.length === 0, `no console errors on desktop (${problems.join(" | ")})`);
    await context.close();
  }

  // ---- 2. Reload in the middle of a game ----
  {
    const { context, page, problems } = await session({ width: 1280, height: 800 });
    await open(page, `/?day=${DAY_B}`);
    const { puzzle, solution } = await cached(page, DAY_B);
    const geo = await centres(page, puzzle.radius);
    await page.getByRole("button", { name: "Hint" }).click();
    // One wrong move as well: a piece on a cell that is not its own.
    const state = await page.evaluate(() => [...document.querySelectorAll("button[aria-label^='Piece']")].map((b) => b.getAttribute("aria-label")));
    const loose = state.findIndex((label) => label.includes("in the tray"));
    const spare = geo.cells.findIndex(
      (_, cell) =>
        !solution.some((p) => p.cell === cell) &&
        !puzzle.walls.includes(cell) &&
        !puzzle.targets.some((t) => t.cell === cell) &&
        !puzzle.emitters.some((e) => e.cell === cell) &&
        !puzzle.fixed.some((f) => f.cell === cell),
    );
    await tray(page, loose).click();
    await page.mouse.click(geo.cells[spare].x, geo.cells[spare].y);
    ok((await stat(page, "Moves")) === "2", "two moves made");
    await page.waitForTimeout(1300);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    ok((await stat(page, "Moves")) === "2", "moves survive a reload mid-game");
    ok((await page.locator("button[aria-label*='locked by a hint']").count()) === 1, "the hinted piece is still locked");
    ok((await tray(page, loose).getAttribute("aria-label")).includes(`on the board at ${geo.cells[spare].name}`), "the placed piece is where it was left");
    ok((await stat(page, "Time")) !== "0:00", "the clock kept its time");
    ok((await page.locator("ol[aria-label='How to play']:visible").count()) === 0, "the how-to stays dismissed");
    ok(await page.getByRole("button", { name: "Hint (1)" }).count(), "the hint count is kept");

    // A locked piece cannot be moved or turned.
    const lockedLabel = await page.locator("button[aria-label*='locked by a hint']").getAttribute("aria-label");
    const lockedCell = geo.cells.find((c) => lockedLabel.endsWith(` ${c.name}`));
    await page.mouse.click(lockedCell.x, lockedCell.y);
    ok((await stat(page, "Moves")) === "2", "a hinted piece does not turn");

    // Clear takes the loose piece back but leaves the hinted one.
    await page.getByRole("button", { name: "Clear" }).click();
    ok((await tray(page, loose).getAttribute("aria-label")).includes("in the tray"), "Clear returns loose pieces");
    ok((await page.locator("button[aria-label*='locked by a hint']").count()) === 1, "Clear keeps hinted pieces");

    // Bad and future days fall back to today.
    for (const bad of ["garbage", "2026-02-31", utcDay(3), "2020-01-01"]) {
      await open(page, `/?day=${bad}`);
      ok((await page.locator("h1").innerText()).startsWith("Today #"), `?day=${bad} falls back to today`);
    }
    const missing = await page.goto(`${base}/nope`);
    ok(missing.status() === 404, "unknown pages return 404");
    ok(await page.getByRole("link", { name: "Play today's puzzle" }).count(), "the 404 page links home");
    ok(problems.filter((p) => !p.includes("404")).length === 0, `no console errors mid-game (${problems.join(" | ")})`);
    await context.close();
  }

  // ---- 3. Keyboard only ----
  {
    const { context, page, problems } = await session({ width: 1280, height: 800 });
    await open(page, `/?day=${DAY_C}`);
    const { puzzle, solution } = await cached(page, DAY_C);
    const geo = await centres(page, puzzle.radius);
    // Tab reaches the board: skip link, home link, four header buttons, then the canvas.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.tagName === "CANVAS")) break;
    }
    ok(await page.evaluate(() => document.activeElement?.tagName === "CANVAS"), "Tab reaches the board");
    const status = () => page.locator("section[aria-label='Puzzle board'] p[role='status']").innerText();
    const here = async () => /^([A-Z])(\d+):/.exec(await status());

    for (let i = 0; i < solution.length; i++) {
      const piece = solution[i];
      const want = /^([A-Z])(\d+)$/.exec(geo.cells[piece.cell].name);
      await page.keyboard.press(String(i + 1));
      ok((await status()).includes("selected"), "a number key selects a tray piece");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowDown");
      for (let guard = 0; guard < 40; guard++) {
        const at = await here();
        if (!at) {
          await page.keyboard.press("ArrowUp");
          continue;
        }
        if (at[1] !== want[1]) await page.keyboard.press(at[1] < want[1] ? "ArrowRight" : "ArrowLeft");
        else if (at[2] !== want[2]) await page.keyboard.press(Number(at[2]) < Number(want[2]) ? "ArrowDown" : "ArrowUp");
        else break;
      }
      for (let k = 0; k < piece.orient; k++) await page.keyboard.press("r"); // turn it in the hand
      await page.keyboard.press("Enter");
    }
    await expectSolved(page, puzzle.targets.length);
    ok((await stat(page, "Moves")) === String(solution.length), "keyboard play: one move per piece");
    await shot(page, "keyboard-solved");
    ok(problems.length === 0, `no console errors with the keyboard (${problems.join(" | ")})`);
    await context.close();
  }

  // ---- 4. Phones: touch, first screen, no sideways scroll ----
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    const tag = `${size.width}px`;
    const { context, page, problems } = await session({ ...size, touch: true, motion: "no-preference" });
    await open(page, "/");
    await noSidewaysScroll(page, `at ${tag} on load`);
    const { puzzle, solution } = await cached(page, TODAY);
    const geo = await centres(page, puzzle.radius);
    const hintBox = await page.getByRole("button", { name: "Hint" }).boundingBox();
    ok(hintBox.y + hintBox.height <= size.height, `tray and actions are on the first screen at ${tag}`);
    ok(geo.unit * Math.sqrt(3) >= 44, `cells are at least 44px tall at ${tag} (${(geo.unit * Math.sqrt(3)).toFixed(1)})`);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href]")]
        .filter((el) => el.getClientRects().length > 0 && !el.classList.contains("sr-only"))
        .map((el) => ({ r: el.getBoundingClientRect(), label: el.getAttribute("aria-label") ?? el.textContent }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .map(({ r, label }) => `${label} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    ok(small.length === 0, `every touch target is at least 44px at ${tag} (${small.join(", ")})`);
    await page.waitForTimeout(700);
    await shot(page, `phone-${size.width}-first`);

    // A real touch drag for the first piece (touch events, not synthesised mouse ones).
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y) }],
      });
    const box = await tray(page, 0).boundingBox();
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const target = geo.cells[solution[0].cell];
    const finger = { x: target.x, y: target.y + 48 }; // the piece floats above the finger
    await touch("touchStart", from.x, from.y);
    for (let step = 1; step <= 10; step++) {
      await touch("touchMove", from.x + ((finger.x - from.x) * step) / 10, from.y + ((finger.y - from.y) * step) / 10);
      await page.waitForTimeout(16);
    }
    await shot(page, `phone-${size.width}-dragging`);
    await touch("touchEnd");
    ok((await tray(page, 0).getAttribute("aria-label")).includes(`on the board at ${target.name}`), `touch drag places a piece at ${tag}`);
    const after = await centres(page, puzzle.radius);
    ok(Math.abs(after.unit - geo.unit) < 0.01 && Math.abs(after.top - geo.top) < 0.5, `the board does not move when the how-to goes away at ${tag}`);
    await noSidewaysScroll(page, `at ${tag} after a drag`);
    for (let k = 0; k < solution[0].orient; k++) await page.touchscreen.tap(target.x, target.y);

    // Tap-to-place for the rest.
    for (let i = 1; i < solution.length; i++) {
      const at = geo.cells[solution[i].cell];
      await tray(page, i).tap();
      await page.touchscreen.tap(at.x, at.y);
      for (let k = 0; k < solution[i].orient; k++) await page.touchscreen.tap(at.x, at.y);
    }
    await expectSolved(page, puzzle.targets.length);
    await page.waitForTimeout(400);
    await noSidewaysScroll(page, `at ${tag} after winning`);
    await shot(page, `phone-${size.width}-solved`);

    for (const name of ["Past puzzles and streak", "How to play"]) {
      await page.getByRole("button", { name }).tap();
      await page.waitForSelector("dialog[open]");
      await noSidewaysScroll(page, `at ${tag} with "${name}" open`);
      const fits = await page.evaluate(() => {
        const r = document.querySelector("dialog[open]").getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight;
      });
      ok(fits, `"${name}" dialog fits the screen at ${tag}`);
      await shot(page, `phone-${size.width}-${name.split(" ")[0].toLowerCase()}`);
      await page.getByRole("button", { name: "Close" }).tap();
    }

    // The editor on a phone.
    await open(page, "/editor");
    await noSidewaysScroll(page, `in the editor at ${tag}`);
    await page.getByRole("button", { name: "Verify solvable" }).tap();
    await page.waitForSelector("text=exactly one solution");
    await page.waitForTimeout(700); // the smooth scroll that brings the verdict up
    const verdictBox = await page.locator("text=exactly one solution").boundingBox();
    ok(verdictBox.y >= 0 && verdictBox.y + verdictBox.height <= size.height, `the solver's verdict is scrolled into view at ${tag}`);
    await noSidewaysScroll(page, `in the editor at ${tag} after verifying`);
    const toolLabels = await page.evaluate(() =>
      [...document.querySelectorAll("[role='radiogroup'][aria-label='Tool'] button")].map((b) => b.scrollWidth <= b.clientWidth),
    );
    ok(toolLabels.length === 7 && toolLabels.every(Boolean), `tool labels fit their buttons at ${tag}`);
    await shot(page, `phone-${size.width}-editor`);
    ok(problems.length === 0, `no console errors at ${tag} (${problems.join(" | ")})`);
    await context.close();
  }

  // ---- 5. Level editor ----
  {
    const { context, page, problems } = await session({ width: 1280, height: 800 });
    await open(page, "/editor");
    const before = await centres(page, 3);
    await page.getByRole("button", { name: "Verify solvable" }).click();
    await page.waitForSelector("text=exactly one solution");
    ok(await page.locator("text=/Difficulty:/").count(), "the editor reports a difficulty");
    await shot(page, "editor-verified");

    // Play the sample with hints, then go back.
    await page.getByRole("button", { name: "Play it" }).click();
    await page.waitForSelector("h1:has-text('Custom level')");
    while (await page.getByRole("button", { name: /^Hint/ }).isEnabled().catch(() => false)) {
      await page.getByRole("button", { name: /^Hint/ }).click();
    }
    await page.waitForSelector("section[aria-label='Result']");
    await page.getByRole("button", { name: "Back to the editor" }).first().click();
    await page.waitForSelector("h1:has-text('Level editor')");

    // Build a level from nothing: an emitter, a mirror, a target on the reflected beam.
    await page.getByRole("button", { name: "Clear" }).click();
    ok(await page.locator("text=Add an emitter").count(), "an empty board says what is missing");
    ok(await page.getByRole("button", { name: "Verify solvable" }).isDisabled(), "verify is off until the level is complete");
    const geo = await centres(page, 3);
    const cell = (name) => geo.cells.find((c) => c.name === name);
    const click = (name) => page.mouse.click(cell(name).x, cell(name).y);
    await page.getByRole("radio", { name: "Emitter" }).click();
    await click("A1");
    await page.getByRole("radio", { name: "Mirror" }).click();
    await click("D1"); // straight down the emitter's line (A1 aims down-right along the top-left edge)
    const lineCells = await page.evaluate(() => JSON.parse(localStorage.getItem("refract:v1:editor-draft")));
    ok(lineCells.emitters.length === 1 && lineCells.loose.length === 1, "the draft is saved as it is edited");
    await page.getByRole("radio", { name: "Target" }).click();
    await click("D4");
    await shot(page, "editor-building");

    // Undo twice, then put the sample back and verify a level with two solutions.
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Sample" }).click();
    await page.getByRole("radio", { name: "Erase" }).click();
    const sample = await page.evaluate(() => JSON.parse(localStorage.getItem("refract:v1:editor-draft")));
    // Removing a target loosens the puzzle: the solver should now find a second solution or still one.
    await page.mouse.click(geo.cells[sample.targets[0].cell].x, geo.cells[sample.targets[0].cell].y);
    await page.getByRole("button", { name: "Verify solvable" }).click();
    await page.waitForSelector("text=more than one way");
    await page.getByRole("button", { name: "Show the other solution" }).click();
    ok(await page.getByRole("button", { name: "Show my layout" }).count(), "the second solution can be shown on the board");
    const tall = await centres(page, 3);
    ok(Math.abs(tall.unit - before.unit) < 0.01, "the editor board keeps its size whatever the verdict says");
    await shot(page, "editor-loosened");

    // A tray piece with no job is reported, not passed off as a clean level.
    await page.getByRole("button", { name: "Sample" }).click();
    await page.getByRole("radio", { name: "Mirror" }).click();
    const idle = geo.cells.findIndex((_, cell) => cell > 30 && !JSON.stringify(sample).includes(`"cell":${cell}`) && !sample.walls.includes(cell));
    await page.mouse.click(geo.cells[idle].x, geo.cells[idle].y);
    await page.getByRole("button", { name: "Verify solvable" }).click();
    await page.waitForSelector("text=/to spare|more than one way/");
    await shot(page, "editor-spare");

    // A level link opens ready to play, and a broken one falls back to the editor.
    await page.getByRole("button", { name: "Sample" }).click();
    await page.getByRole("button", { name: "Link" }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    ok(link.includes("/editor#play="), "the level link is on the clipboard");
    const visitor = await session({ width: 1280, height: 800 });
    await visitor.page.goto(link, { waitUntil: "networkidle" });
    await visitor.page.waitForSelector("h1:has-text('Custom level')");
    await visitor.page.goto(`${base}/editor#play=not-a-level`, { waitUntil: "networkidle" });
    await visitor.page.waitForSelector("h1:has-text('Level editor')");
    ok(visitor.problems.length === 0, `no console errors from level links (${visitor.problems.join(" | ")})`);
    await visitor.context.close();

    // A search that is too big can be stopped, and the next one answers at once.
    const slow = await session({ width: 1280, height: 800 });
    const throttle = await slow.context.newCDPSession(slow.page);
    await throttle.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await slow.page.goto(`${base}/editor#edit=${HEAVY_LEVEL}`, { waitUntil: "networkidle" });
    await slow.page.waitForSelector("canvas");
    await slow.page.getByRole("button", { name: "Verify solvable" }).click();
    await slow.page.getByRole("button", { name: "Stop" }).click();
    await slow.page.waitForSelector("text=searching every placement", { state: "detached", timeout: 1500 });
    ok((await slow.page.locator("text=/Too big|could not run/").count()) === 0, "a stopped search reports nothing");
    ok(await slow.page.getByRole("button", { name: "Verify solvable" }).isEnabled(), "verify is available again after a stop");
    // Editing the board under a running search stops it too.
    await slow.page.getByRole("button", { name: "Verify solvable" }).click();
    await slow.page.waitForSelector("text=searching every placement");
    await slow.page.getByRole("button", { name: "Sample" }).click();
    await slow.page.getByRole("button", { name: "Verify solvable" }).click();
    await slow.page.waitForSelector("text=exactly one solution", { timeout: 1500 });
    ok(true, "a new search does not wait behind an abandoned one");
    // Left alone, the same level runs out of budget and says so.
    // (Only the hash changes here, and the editor reloads itself to pick the new level up.)
    await slow.page.goto(`${base}/editor#edit=${HEAVY_LEVEL}`);
    await slow.page.waitForSelector("dd:text-is('8/8')");
    await slow.page.getByRole("button", { name: "Verify solvable" }).click();
    await slow.page.waitForSelector("text=Too big to verify", { timeout: 30_000 });
    ok(slow.problems.length === 0, `no console errors when stopping a search (${slow.problems.join(" | ")})`);
    await slow.context.close();

    ok(problems.length === 0, `no console errors in the editor (${problems.join(" | ")})`);
    await context.close();
  }

  // ---- 6. Storage blocked, and no Web Worker ----
  {
    const { context, page, problems } = await session({ width: 1280, height: 800 });
    await context.addInitScript(() => {
      const refuse = () => {
        throw new DOMException("blocked", "SecurityError");
      };
      Object.defineProperty(window, "localStorage", { get: refuse });
      delete window.Worker;
    });
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.waitForSelector("canvas");
    while (await page.getByRole("button", { name: /^Hint/ }).isEnabled().catch(() => false)) {
      await page.getByRole("button", { name: /^Hint/ }).click();
    }
    await page.waitForSelector("section[aria-label='Result']");
    ok(true, "playable with storage blocked and no worker");
    ok(problems.length === 0, `no console errors without storage or a worker (${problems.join(" | ")})`);
    await context.close();
  }

  console.log(`e2e: ${checks} checks passed`);
} finally {
  await browser.close();
  stop();
}
