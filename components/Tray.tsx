"use client";

import type { PointerEvent } from "react";
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
  cellLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSelect,
}: Props) {
  const waiting = placements.filter((placement) => placement === null).length;
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5 lg:p-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 lg:mb-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Your pieces</h2>
        <p className="text-xs text-muted">
          {held !== null
            ? "Now tap a cell"
            : waiting > 0
              ? `${waiting} to place`
              : "All on the board"}
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
                        : "border-border bg-raised hover:border-accent/70"
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
