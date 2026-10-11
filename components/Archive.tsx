"use client";

import { useState } from "react";
import { EPOCH, addDays, dayNumber, daysBetween, isPlayable, weekday } from "@/lib/engine/daily";
import { tierForDate, type TierName } from "@/lib/engine/schedule";
import { formatTime } from "@/lib/game/share";
import { streaks, type History } from "@/lib/game/stats";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIER_PIPS: Record<TierName, number> = { easy: 1, medium: 2, hard: 3, expert: 4 };

const firstOf = (month: string) => `${month}-01`;

function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

interface Props {
  today: string;
  /** The day currently on the board. */
  current: string;
  history: History;
  /** Dates with a saved game that is not finished. */
  inProgress: ReadonlySet<string>;
  onPick: (date: string) => void;
}

/** Every past puzzle, as a calendar. Any day from the first one to today can be played. */
export function Archive({ today, current, history, inProgress, onPick }: Props) {
  const [month, setMonth] = useState(current.slice(0, 7));
  const stats = streaks(history, today);
  const first = firstOf(month);
  const days = daysBetween(first, firstOf(shiftMonth(month, 1)));
  const lead = (weekday(first) + 6) % 7; // Monday first
  const [year, monthNumber] = month.split("-").map(Number);

  return (
    <div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Streak", stats.current],
          ["Best", stats.best],
          ["Solved", stats.solved],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-bg/60 py-2">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</dt>
            <dd className="font-mono text-xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={month <= EPOCH.slice(0, 7)}
          aria-label="Previous month"
          className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg disabled:opacity-30"
        >
          <ChevronLeftIcon />
        </button>
        <h3 aria-live="polite" className="text-sm font-semibold">
          {MONTHS[monthNumber - 1]} {year}
        </h3>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= today.slice(0, 7)}
          aria-label="Next month"
          className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg disabled:opacity-30"
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((name) => (
          <div key={name} className="py-1 text-[11px] font-medium uppercase text-muted">
            <span aria-hidden="true">{name.slice(0, 2)}</span>
            <span className="sr-only">{name}</span>
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = addDays(first, i);
          const playable = isPlayable(date, today);
          const done = history[date];
          const tier = tierForDate(date);
          const started = inProgress.has(date) && !done;
          const label = [
            `${WEEKDAYS[(weekday(date) + 6) % 7]} ${i + 1} ${MONTHS[monthNumber - 1]}`,
            playable ? `puzzle ${dayNumber(date)}, ${tier}` : date > today ? "not out yet" : "before the first puzzle",
            done ? `solved in ${done.moves} moves, ${formatTime(done.timeMs)}` : started ? "in progress" : "",
            date === today ? "today" : "",
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={date}
              type="button"
              disabled={!playable}
              onClick={() => onPick(date)}
              aria-label={label}
              aria-current={date === current ? "date" : undefined}
              className={`relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-lg border text-sm transition-colors ${
                date === current
                  ? "border-accent bg-raised"
                  : done
                    ? "border-success/40 bg-success/10 hover:border-success"
                    : "border-border bg-bg/50 hover:border-accent/60"
              } disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:text-muted/40`}
            >
              <span className={`font-mono tabular-nums ${date === today ? "font-bold text-accent" : ""}`}>
                {i + 1}
              </span>
              {playable && (
                <span aria-hidden="true" className="mt-0.5 flex h-2 items-center gap-0.5">
                  {done ? (
                    <span className="text-success">
                      <CheckIcon size={12} />
                    </span>
                  ) : (
                    Array.from({ length: TIER_PIPS[tier] }, (_, pip) => (
                      <span
                        key={pip}
                        className={`h-1 w-1 rounded-full ${started ? "bg-gold" : "bg-muted/70"}`}
                      />
                    ))
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Dots show difficulty, which follows the week: Monday and Tuesday are easy, Wednesday and
        Thursday medium, Friday and Saturday hard, Sunday expert. Gold dots mark a game in progress.
        Only puzzles solved on their own day count toward the streak.
      </p>
    </div>
  );
}
