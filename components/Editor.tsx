"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cellAt, cellName, makeGrid } from "@/lib/engine/hex";
import { PIECE_KINDS, colorName, type Color, type PieceKind } from "@/lib/engine/optics";
import { countLit, targetsLit, type Placed, type Puzzle } from "@/lib/engine/puzzle";
import { hashString } from "@/lib/engine/rng";
import type { SolveResult } from "@/lib/engine/solver";
import { moveCursor, type ArrowKey } from "@/lib/game/cursor";
import {
  EDITOR_RADII,
  MAX_TRAY,
  VERIFY_NODES,
  applyTool,
  cleanDraft,
  decodeDraft,
  draftLight,
  draftProblems,
  draftPuzzle,
  draftSolution,
  emptyDraft,
  encodeDraft,
  eraseAt,
  resizeDraft,
  rotateAt,
  sampleDraft,
  verdict,
  whatIsAt,
  type Draft,
  type Tool,
} from "@/lib/game/editor";
import { requestSolve } from "@/lib/game/engine-client";
import { formatTime } from "@/lib/game/share";
import { play } from "@/lib/game/sound";
import { KEYS, load, save } from "@/lib/game/storage";
import { COLOR_LETTERS, LIGHT_RGB, rgba } from "@/lib/render/palette";
import type { Scene, ScenePiece } from "@/lib/render/renderer";
import { Board, type BoardApi } from "./Board";
import { Difficulty } from "./Difficulty";
import { Game } from "./Game";
import { Footer, Header, IconLink } from "./Header";
import { CalendarIcon, CheckIcon, PlayIcon, ShareIcon, TrashIcon, UndoIcon } from "./icons";
import { PieceIcon } from "./PieceIcon";
import { Placeholder } from "./Placeholder";

const noSubscription = () => () => {};

function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <Header>
        <IconLink label="Daily puzzle" href="/">
          <CalendarIcon />
        </IconLink>
      </Header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </>
  );
}

/** The draft lives in the browser (storage or the link), so the workbench mounts on the client. */
export function Editor() {
  const client = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  return <Frame>{client ? <Workbench /> : <Placeholder text="Opening the editor…" />}</Frame>;
}

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: "emitter", label: "Emitter" },
  { tool: "target", label: "Target" },
  { tool: "wall", label: "Wall" },
  { tool: "mirror", label: "Mirror" },
  { tool: "splitter", label: "Splitter" },
  { tool: "prism", label: "Prism" },
  { tool: "erase", label: "Erase" },
];

/** White first, then the three channels, then the mixes. */
const COLOR_ORDER: Color[] = [7, 1, 2, 4, 3, 5, 6];
const SIZE_NAMES: Record<number, string> = { 2: "Small", 3: "Medium", 4: "Large" };
const isPiece = (tool: Tool): tool is PieceKind => PIECE_KINDS.includes(tool as PieceKind);

function ToolIcon({ tool }: { tool: Tool }) {
  if (isPiece(tool)) return <PieceIcon kind={tool} orient={tool === "prism" ? 0 : 1} size={26} />;
  if (tool === "erase") return <TrashIcon size={22} />;
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {tool === "emitter" && (
        <>
          <circle cx="8" cy="12" r="5" stroke="#fff" strokeWidth="1.8" />
          <circle cx="8" cy="12" r="1.8" fill="#fff" />
          <path d="M14 12h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {tool === "target" && (
        <>
          <circle cx="12" cy="12" r="8" stroke="#38ff96" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.5" fill="#38ff96" />
        </>
      )}
      {tool === "wall" && (
        <>
          <path d="M7 4h10l5 8-5 8H7l-5-8 5-8Z" fill="#1b2552" stroke="#5e72c0" strokeWidth="1.6" />
          <path d="m8 16 8-8M6 12l5-5M13 17l5-5" stroke="#5e72c0" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}

type Check =
  | { key: string; state: "running" }
  | { key: string; state: "done"; result: SolveResult; ms: number }
  | { key: string; state: "failed" };

function startingDraft(): { draft: Draft; play: boolean; linked: boolean } {
  // A level link wins over the saved draft: "#play=…" opens it ready to play.
  const hash = window.location.hash.slice(1);
  const [name, data] = hash.split("=");
  if ((name === "play" || name === "edit") && data) {
    const draft = decodeDraft(data);
    if (draft) {
      return { draft, play: name === "play" && draftProblems(draft).length === 0, linked: true };
    }
  }
  return { draft: cleanDraft(load(KEYS.editor)) ?? sampleDraft(), play: false, linked: false };
}

function Workbench() {
  const [start] = useState(startingDraft);
  const [draft, setDraft] = useState<Draft>(start.draft);
  const [past, setPast] = useState<Draft[]>([]);
  const [mode, setMode] = useState<"edit" | "play">(start.play ? "play" : "edit");
  const [tool, setTool] = useState<Tool>("mirror");
  const [fixed, setFixed] = useState(false);
  const [color, setColor] = useState<Color>(7);
  const [check, setCheck] = useState<Check | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [cursor, setCursor] = useState(() => cellAt(makeGrid(start.draft.radius), 0, 0));
  const [keyboard, setKeyboard] = useState(false);
  const [hover, setHover] = useState(-1);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkText, setLinkText] = useState("");
  // A level opened from a link is someone else's: it only replaces the saved
  // draft once the visitor edits it.
  const [linked, setLinked] = useState(start.linked);
  const boardApi = useRef<BoardApi | null>(null);
  const pressed = useRef<{ id: number; cell: number } | null>(null);

  const grid = useMemo(() => makeGrid(draft.radius), [draft.radius]);
  const puzzle = useMemo(() => draftPuzzle(draft), [draft]);
  const puzzleKey = useMemo(() => JSON.stringify(puzzle), [puzzle]);
  const light = useMemo(() => draftLight(draft), [draft]);
  const problems = useMemo(() => draftProblems(draft), [draft]);
  const layoutSolves = draft.targets.length > 0 && targetsLit(puzzle, light);
  // A result only counts for the board it was computed for.
  const current = check && check.key === puzzleKey ? check : null;
  const report = current?.state === "done" ? verdict(current.result) : null;
  const other =
    current?.state === "done" && current.result.solutions.length > 1
      ? current.result.solutions[1]
      : null;

  useEffect(() => {
    if (!linked) save(KEYS.editor, draft);
  }, [draft, linked]);

  useEffect(() => {
    // Another level link pasted into the address bar only changes the hash: load it.
    const reload = () => window.location.reload();
    window.addEventListener("hashchange", reload);
    return () => window.removeEventListener("hashchange", reload);
  }, []);

  const adopt = () => {
    if (!linked) return;
    setLinked(false);
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // The address bar is a convenience only.
    }
  };

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const commit = (next: Draft, said: string) => {
    if (next === draft) return false;
    adopt();
    setPast((stack) => [...stack.slice(-99), draft]);
    setDraft(next);
    setShowOther(false);
    setMessage(said);
    return true;
  };

  const describe = (cell: number, next: Draft): string => {
    const found = whatIsAt(next, cell);
    const name = cellName(makeGrid(next.radius), cell);
    if (!found) return `${name} cleared.`;
    if (found.type === "emitter") return `Emitter at ${name}.`;
    if (found.type === "target") {
      return `${colorName(next.targets[found.index].color)} target at ${name}.`;
    }
    if (found.type === "wall") return `Wall at ${name}.`;
    const piece = (found.type === "fixed" ? next.fixed : next.loose)[found.index];
    return `${found.type === "fixed" ? "Fixed" : "Tray"} ${piece.kind} at ${name}.`;
  };

  const stamp = (cell: number) => {
    if (cell < 0) return;
    const next = applyTool(draft, tool, cell, { fixed, color });
    if (commit(next, describe(cell, next))) {
      play(tool === "erase" ? "remove" : "place");
    } else if (isPiece(tool) && !fixed && draft.loose.length >= MAX_TRAY) {
      play("deny");
      setMessage(`The tray holds at most ${MAX_TRAY} pieces.`);
    }
  };

  const turn = (cell: number, delta: number) => {
    const next = rotateAt(draft, cell, delta);
    if (commit(next, describe(cell, next))) play("rotate");
  };

  const erase = (cell: number) => {
    if (cell < 0 || !whatIsAt(draft, cell)) return;
    if (commit(eraseAt(draft, cell), `${cellName(grid, cell)} cleared.`)) play("remove");
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((stack) => stack.slice(0, -1));
    setDraft(previous);
    setShowOther(false);
    setMessage("Undone.");
  };

  const replaceWith = (next: Draft, said: string) => {
    if (commit(next, said)) setCursor(cellAt(makeGrid(next.radius), 0, 0));
  };

  const verify = async () => {
    if (problems.length > 0) return;
    const key = puzzleKey;
    setCheck({ key, state: "running" });
    setShowOther(false);
    try {
      const { result, ms } = await requestSolve(puzzle, VERIFY_NODES);
      // If the board was edited meanwhile, a newer check owns the slot: leave it alone.
      setCheck((latest) => (latest?.key === key ? { key, state: "done", result, ms } : latest));
    } catch {
      setCheck((latest) => (latest?.key === key ? { key, state: "failed" } : latest));
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/editor#play=${encodeDraft(draft)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setLinkText("");
      setMessage("Link copied. It opens this level ready to play.");
    } catch {
      setLinkText(url);
      setMessage("Copying was blocked. Select the link below and copy it yourself.");
    }
  };

  // ---- Input ----

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    setKeyboard(false);
    const cell = boardApi.current?.cellAt(event.clientX, event.clientY) ?? -1;
    pressed.current = { id: event.pointerId, cell };
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const press = pressed.current;
    pressed.current = null;
    if (!press || press.id !== event.pointerId) return;
    const cell = boardApi.current?.cellAt(event.clientX, event.clientY) ?? -1;
    if (cell < 0 || cell !== press.cell) return;
    if (event.button === 2) erase(cell);
    else if (event.button === 0) stamp(cell);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== "mouse") return;
    const cell = boardApi.current?.cellAt(event.clientX, event.clientY) ?? -1;
    if (cell !== hover) setHover(cell);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.altKey) return;
    const key = event.key;
    const lower = key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (lower === "z") {
        event.preventDefault();
        undo();
      }
      return;
    }
    if (key === "Tab" || key === "Shift") return;
    setKeyboard(true);
    if (key.startsWith("Arrow")) {
      event.preventDefault();
      const next = moveCursor(grid, cursor, key as ArrowKey);
      setCursor(next);
      const found = whatIsAt(draft, next);
      setMessage(found ? describe(next, draft) : `${cellName(grid, next)}: empty.`);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      stamp(cursor);
    } else if (lower === "r") {
      turn(cursor, event.shiftKey ? -1 : 1);
    } else if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      erase(cursor);
    } else if (lower === "z") {
      undo();
    }
  };

  const scene = useMemo<Scene>(() => {
    const board: Puzzle = { ...puzzle, tray: [] };
    const shown: readonly Placed[] = showOther && other ? other : draft.loose;
    const pieces: ScenePiece[] = shown.map((piece) => ({
      key: `${showOther && other ? "o" : "l"}${piece.cell}`,
      cell: piece.cell,
      kind: piece.kind,
      orient: piece.orient,
      style: showOther && other ? "preview" : "movable",
    }));
    return {
      puzzle: board,
      pieces,
      cursor: keyboard ? cursor : null,
      hover: !keyboard && hover >= 0 ? { cell: hover, ok: true } : null,
      solved: !showOther && layoutSolves,
    };
  }, [puzzle, draft.loose, showOther, other, keyboard, cursor, hover, layoutSolves]);

  if (mode === "play") {
    const hints = layoutSolves
      ? draftSolution(draft)
      : current?.state === "done" && current.result.solutions.length > 0
        ? PIECE_KINDS.flatMap((kind) => current.result.solutions[0].filter((p) => p.kind === kind))
        : null;
    return (
      <Game
        key={puzzleKey}
        id={`custom:${hashString(puzzleKey).toString(36)}`}
        puzzle={puzzle}
        solution={hints}
        heading={
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight lg:text-3xl">
              Custom level
            </h1>
            <p className="text-xs text-muted lg:mt-1 lg:text-sm">
              {report?.difficulty ? (
                <Difficulty nodes={(current as { result: SolveResult }).result.nodes} />
              ) : (
                "Made in the editor"
              )}
              {" · "}
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Back to the editor
              </button>
            </p>
          </div>
        }
        result={(done) => (
          <section
            aria-label="Result"
            className="rise rounded-xl border border-success/40 bg-surface p-4 shadow-[0_0_40px_-12px_rgba(77,255,166,0.45)]"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-success">
              <CheckIcon />
              Solved
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {done.moves === 1 ? "1 move" : `${done.moves} moves`} · {formatTime(done.timeMs)}
              {done.hints > 0 ? ` · ${done.hints === 1 ? "1 hint" : `${done.hints} hints`}` : ""}
            </p>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="mt-3 min-h-12 w-full rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90"
            >
              Back to the editor
            </button>
          </section>
        )}
      />
    );
  }

  const lit = countLit(puzzle, light);
  const segment = (on: boolean) =>
    `min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition-colors ${
      on ? "bg-raised text-fg shadow-[inset_0_0_0_1.5px_var(--accent)]" : "text-muted hover:text-fg"
    }`;

  return (
    <div className="game-shell mx-auto w-full max-w-[1140px]">
      <div className="game-grid editor-grid">
        <div className="game-meta px-3 pt-2 lg:px-0 lg:pt-0">
          <h1 className="text-lg font-semibold leading-tight tracking-tight lg:text-3xl">Level editor</h1>
          <p className="text-xs text-muted lg:mt-1 lg:text-sm">
            Place the solution, then let the solver check the level.
          </p>
        </div>

        <section className="game-board relative" aria-label="Editor board">
          <Board
            scene={scene}
            apiRef={boardApi}
            className="absolute inset-0 cursor-crosshair"
            role="application"
            aria-roledescription="level editor board"
            aria-label="Editor board. Arrow keys move the cursor, Enter uses the selected tool, R turns what is there, Backspace erases it."
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(-1)}
            onPointerCancel={() => {
              pressed.current = null;
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onFocus={(event) => setKeyboard(event.currentTarget.matches(":focus-visible"))}
            onBlur={() => setKeyboard(false)}
          />
          <p role="status" aria-live="polite" className="sr-only">
            {message}
          </p>
        </section>

        <div className="game-panel flex flex-col gap-3 px-3 pb-3 lg:px-0 lg:pb-0">
          <div
            role="radiogroup"
            aria-label="Tool"
            className="grid grid-cols-7 gap-1 rounded-xl border border-border bg-surface p-1"
          >
            {TOOLS.map((entry) => (
              <button
                key={entry.tool}
                type="button"
                role="radio"
                aria-checked={tool === entry.tool}
                aria-label={entry.label}
                title={entry.label}
                onClick={() => setTool(entry.tool)}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition-colors ${
                  tool === entry.tool
                    ? "bg-raised text-fg shadow-[inset_0_0_0_1.5px_var(--accent)]"
                    : "text-muted hover:bg-raised/60 hover:text-fg"
                }`}
              >
                <ToolIcon tool={entry.tool} />
                <span className="hidden sm:block" aria-hidden="true">
                  {entry.label}
                </span>
              </button>
            ))}
          </div>

          <div className="flex min-h-[54px] items-stretch rounded-xl border border-border bg-surface p-1">
            {isPiece(tool) ? (
              <div role="radiogroup" aria-label="Who gets this piece" className="flex flex-1 gap-1">
                <button type="button" role="radio" aria-checked={!fixed} onClick={() => setFixed(false)} className={segment(!fixed)}>
                  Player&apos;s tray
                </button>
                <button type="button" role="radio" aria-checked={fixed} onClick={() => setFixed(true)} className={segment(fixed)}>
                  Fixed on the board
                </button>
              </div>
            ) : tool === "emitter" || tool === "target" ? (
              <div role="radiogroup" aria-label="Colour" className="flex flex-1 items-center gap-1">
                {COLOR_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={colorName(c)}
                    title={colorName(c)}
                    onClick={() => setColor(c)}
                    className={`grid min-h-11 flex-1 place-items-center rounded-lg ${
                      color === c ? "bg-raised shadow-[inset_0_0_0_1.5px_var(--accent)]" : "hover:bg-raised/60"
                    }`}
                  >
                    <span
                      className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-bg"
                      style={{ background: rgba(LIGHT_RGB[c], 1) }}
                    >
                      {COLOR_LETTERS[c]}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex flex-1 items-center px-2 text-sm text-muted">
                {tool === "wall"
                  ? "Walls stop light. Click one again to remove it."
                  : "Click anything to remove it."}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={verify}
              disabled={problems.length > 0 || current?.state === "running"}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckIcon />
              {current?.state === "running" ? "Solving…" : "Verify solvable"}
            </button>
            <button
              type="button"
              onClick={() => setMode("play")}
              disabled={problems.length > 0}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:border-accent/60 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PlayIcon />
              Play it
            </button>
          </div>

          <div aria-live="polite" className="empty:hidden">
            {problems.length > 0 ? (
              <ul className="space-y-1 rounded-xl border border-border bg-surface/60 p-3 text-sm text-muted">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : current?.state === "running" ? (
              <p className="rounded-xl border border-border bg-surface/60 p-3 text-sm text-muted">
                The solver is searching every placement in a background thread…
              </p>
            ) : current?.state === "failed" ? (
              <p className="rounded-xl border border-danger/50 bg-surface p-3 text-sm text-danger">
                The solver could not run in this browser. Try again.
              </p>
            ) : report && current?.state === "done" ? (
              <div
                className={`rise rounded-xl border bg-surface p-3 text-sm ${
                  report.tone === "good"
                    ? "border-success/50"
                    : report.tone === "bad"
                      ? "border-danger/50"
                      : "border-gold/50"
                }`}
              >
                <p
                  className={`font-semibold ${
                    report.tone === "good" ? "text-success" : report.tone === "bad" ? "text-danger" : "text-gold"
                  }`}
                >
                  {report.title}
                </p>
                <p className="mt-1 leading-relaxed text-muted">{report.detail}</p>
                <p className="mt-2 text-xs text-muted">
                  {report.difficulty && (
                    <>
                      Difficulty: <Difficulty nodes={current.result.nodes} /> ·{" "}
                    </>
                  )}
                  <span className="font-mono text-fg">{current.result.nodes.toLocaleString("en-US")}</span>{" "}
                  nodes in{" "}
                  <span className="font-mono text-fg">
                    {current.ms < 10 ? current.ms.toFixed(1) : Math.round(current.ms)} ms
                  </span>
                </p>
                {other && (
                  <button
                    type="button"
                    aria-pressed={showOther}
                    onClick={() => setShowOther(!showOther)}
                    className="mt-2 min-h-11 rounded-lg border border-border px-3 text-sm font-medium hover:bg-raised"
                  >
                    {showOther ? "Show my layout" : "Show the other solution"}
                  </button>
                )}
              </div>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            {tool === "target"
              ? "A target on a lit cell takes the colour of the light there. Click it again to re-read the light."
              : tool === "emitter"
                ? "A new emitter aims down the longest line. Click it again to turn it."
                : isPiece(tool)
                  ? "Click a piece again to turn it. Tray pieces are the ones the player has to place."
                  : "Right-click erases with any tool. On a keyboard: arrows, Enter, R to turn, Backspace."}
          </p>
        </div>
      </div>

      <div className="game-extra flex flex-col gap-3 px-3 pb-4 lg:px-0 lg:pb-0">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Tray", `${draft.loose.length}/${MAX_TRAY}`],
            ["Targets", String(draft.targets.length)],
            ["Lit now", `${lit}/${draft.targets.length}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border bg-surface py-1.5">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</dt>
              <dd className="font-mono text-base tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div role="radiogroup" aria-label="Board size" className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {EDITOR_RADII.map((radius) => (
            <button
              key={radius}
              type="button"
              role="radio"
              aria-checked={draft.radius === radius}
              onClick={() =>
                replaceWith(resizeDraft(draft, radius), `Board size ${SIZE_NAMES[radius].toLowerCase()}.`)
              }
              className={segment(draft.radius === radius)}
            >
              {SIZE_NAMES[radius]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <SmallButton label="Undo" onClick={undo} disabled={past.length === 0}>
            <UndoIcon size={18} />
          </SmallButton>
          <SmallButton label="Clear" onClick={() => replaceWith(emptyDraft(draft.radius), "Board cleared.")}>
            <TrashIcon size={18} />
          </SmallButton>
          <SmallButton label="Sample" onClick={() => replaceWith(sampleDraft(), "Sample level loaded.")}>
            <PlayIcon size={18} />
          </SmallButton>
          <SmallButton label={copied ? "Copied" : "Link"} onClick={copyLink} disabled={problems.length > 0}>
            <ShareIcon size={18} />
          </SmallButton>
        </div>
        {linkText && (
          <label className="block text-xs text-muted">
            Copying was blocked by the browser. Select the link and copy it yourself:
            <input
              readOnly
              value={linkText}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-1 block w-full rounded-lg border border-border bg-bg p-2 font-mono text-xs text-fg"
            />
          </label>
        )}
      </div>
    </div>
  );
}

function SmallButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-1 text-xs font-medium hover:border-accent/60 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
      {label}
    </button>
  );
}
