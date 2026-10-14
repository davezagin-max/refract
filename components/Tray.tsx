"use client";

import type { PointerEvent, ReactNode } from "react";
import type { Placement, Puzzle } from "@/lib/engine/puzzle";
import { LockIcon } from "./icons";
import { PieceIcon } from "./PieceIcon";

interface Props {
  puzzle: Puzzle;
  placements: readonly Placement[];
  locked: readonly boolean[];
  /** Tray index selected for tap-to-place, or null. */
  held: number | null;
  /** Tray index being dragged, or null. */
  dragging: number | null;
  disabled: boolean;
  /** Before the first move: make the pieces the obvious place to start. */
  beckon?: boolean;
  /** Shown in the header on phones instead of the title (the one-line how-to). */
  intro?: ReactNode;
  cellLabel: (cell: number) => string;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, index: number) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onSelect: (index: number, fromKeyboard: boolean) => void;
}

/** The pieces the player has to place. Each is a real button, so the tray works without a mouse. */
export function Tray({
  puzzle,
  placements,
  locked,
  held,
  dragging,
  disabled,
  beckon = false,
  intro,
  cellLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSelect,
}: Props) {
  const waiting = placements.filter((placement) => placement === null).length;
  const status =
    held !== null
      ? "Now tap a cell"
      : beckon && waiting > 0
        ? "Drag one onto the board"
        : waiting > 0
          ? `${waiting} to place`
          : "All on the board";
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5 lg:p-3">
      {/* One line, whatever it shows, so swapping the how-to for the title moves nothing below. */}
      <div className="mb-1.5 flex h-4 items-center justify-between gap-2 lg:mb-2">
        {intro && <div className="@container min-w-0 flex-1 lg:hidden">{intro}</div>}
        <h2
          className={`text-xs font-medium uppercase tracking-wider text-muted ${intro ? "hidden lg:block" : ""}`}
        >
          Your pieces
        </h2>
        <p
          className={`text-xs ${beckon && held === null && waiting > 0 ? "font-medium text-accent" : "text-muted"} ${intro ? "hidden lg:block" : ""}`}
        >
          {status}
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {puzzle.tray.map((kind, index) => {
          const placement = placements[index];
          const isHeld = held === index;
          const where = locked[index]
            ? `locked by a hint at ${cellLabel((placement as { cell: number }).cell)}`
            : placement
              ? `on the board at ${cellLabel(placement.cell)}`
              : "in the tray";
          return (
            <li key={index}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={isHeld}
                aria-label={`Piece ${index + 1}: ${kind}, ${where}`}
                title={`${kind[0].toUpperCase()}${kind.slice(1)}`}
                onPointerDown={(event) => {
                  if (event.button === 0) onPointerDown(event, index);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onLostPointerCapture={onPointerCancel}
                onClick={(event) => onSelect(index, event.detail === 0)}
                className={`relative grid h-14 w-14 touch-none select-none place-items-center rounded-xl border transition-colors ${
                  isHeld
                    ? "border-accent bg-raised shadow-[0_0_0_2px_rgba(94,230,255,0.35)]"
                    : locked[index]
                      ? "border-gold/70 bg-surface"
                      : placement
                        ? "border-dashed border-border bg-transparent"
                        : `border-border bg-raised hover:border-accent/70 ${beckon ? "beckon" : ""}`
                } ${dragging === index ? "opacity-30" : ""} disabled:cursor-default`}
              >
                <PieceIcon
                  kind={kind}
                  orient={placement?.orient ?? 0}
                  size={40}
                  className={placement && !isHeld ? "opacity-35" : ""}
                />
                {locked[index] && (
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-bg">
                    <LockIcon size={12} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
