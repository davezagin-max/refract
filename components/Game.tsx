"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cellAt, cellName } from "@/lib/engine/hex";
import { ORIENTATIONS } from "@/lib/engine/optics";
import { countLit, gridOf, placedPieces, type Placed, type Puzzle } from "@/lib/engine/puzzle";
import { trace } from "@/lib/engine/trace";
import { moveCursor, type ArrowKey } from "@/lib/game/cursor";
import { describeBoard, describeCell } from "@/lib/game/describe";
import { formatTime } from "@/lib/game/share";
import { play, playLit } from "@/lib/game/sound";
import {
  isFreeCell,
  newGame,
  nextHint,
  pieceAt,
  reduce,
  restore,
  serialize,
  type Action,
  type Beat,
  type GameState,
} from "@/lib/game/state";
import { KEYS, load, save } from "@/lib/game/storage";
import type { RendererHooks, Scene, ScenePiece } from "@/lib/render/renderer";
import { Board, type BoardApi } from "./Board";
import { HowTo } from "./HowTo";
import { HintIcon, RedoIcon, ResetIcon, UndoIcon } from "./icons";
import { PieceIcon } from "./PieceIcon";
import { Tray } from "./Tray";

export interface GameResult {
  moves: number;
  timeMs: number;
  hints: number;
  timeline: Beat[];
}

interface Props {
  /** Storage id of the saved game. */
  id: string;
  puzzle: Puzzle;
  /** The solution, used only for hints. Null turns the hint button off. */
  solution: readonly Placed[] | null;
  /** Day number, date and difficulty (or the editor's own title). */
  heading: ReactNode;
  /** Replaces the tray once the puzzle is solved. */
  result: (result: GameResult) => ReactNode;
  onSolved?: (result: GameResult) => void;
  showHowTo?: boolean;
  onInteract?: () => void;
}

/** How far above the finger a touch-dragged piece floats, so it stays visible. */
const TOUCH_LIFT = 48;

interface Press {
  pointerId: number;
  /** Tray index that would be dragged, or -1 when the press cannot start a drag. */
  index: number;
  origin: "tray" | "board";
  cell: number;
  x: number;
  y: number;
  touch: boolean;
  reverse: boolean;
  dragging: boolean;
}

interface Drag {
  index: number;
  over: number;
  ok: boolean;
  size: number;
}

/** A stopwatch that only runs while the tab is visible. */
function useStopwatch(initialMs: number, running: boolean) {
  const base = useRef(initialMs);
  const since = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(initialMs);
  const read = useCallback(
    () => base.current + (since.current === null ? 0 : performance.now() - since.current),
    [],
  );
  useEffect(() => {
    if (!running) return;
    const pause = () => {
      if (since.current === null) return;
      base.current += performance.now() - since.current;
      since.current = null;
    };
    const sync = () => {
      if (document.visibilityState !== "visible") pause();
      else if (since.current === null) since.current = performance.now();
      setElapsed(read());
    };
    if (document.visibilityState === "visible") since.current = performance.now();
    const timer = window.setInterval(() => setElapsed(read()), 250);
    document.addEventListener("visibilitychange", sync);
    return () => {
      pause();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [running, read]);
  return { elapsed, read };
}

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

export function Game({
  id,
  puzzle,
  solution,
  heading,
  result,
  onSolved,
  showHowTo = false,
  onInteract,
}: Props) {
  const grid = useMemo(() => gridOf(puzzle), [puzzle]);
  // Read the saved game once, before the first render, so nothing can overwrite it with a blank one.
  const [initial] = useState(
    () => restore(puzzle, load(KEYS.game(id))) ?? { state: newGame(puzzle), elapsedMs: 0 },
  );
  const [state, setState] = useState<GameState>(initial.state);
  const stateRef = useRef(state);
  const [final, setFinal] = useState<GameResult | null>(() =>
    initial.state.solved
      ? {
          moves: initial.state.moves,
          timeMs: initial.elapsedMs,
          hints: initial.state.hints,
          timeline: initial.state.timeline,
        }
      : null,
  );
  const [celebrated, setCelebrated] = useState(initial.state.solved);
  const [held, setHeld] = useState<{ index: number; orient: number } | null>(null);
  const [cursor, setCursor] = useState(() => cellAt(grid, 0, 0));
  const [keyboard, setKeyboard] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [message, setMessage] = useState("");

  const boardApi = useRef<BoardApi | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);

  const { elapsed, read } = useStopwatch(initial.elapsedMs, state.moves > 0 && !state.solved);

  // Persist after every move, and once more when the tab is hidden so the clock is saved too.
  useEffect(() => {
    if (state.moves > 0) save(KEYS.game(id), serialize(state, read()));
  }, [id, state, read]);
  useEffect(() => {
    const flush = () => {
      const current = stateRef.current;
      if (current.moves > 0) save(KEYS.game(id), serialize(current, read()));
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [id, read]);

  // If the canvas never reports the end of the win sequence, show the result anyway.
  useEffect(() => {
    if (!state.solved || celebrated) return;
    const timer = window.setTimeout(() => setCelebrated(true), 2600);
    return () => window.clearTimeout(timer);
  }, [state.solved, celebrated]);

  const light = useMemo(
    () => trace(puzzle, placedPieces(puzzle, state.placements)).light,
    [puzzle, state.placements],
  );
  const lit = countLit(puzzle, light);
  const total = puzzle.targets.length;

  const litText = (s: GameState) =>
    `${countLit(puzzle, trace(puzzle, placedPieces(puzzle, s.placements)).light)} of ${total} targets lit.`;

  const apply = (action: Action): GameState | null => {
    const before = stateRef.current;
    const after = reduce(before, action);
    if (after === before) return null;
    onInteract?.(); // any move, including one made with the buttons, retires the how-to
    stateRef.current = after;
    setState(after);
    if (after.solved && !before.solved) {
      const done: GameResult = {
        moves: after.moves,
        timeMs: Math.round(read()),
        hints: after.hints,
        timeline: after.timeline,
      };
      setFinal(done);
      setHeld(null);
      onSolved?.(done);
    }
    return after;
  };

  const canDrop = (s: GameState, index: number, cell: number): boolean => {
    if (cell < 0 || s.solved || s.locked[index] || !isFreeCell(puzzle, cell)) return false;
    const occupant = pieceAt(s, cell);
    return occupant < 0 || occupant === index || !s.locked[occupant];
  };

  const outcome = (after: GameState, text: string) =>
    setMessage(after.solved ? `Solved in ${after.moves} moves. Every target is lit.` : `${text} ${litText(after)}`);

  const place = (index: number, cell: number, orient: number) => {
    const current = stateRef.current.placements[index];
    if (current && current.cell === cell && current.orient === orient) return;
    const after = apply({ type: "place", index, cell, orient });
    if (!after) return void play("deny");
    play("place");
    outcome(after, `${capital(puzzle.tray[index])} placed at ${cellName(grid, cell)}.`);
  };

  const rotate = (index: number, delta: number) => {
    const after = apply({ type: "rotate", index, delta });
    if (!after) return void play("deny");
    play("rotate");
    outcome(after, `${capital(puzzle.tray[index])} turned.`);
  };

  const takeBack = (index: number) => {
    const after = apply({ type: "remove", index });
    if (!after) return;
    play("remove");
    outcome(after, `${capital(puzzle.tray[index])} returned to the tray.`);
  };

  const undo = () => {
    const after = apply({ type: "undo" });
    if (!after) return;
    setHeld(null);
    play("rotate");
    outcome(after, "Undone.");
  };

  const redo = () => {
    const after = apply({ type: "redo" });
    if (!after) return;
    setHeld(null);
    play("rotate");
    outcome(after, "Redone.");
  };

  const reset = () => {
    const after = apply({ type: "reset" });
    if (!after) return;
    setHeld(null);
    play("remove");
    outcome(after, "Board cleared.");
  };

  const hint = () => {
    if (!solution) return;
    const next = nextHint(stateRef.current, solution);
    const after = next && apply({ type: "hint", solution });
    if (!next || !after) return;
    setHeld(null);
    play("hint");
    outcome(
      after,
      `Hint: ${puzzle.tray[next.index]} placed at ${cellName(grid, next.cell)} and locked.`,
    );
  };

  const toggleHeld = (index: number) => {
    const s = stateRef.current;
    if (s.solved) return;
    if (s.locked[index]) {
      play("deny");
      setMessage("That piece was placed by a hint and is locked.");
      return;
    }
    if (held?.index === index) {
      setHeld(null);
      return;
    }
    setHeld({ index, orient: s.placements[index]?.orient ?? 0 });
    setMessage(
      `${capital(puzzle.tray[index])} selected. Choose a cell to place it, or press Escape to cancel.`,
    );
  };

  // ---- Pointer: drag from the tray or the board, tap a piece to turn it ----

  const moveGhost = (x: number, y: number, size: number) => {
    const ghost = ghostRef.current;
    if (ghost) ghost.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
  };

  const startPress = (
    event: PointerEvent<HTMLElement>,
    origin: Press["origin"],
    index: number,
    cell: number,
  ) => {
    onInteract?.();
    suppressClick.current = false;
    const s = stateRef.current;
    const draggable = index >= 0 && !s.locked[index] && !s.solved && event.button === 0;
    press.current = {
      pointerId: event.pointerId,
      index: draggable ? index : -1,
      origin,
      cell,
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType === "touch",
      reverse: event.button === 2 || event.shiftKey,
      dragging: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic events; dragging still works inside the element.
    }
  };

  const onBoardPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    setKeyboard(false);
    const cell = boardApi.current?.cellAt(event.clientX, event.clientY) ?? -1;
    startPress(event, "board", cell >= 0 ? pieceAt(stateRef.current, cell) : -1, cell);
  };

  /** Mouse only: show that a piece can be grabbed, or that the selected one can go here. */
  const onBoardPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && !press.current?.dragging) {
      const s = stateRef.current;
      const cell = boardApi.current?.cellAt(event.clientX, event.clientY) ?? -1;
      const index = cell >= 0 ? pieceAt(s, cell) : -1;
      event.currentTarget.style.cursor =
        index >= 0 && !s.locked[index] && !s.solved
          ? "grab"
          : held && index < 0 && canDrop(s, held.index, cell)
            ? "pointer"
            : "";
    }
    onPointerMove(event);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== event.pointerId || p.index < 0) return;
    if (!p.dragging) {
      const moved = Math.hypot(event.clientX - p.x, event.clientY - p.y);
      if (moved < (p.touch ? 10 : 6)) return;
      p.dragging = true;
      setHeld(null);
    }
    const size = Math.round((boardApi.current?.unit() ?? 28) * 1.7);
    const x = event.clientX;
    const y = event.clientY - (p.touch ? TOUCH_LIFT : 0);
    moveGhost(x, y, size);
    const over = boardApi.current?.cellAt(x, y) ?? -1;
    const ok = canDrop(stateRef.current, p.index, over);
    setDrag((previous) =>
      previous && previous.index === p.index && previous.over === over && previous.ok === ok
        ? previous
        : { index: p.index, over, ok, size },
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== event.pointerId) return;
    press.current = null;
    if (p.dragging) {
      suppressClick.current = true;
      setDrag(null);
      const x = event.clientX;
      const y = event.clientY - (p.touch ? TOUCH_LIFT : 0);
      const over = boardApi.current?.cellAt(x, y) ?? -1;
      const s = stateRef.current;
      if (over < 0) takeBack(p.index);
      else if (canDrop(s, p.index, over)) place(p.index, over, s.placements[p.index]?.orient ?? 0);
      else play("deny");
      return;
    }
    if (p.origin !== "board" || p.cell < 0) return;
    // A tap on the board: turn the piece there, or put the selected piece down.
    const s = stateRef.current;
    const index = pieceAt(s, p.cell);
    if (index >= 0) {
      if (s.locked[index]) {
        play("deny");
        setMessage("That piece was placed by a hint and is locked.");
      } else {
        rotate(index, p.reverse ? -1 : 1);
      }
    } else if (held) {
      if (canDrop(s, held.index, p.cell)) {
        place(held.index, p.cell, held.orient);
        setHeld(null);
      } else {
        play("deny");
        setMessage("A piece cannot go there.");
      }
    }
  };

  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (press.current?.pointerId !== event.pointerId) return;
    press.current = null;
    setDrag(null);
  };

  // ---- Keyboard: a cursor on the board, pick up, place, turn ----

  const activate = () => {
    const s = stateRef.current;
    if (s.solved) return;
    const here = pieceAt(s, cursor);
    if (held) {
      const current = s.placements[held.index];
      if (current && current.cell === cursor && current.orient === held.orient) {
        setHeld(null);
        setMessage("Put back.");
      } else if (canDrop(s, held.index, cursor)) {
        place(held.index, cursor, held.orient);
        setHeld(null);
      } else {
        play("deny");
        setMessage("A piece cannot go there.");
      }
      return;
    }
    if (here >= 0) {
      if (s.locked[here]) {
        setMessage("That piece was placed by a hint and is locked.");
        return;
      }
      setHeld({ index: here, orient: s.placements[here]?.orient ?? 0 });
      setMessage(
        `${capital(puzzle.tray[here])} picked up. Arrow keys move it, R turns it, Enter puts it down.`,
      );
      return;
    }
    const next = s.placements.findIndex((placement) => placement === null);
    if (next >= 0 && isFreeCell(puzzle, cursor)) {
      setHeld({ index: next, orient: 0 });
      setMessage(
        `${capital(puzzle.tray[next])} from the tray. R turns it, Enter places it here, Escape cancels.`,
      );
    } else {
      setMessage(describeCell(puzzle, s.placements, light, cursor));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.altKey) return;
    const key = event.key;
    const lower = key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (lower === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (lower === "y") {
        event.preventDefault();
        redo();
      }
      return;
    }
    if (key === "Tab" || key === "Shift") return;
    onInteract?.();
    setKeyboard(true);
    const s = stateRef.current;
    if (key.startsWith("Arrow")) {
      event.preventDefault();
      const next = moveCursor(grid, cursor, key as ArrowKey);
      setCursor(next);
      setMessage(describeCell(puzzle, s.placements, light, next));
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      activate();
    } else if (lower === "r") {
      const delta = event.shiftKey ? -1 : 1;
      if (held) {
        const count = ORIENTATIONS[puzzle.tray[held.index]];
        setHeld({ index: held.index, orient: (held.orient + delta + count) % count });
        play("rotate");
      } else {
        const here = pieceAt(s, cursor);
        if (here >= 0) rotate(here, delta);
      }
    } else if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      const here = held ? held.index : pieceAt(s, cursor);
      setHeld(null);
      if (here >= 0) takeBack(here);
    } else if (lower === "z" || lower === "u") {
      if (event.shiftKey) redo();
      else undo();
    } else if (lower === "y") {
      redo();
    } else if (lower === "h") {
      hint();
    } else if (key === "Escape") {
      if (held) {
        setHeld(null);
        setMessage("Cancelled.");
      }
    } else if (/^[1-9]$/.test(key) && Number(key) <= puzzle.tray.length) {
      toggleHeld(Number(key) - 1);
    }
  };

  // ---- What the canvas shows ----

  const scene = useMemo<Scene>(() => {
    let preview: { index: number; cell: number; orient: number } | null = null;
    let hover: Scene["hover"] = null;
    const droppable = (index: number, cell: number) => {
      if (cell < 0 || state.solved || state.locked[index] || !isFreeCell(puzzle, cell)) return false;
      const occupant = pieceAt(state, cell);
      return occupant < 0 || occupant === index || !state.locked[occupant];
    };
    if (drag) {
      if (drag.over >= 0) hover = { cell: drag.over, ok: drag.ok };
      if (drag.ok) {
        preview = {
          index: drag.index,
          cell: drag.over,
          orient: state.placements[drag.index]?.orient ?? 0,
        };
      }
    } else if (held && keyboard) {
      if (droppable(held.index, cursor)) {
        preview = { index: held.index, cell: cursor, orient: held.orient };
      } else {
        hover = { cell: cursor, ok: false };
      }
    }
    const pieces: ScenePiece[] = [];
    state.placements.forEach((placement, i) => {
      if (!placement) return;
      if (preview && preview.index === i) return; // shown as the preview instead
      if (drag && drag.index === i) return; // lifted off the board
      if (preview && preview.cell === placement.cell) return; // would go back to the tray
      pieces.push({
        key: `t${i}`,
        cell: placement.cell,
        kind: puzzle.tray[i],
        orient: placement.orient,
        style: state.locked[i] ? "locked" : "movable",
      });
    });
    if (preview) {
      pieces.push({
        key: `p${preview.index}`,
        cell: preview.cell,
        kind: puzzle.tray[preview.index],
        orient: preview.orient,
        style: "preview",
      });
    }
    return { puzzle, pieces, cursor: keyboard ? cursor : null, hover, solved: state.solved };
  }, [puzzle, state, drag, held, keyboard, cursor]);

  const hooks = useMemo<RendererHooks>(
    () => ({
      onTargetLit: (count, of) => playLit(count, of),
      onWinStart: () => play("win"),
      onWinEnd: () => setCelebrated(true),
    }),
    [],
  );

  const canHint = solution !== null && !state.solved && nextHint(state, solution) !== null;
  const canReset = !state.solved && state.placements.some((p, i) => p !== null && !state.locked[i]);
  const shownTime = final ? final.timeMs : elapsed;
  const summary = useMemo(
    () => describeBoard(puzzle, state.placements, light),
    [puzzle, state.placements, light],
  );
  const descriptionId = `board-status-${id.replace(/[^a-z0-9]/gi, "-")}`;

  const details = (
    <details className="group rounded-xl border border-border bg-surface/60 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-muted hover:text-fg">
        Board in words
        <span aria-hidden="true" className="text-xs group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="space-y-1 px-3 pb-3 text-muted">
        {summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
  const howTo = showHowTo && !state.solved;

  return (
    <div className="game-shell mx-auto w-full max-w-[1140px]">
      <div className="game-grid">
        <div className="game-meta flex items-end justify-between gap-3 px-3 pt-2 lg:flex-col lg:items-stretch lg:gap-4 lg:px-0 lg:pt-0">
          <div className="min-w-0">{heading}</div>
          <dl className="flex shrink-0 gap-4 text-right lg:gap-0 lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:text-left">
            <Stat label="Lit" value={`${lit}/${total}`} highlight={lit === total} />
            <Stat label="Moves" value={String(state.moves)} />
            <Stat label="Time" value={formatTime(shownTime)} />
          </dl>
        </div>

        <section className="game-board relative" aria-label="Puzzle board">
          <Board
            scene={scene}
            hooks={hooks}
            apiRef={boardApi}
            className="absolute inset-0"
            role="application"
            aria-roledescription="puzzle board"
            aria-label="Puzzle board. Arrow keys move the cursor. Enter picks up or places a piece, R turns it, Backspace returns it to the tray, Z undoes, H gives a hint."
            aria-describedby={descriptionId}
            onPointerDown={onBoardPointerDown}
            onPointerMove={onBoardPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onFocus={(event) => setKeyboard(event.currentTarget.matches(":focus-visible"))}
            onBlur={() => setKeyboard(false)}
          />
          {howTo && (
            // On a phone the steps float over the foot of the board, so dismissing
            // them on the first touch moves nothing under the player's finger.
            <div className="pointer-events-none absolute inset-x-3 bottom-1 lg:hidden">
              <HowTo />
            </div>
          )}
          <p id={descriptionId} className="sr-only">
            {lit} of {total} targets lit. {state.solved ? "Solved." : ""}
          </p>
          <p role="status" aria-live="polite" className="sr-only">
            {message}
          </p>
        </section>

        <div className="game-panel flex flex-col gap-3 px-3 pb-3 lg:px-0 lg:pb-0">
          {celebrated && final ? (
            result(final)
          ) : (
            <>
              <Tray
                puzzle={puzzle}
                placements={state.placements}
                locked={state.locked}
                held={held?.index ?? null}
                dragging={drag?.index ?? null}
                disabled={state.solved}
                cellLabel={(cell) => cellName(grid, cell)}
                onPointerDown={(event, index) => startPress(event, "tray", index, -1)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onSelect={(index, fromKeyboard) => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onInteract?.();
                  toggleHeld(index);
                  if (fromKeyboard && held?.index !== index) boardApi.current?.focus();
                }}
              />
              <div className="grid grid-cols-4 gap-2">
                <ActionButton label="Undo" onClick={undo} disabled={state.undo.length === 0 || state.solved}>
                  <UndoIcon />
                </ActionButton>
                <ActionButton label="Redo" onClick={redo} disabled={state.redo.length === 0 || state.solved}>
                  <RedoIcon />
                </ActionButton>
                <ActionButton
                  label={state.hints > 0 ? `Hint (${state.hints})` : "Hint"}
                  onClick={hint}
                  disabled={!canHint}
                  title="Place one piece where it belongs and lock it"
                >
                  <HintIcon />
                </ActionButton>
                <ActionButton label="Clear" onClick={reset} disabled={!canReset}>
                  <ResetIcon />
                </ActionButton>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="game-extra flex flex-col gap-3 px-3 pb-4 lg:px-0 lg:pb-0">
        {howTo && (
          <div className="hidden lg:block">
            <HowTo />
          </div>
        )}
        {details}
      </div>

      <div
        ref={ghostRef}
        aria-hidden="true"
        className={`pointer-events-none fixed left-0 top-0 z-40 rounded-2xl border border-accent/70 bg-raised/80 ${
          drag && !drag.ok ? "block" : "hidden"
        }`}
      >
        {drag && (
          <PieceIcon
            kind={puzzle.tray[drag.index]}
            orient={state.placements[drag.index]?.orient ?? 0}
            size={drag.size}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="lg:flex-1 lg:border-l lg:border-border lg:px-4 lg:py-3 lg:first:border-l-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`font-mono text-base tabular-nums lg:text-xl ${highlight ? "text-success" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  title,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface px-1 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface sm:flex-row sm:gap-2 sm:text-sm"
    >
      {children}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
